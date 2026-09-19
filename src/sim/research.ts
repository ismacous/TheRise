import { BUILDINGS } from '../data/buildings';
import { MAX_TIER, RESEARCH, researchOfTier, type ResearchId } from '../data/research';
import { outputMultiplier } from './levels';
import { computeModifiers } from './modifiers';
import type { Building } from './types';
import type { World } from './world';

/** Share of a study's cost handed back when the player abandons it. */
const CANCEL_REFUND = 0.8;

/** Universities that are standing, staffed or not. */
export function universities(world: World): Building[] {
  return world.buildingList.filter(
    (b) => b.state === 'active' && b.enabled && BUILDINGS[b.def].service?.kind === 'research',
  );
}

/** Scholars currently at work across every university. */
export function scholarCount(world: World): number {
  let n = 0;
  for (const b of universities(world)) n += b.workers.length;
  return n;
}

/**
 * Seconds of study earned per second of play. Zero without a university: the
 * tree is unreachable until the village decides to fund one. Every scholar
 * assigned makes it noticeably faster, which is the whole point of staffing
 * the place.
 */
export function researchSpeed(world: World): number {
  let speed = 0;
  for (const b of universities(world)) {
    // An empty hall still ticks over — slowly enough that nobody mistakes it
    // for a substitute for scholars.
    let out = 0.35 + 0.55 * b.workers.length;
    out *= outputMultiplier(b);
    // Candles let them keep reading after dusk.
    if ((b.inv.candles ?? 0) > 0) out *= 1.35;
    speed += out;
  }
  return speed * world.modifiers.researchRate;
}

export function hasUniversity(world: World): boolean {
  return universities(world).length > 0;
}

/** True once every study of that era is done. */
export function tierComplete(world: World, tier: number): boolean {
  return researchOfTier(tier).every((d) => world.research.completed.has(d.id));
}

/**
 * Highest era the player may study in. An era opens only when the previous one
 * is finished, so a production chain is never half-unlocked.
 */
export function unlockedTier(world: World): number {
  let tier = 1;
  while (tier < MAX_TIER && tierComplete(world, tier)) tier++;
  return tier;
}

export function tierProgress(world: World, tier: number): [number, number] {
  const defs = researchOfTier(tier);
  return [defs.filter((d) => world.research.completed.has(d.id)).length, defs.length];
}

export function canStartResearch(world: World, id: ResearchId): { ok: boolean; reason: string } {
  const def = RESEARCH[id];
  if (!def) return { ok: false, reason: 'Inconnu' };
  if (world.research.completed.has(id)) return { ok: false, reason: 'Déjà étudié' };
  if (!hasUniversity(world)) return { ok: false, reason: 'Construisez une université' };
  if (def.tier > unlockedTier(world)) {
    return { ok: false, reason: `Terminez l'ère ${def.tier - 1} d'abord` };
  }
  if (world.treasury < def.cost) {
    return { ok: false, reason: `${Math.ceil(def.cost - world.treasury)} pièces manquantes` };
  }
  return { ok: true, reason: '' };
}

/** Everything the player could pay for right now, or queue for later. */
export function canQueueResearch(world: World, id: ResearchId): boolean {
  if (world.research.completed.has(id)) return false;
  if (world.research.active === id) return false;
  if (world.research.queue.includes(id)) return false;
  return RESEARCH[id].tier <= unlockedTier(world);
}

export function startResearch(world: World, id: ResearchId): boolean {
  if (!canQueueResearch(world, id)) return false;
  // Something is already on the desk: fall back to the queue, which pays as
  // soon as the coin is there.
  if (world.research.active) {
    world.research.queue.push(id);
    return true;
  }
  if (!canStartResearch(world, id).ok) {
    world.research.queue.push(id);
    return true;
  }
  world.spend(RESEARCH[id].cost, 'research');
  world.research.active = id;
  world.research.progress = 0;
  return true;
}

export function dequeueResearch(world: World, id: ResearchId): void {
  const i = world.research.queue.indexOf(id);
  if (i >= 0) world.research.queue.splice(i, 1);
}

export function cancelResearch(world: World): void {
  const active = world.research.active;
  if (!active) return;
  // Refund the unspent share so cancelling is never a trap.
  const def = RESEARCH[active];
  const remaining = 1 - world.research.progress / def.duration;
  world.earn(def.cost * remaining * CANCEL_REFUND, 'gift');
  world.research.active = null;
  world.research.progress = 0;
}

export function updateResearch(world: World, dt: number): void {
  const speed = researchSpeed(world);
  world.stats.researchRate = speed;

  const active = world.research.active;
  if (!active) {
    // Take the next queued topic as soon as it becomes affordable.
    for (let i = 0; i < world.research.queue.length; i++) {
      const id = world.research.queue[i];
      if (world.research.completed.has(id)) {
        world.research.queue.splice(i, 1);
        i--;
        continue;
      }
      if (canStartResearch(world, id).ok) {
        world.research.queue.splice(i, 1);
        world.spend(RESEARCH[id].cost, 'research');
        world.research.active = id;
        world.research.progress = 0;
        break;
      }
    }
    return;
  }

  const def = RESEARCH[active];
  world.research.progress += speed * dt;
  if (world.research.progress < def.duration) return;

  world.research.completed.add(active);
  world.research.active = null;
  world.research.progress = 0;
  world.modifiers = computeModifiers(world.research.completed);

  // Richer veins are applied retroactively so the perk feels immediate.
  for (const e of def.effects) {
    if (e.kind === 'deposit_richness') {
      for (const n of world.nodes.values()) {
        if (n.kind === 'coal_vein' || n.kind === 'iron_vein' || n.kind === 'gold_vein') {
          n.amount = Math.round(n.amount * e.mul);
          n.maxAmount = Math.round(n.maxAmount * e.mul);
        }
      }
    }
  }

  world.emitter.emit('researchCompleted', { id: active });
  const unlocked = def.unlocks.map((b) => BUILDINGS[b].name).join(', ');
  world.notify(
    unlocked ? `${def.name} : ${unlocked} débloqué` : `${def.name} achevé`,
    def.icon,
    'good',
  );
  const tier = def.tier;
  if (tierComplete(world, tier) && tier < MAX_TIER) {
    world.notify(`Ère ${tier} achevée : une nouvelle ère s'ouvre`, 'era', 'good');
  }
}

/** Studies the player may pay for or queue right now. */
export function availableResearch(world: World): ResearchId[] {
  const max = unlockedTier(world);
  return (Object.keys(RESEARCH) as ResearchId[]).filter(
    (id) => !world.research.completed.has(id) && RESEARCH[id].tier <= max,
  );
}
