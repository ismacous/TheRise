import { BUILDINGS } from '../data/buildings';
import { RESEARCH, type ResearchId } from '../data/research';
import { computeModifiers } from './modifiers';
import type { World } from './world';

/** Research points produced per second by the whole village. */
export function researchRate(world: World): number {
  const adults = world.stats.adults;
  // A small flat trickle keeps a ten-person hamlet moving; the population term
  // is what makes a city research quickly.
  let rate = 0.05 + 0.018 * adults * (0.35 + world.stats.happiness / 100);

  for (const b of world.buildingList) {
    if (b.state !== 'active' || !b.enabled) continue;
    const def = BUILDINGS[b.def];
    if (def.service?.kind !== 'research') continue;
    const staffed = def.workers > 0 ? b.workers.length / def.workers : 1;
    let out = def.service.strength * staffed * 0.09;
    // Candles let scholars work after dark.
    if ((b.inv.candles ?? 0) > 0) out *= 1.35;
    rate += out;
  }
  return rate * world.modifiers.researchRate;
}

export function canStartResearch(world: World, id: ResearchId): { ok: boolean; reason: string } {
  const def = RESEARCH[id];
  if (!def) return { ok: false, reason: 'Inconnu' };
  if (world.research.completed.has(id)) return { ok: false, reason: 'Déjà étudié' };
  for (const req of def.requires) {
    if (!world.research.completed.has(req)) {
      return { ok: false, reason: `Requiert : ${RESEARCH[req].name}` };
    }
  }
  if (world.research.points < def.cost) {
    return { ok: false, reason: `${Math.ceil(def.cost - world.research.points)} points manquants` };
  }
  return { ok: true, reason: '' };
}

export function startResearch(world: World, id: ResearchId): boolean {
  const check = canStartResearch(world, id);
  if (!check.ok) return false;
  if (world.research.active) {
    if (!world.research.queue.includes(id)) world.research.queue.push(id);
    return true;
  }
  world.research.points -= RESEARCH[id].cost;
  world.research.active = id;
  world.research.progress = 0;
  return true;
}

export function cancelResearch(world: World): void {
  const active = world.research.active;
  if (!active) return;
  // Refund the unspent share so cancelling is never a trap.
  const def = RESEARCH[active];
  const remaining = 1 - world.research.progress / def.duration;
  world.research.points += def.cost * remaining * 0.8;
  world.research.active = null;
  world.research.progress = 0;
}

export function updateResearch(world: World, dt: number): void {
  world.research.points += researchRate(world) * dt;

  const active = world.research.active;
  if (!active) {
    // Auto-start the next queued topic once it becomes affordable.
    for (let i = 0; i < world.research.queue.length; i++) {
      const id = world.research.queue[i];
      if (canStartResearch(world, id).ok) {
        world.research.queue.splice(i, 1);
        startResearch(world, id);
        break;
      }
    }
    return;
  }

  const def = RESEARCH[active];
  world.research.progress += dt;
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
}

export function availableResearch(world: World): ResearchId[] {
  const out: ResearchId[] = [];
  for (const id of Object.keys(RESEARCH) as ResearchId[]) {
    if (world.research.completed.has(id)) continue;
    const def = RESEARCH[id];
    if (def.requires.every((r) => world.research.completed.has(r))) out.push(id);
  }
  return out;
}
