import { clamp } from '../core/util';
import { BUILDINGS } from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import {
  SATIETY_PER_NUTRITION,
  buildingSpace,
  dropCarried,
  isStuck,
  carryCapacity,
  clearTask,
  depositIntoBuilding,
  extraYields,
  findHarvestNode,
  harvestStandPoint,
  moveTowards,
  releaseNode,
  wanderTarget,
  workRate,
  yieldFromNode,
} from './villagers';
import { hasAllMaterials as siteHasAllMaterials, siteWork } from './build';
import { siteErrand, siteStocked, workshopErrand } from './supply';
import { outputMultiplier } from './levels';
import { recordOutput } from './output';
import { activeRecipe } from './recipes';
import type { Building, HaulJob, Villager, VillagerTask } from './types';
import type { World } from './world';

const NIGHT_START = 0.9;
const NIGHT_END = 0.2;

export function isNight(dayFraction: number): boolean {
  return dayFraction > NIGHT_START || dayFraction < NIGHT_END;
}

/** One villager, one simulation step. */
export function updateVillager(world: World, v: Villager, dt: number): void {
  if (v.taskCooldown > 0) v.taskCooldown -= dt;
  if (v.profession === 'child') {
    updateChild(world, v, dt);
    return;
  }

  // A destination that cannot be reached must never hold a villager hostage.
  // Eating is the exception: dropping the task here only made the survival
  // override below re-issue it against the same unreachable larder, forever.
  // `doEat` abandons it too, but remembers which larder to skip.
  if (isStuck(v) && v.task.kind !== 'none' && v.task.kind !== 'wander' && v.task.kind !== 'eat') {
    abandonTask(world, v);
    return;
  }

  // ── Survival overrides, in priority order ───────────────────────────────
  if (v.task.kind !== 'eat' && v.satiety < 32) {
    releaseNode(world, v);
    clearTask(v);
    v.task = { kind: 'eat', phase: 0 };
  }
  if (v.task.kind === 'none' && isNight(world.time.dayFraction) && v.energy < 55 && v.homeId) {
    v.task = { kind: 'sleep', phase: 0 };
  }

  switch (v.task.kind) {
    case 'eat':
      doEat(world, v, dt);
      return;
    case 'sleep':
      doSleep(world, v, dt);
      return;
    case 'douse':
      doDouse(world, v, dt);
      return;
    case 'haul':
      doHaul(world, v, dt);
      return;
    case 'build':
      doBuild(world, v, dt);
      return;
    case 'harvest':
      doHarvest(world, v, dt);
      return;
    case 'produce':
      doProduce(world, v, dt);
      return;
    case 'wander':
      doWander(world, v, dt);
      return;
    default:
      pickTask(world, v);
  }
}

/**
 * Drops whatever the villager was doing when the destination turns out to be
 * unreachable, returning any carried load to the stores and flagging the
 * building so the player can see why it stopped.
 */
function abandonTask(world: World, v: Villager): void {
  const target = v.task.toId ?? v.task.targetId ?? v.task.fromId;
  if (target !== undefined && target > 0) {
    const b = world.buildings.get(target);
    if (b) b.stall = 'Accès bloqué';
  }
  dropCarried(world, v);
  releaseNode(world, v);
  releaseJob(world, v);
  clearTask(v);
  v.taskCooldown = 1.5;
}

function updateChild(world: World, v: Villager, dt: number): void {
  // Children eat too. They used to play until they starved: this branch
  // returned before the survival override, so every child born in the village
  // was dead within a quarter of an hour and only immigration ever grew the
  // population. A test now keeps a newborn alive to adulthood.
  if (v.task.kind === 'eat' || v.satiety < 40) {
    if (v.task.kind !== 'eat') {
      clearTask(v);
      v.task = { kind: 'eat', phase: 0 };
    }
    doEat(world, v, dt);
    return;
  }
  v.state = 'relaxing';
  if (v.task.kind !== 'wander') {
    const t = wanderTarget(world, v, world.rng);
    v.task = { kind: 'wander' };
    v.targetX = t.x;
    v.targetY = t.y;
  }
  if (moveTowards(world, v, dt, v.targetX, v.targetY, 0.6)) {
    v.idleFor += dt;
    if (v.idleFor > world.rng.range(2, 7)) {
      v.idleFor = 0;
      clearTask(v);
    }
  }
}

// ── Task selection ─────────────────────────────────────────────────────────

function pickTask(world: World, v: Villager): void {
  v.idleFor += 0.1;
  // Re-scanning the job board every tick for a villager that has nothing to do
  // is pure waste; back off and try again shortly.
  if (v.taskCooldown > 0) {
    v.state = 'idle';
    return;
  }
  const work = v.workId ? world.buildings.get(v.workId) : null;
  if (work && work.state === 'active' && work.enabled) {
    const def = BUILDINGS[work.def];
    // Before anything else: a worker whose bench is short of something goes
    // and gets it. Nobody else in the village has to notice, and nothing else
    // can outbid the errand — see `sim/supply.ts`.
    const errand = workshopErrand(world, work);
    if (errand) {
      v.task = {
        kind: 'haul',
        fromId: errand.from.id,
        toId: work.id,
        good: errand.good,
        amount: errand.amount,
        phase: 0,
      };
      return;
    }
    if (def.gather) {
      v.task = { kind: 'harvest', targetId: work.id, phase: 0 };
      return;
    }
    if (def.recipe || def.service || def.livestock || def.id === 'forester_hut') {
      v.task = { kind: 'produce', targetId: work.id, phase: 0 };
      return;
    }
  }

  // Carriers, builders and the unemployed share the logistics backlog.
  if (v.profession === 'carrier' || v.profession === 'builder' || v.profession === 'idle') {
    const job = findSiteJob(world, v);
    if (job) {
      v.task = job;
      return;
    }
    const round = claimHaulJob(world, v);
    if (round) {
      v.task = {
        kind: 'haul',
        fromId: round.fromId,
        toId: round.toId,
        good: round.good,
        amount: round.amount,
        phase: 0,
      };
      return;
    }
  }

  if (v.idleFor > 1.5) {
    const t = wanderTarget(world, v, world.rng);
    v.task = { kind: 'wander' };
    v.targetX = t.x;
    v.targetY = t.y;
    v.idleFor = 0;
  } else {
    v.state = 'idle';
    v.taskCooldown = 0.4 + world.rng.next() * 0.4;
  }
}

/**
 * What this builder should do about the village's building sites: raise one
 * that has its materials, or carry a missing material to one that has not.
 *
 * Sites are tried nearest first, and a site whose missing material is in no
 * depot at all is skipped rather than reserved — a builder standing next to a
 * plot waiting for planks that do not exist helps nobody.
 */
function findSiteJob(world: World, v: Villager): VillagerTask | null {
  if (world.constructionSites.length === 0) return null;
  const candidates: Array<{ b: Building; d: number }> = [];
  for (const b of world.constructionSites) {
    const isUpgrade = b.state === 'active' && b.upgrade !== null;
    const isDemolition = b.demolish !== null;
    if (!isUpgrade && !isDemolition && b.state !== 'planned' && b.state !== 'building') continue;
    const builders = countBuildersOn(world, b.id);
    if (builders >= 4) continue;
    candidates.push({ b, d: (b.cx - v.x) ** 2 + (b.cy - v.y) ** 2 + builders * 400 });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.d - b.d);

  // Only a handful are worth considering: the nearest few. Walking the whole
  // list asking every depot about every material would cost a scan of the
  // village per idle builder per second.
  const limit = Math.min(candidates.length, 6);
  for (let i = 0; i < limit; i++) {
    const b = candidates[i].b;
    if (b.demolish || (b.state === 'active' && b.upgrade) || siteStocked(b)) {
      return { kind: 'build', targetId: b.id, phase: 0 };
    }
    const errand = siteErrand(world, b, v);
    if (errand) {
      return {
        kind: 'haul',
        fromId: errand.from.id,
        toId: b.id,
        good: errand.good,
        amount: errand.amount,
        phase: 0,
      };
    }
  }
  return null;
}

function countBuildersOn(world: World, id: number): number {
  let n = 0;
  for (const v of world.villagers) if (v.task.kind === 'build' && v.task.targetId === id) n++;
  return n;
}

export function hasAllMaterials(_world: World, b: Building): boolean {
  return siteHasAllMaterials(b);
}

/** Picks the nearest useful unclaimed job. Endpoints are already resolved. */
function claimHaulJob(world: World, v: Villager) {
  let best: HaulJob | null = null;
  let bestScore = Infinity;
  // A porter employed at a depot answers to that depot first: its own rounds
  // are what the player staffed it for, and a warehouse whose people wander
  // off to the far side of the village is a warehouse that does nothing.
  const depotId = v.workId;
  for (const job of world.haulJobs) {
    if (job.claimedBy !== 0) continue;
    const from = world.buildings.get(job.fromId);
    if (!from) continue;
    const d = (from.cx - v.x) ** 2 + (from.cy - v.y) ** 2;
    const ownRound = depotId !== 0 && job.toId === depotId ? 2200 : 0;
    const score = d - job.priority * 900 - ownRound;
    if (score < bestScore) {
      bestScore = score;
      best = job;
    }
  }
  if (best) best.claimedBy = v.id;
  return best;
}

// ── Task implementations ───────────────────────────────────────────────────

function doHarvest(world: World, v: Villager, dt: number): void {
  const b = world.buildings.get(v.task.targetId!);
  if (!b || b.state !== 'active' || !b.enabled) {
    releaseNode(world, v);
    clearTask(v);
    return;
  }
  const def = BUILDINGS[b.def];
  const g = def.gather!;

  if (v.task.phase === 0) {
    // Choose a node and walk to it.
    if (!v.task.nodeId) {
      // Refuse to work when the camp is full or consumables are missing.
      // Safety valve: if the porters cannot keep up, the gatherer runs a load
      // to the storehouse himself rather than downing tools.
      const capacity = BUILDINGS[b.def].storage?.capacity ?? 0;
      if (buildingSpace(world, b) < Math.max(6, capacity * 0.4)) {
        b.stall = 'Stock plein';
        v.task = { kind: 'haul', fromId: b.id, toId: -1, phase: 0, good: dominantGood(b) ?? undefined };
        if (!v.task.good) {
          clearTask(v);
          v.state = 'idle';
        }
        return;
      }
      if (g.consumes) {
        for (const [good, need] of Object.entries(g.consumes)) {
          if ((b.inv[good as GoodId] ?? 0) < (need as number)) {
            b.stall = `Manque ${GOODS[good as GoodId].name}`;
            clearTask(v);
            v.state = 'idle';
            v.idleFor += dt;
            return;
          }
        }
      }
      const node = findHarvestNode(world, b, v);
      if (!node) {
        b.stall = 'Aucune ressource à portée';
        clearTask(v);
        v.state = 'idle';
        v.idleFor += dt;
        return;
      }
      if (node.maxAmount <= 1) node.claimedBy = v.id;
      v.task.nodeId = node.id;
      b.stall = null;
    }
    const node = world.nodes.get(v.task.nodeId!);
    if (!node || !node.alive) {
      v.task.nodeId = undefined;
      return;
    }
    const stand = harvestStandPoint(world, node);
    v.state = 'walking';
    if (moveTowards(world, v, dt, stand.x, stand.y, node.kind === 'fish_shoal' ? 2.2 : 0.8)) {
      v.task.phase = 1;
      v.work = 0;
    }
    return;
  }

  if (v.task.phase === 1) {
    const node = world.nodes.get(v.task.nodeId!);
    if (!node || !node.alive || node.amount <= 0) {
      v.task.nodeId = undefined;
      v.task.phase = 0;
      return;
    }
    v.state = 'working';
    v.work += workRate(world, v, def.profession) * dt;
    b.efficiency = clamp(b.efficiency + dt * 0.4, 0, 1);
    if (v.work < g.work) return;

    v.work = 0;
    const out = yieldFromNode(world, b, node);
    // A felled tree or a downed animal gives its whole yield: the node's own
    // "amount" is a stock counter for veins and bushes, not a per-trip cap.
    const consumedWhole = g.fells === true || node.maxAmount <= 1;
    const taken = consumedWhole ? out.amount : Math.min(out.amount, node.amount);
    node.amount -= consumedWhole ? node.maxAmount : taken;
    if (consumedWhole || node.amount <= 0) world.killNode(node.id);
    node.claimedBy = 0;
    v.carrying = out.good;
    v.carryAmount = taken;
    recordOutput(b, out.good, taken);
    if (g.consumes) {
      for (const [good, need] of Object.entries(g.consumes)) {
        b.inv[good as GoodId] = Math.max(0, (b.inv[good as GoodId] ?? 0) - (need as number));
      }
    }
    for (const [good, amount] of extraYields(world, b)) {
      recordOutput(b, good, amount);
      depositIntoBuilding(world, b, good, amount);
    }
    v.task.nodeId = undefined;
    v.task.phase = 2;
    return;
  }

  // Phase 2: carry the load back to the camp.
  const entrance = world.entranceOf(b);
  v.state = 'hauling';
  if (moveTowards(world, v, dt, entrance.x, entrance.y, 0.9)) {
    if (v.carrying) {
      const leftover = depositIntoBuilding(world, b, v.carrying, v.carryAmount);
      if (leftover > 0) world.addToStock(v.carrying, leftover, b.cx, b.cy);
    }
    v.carrying = null;
    v.carryAmount = 0;
    v.task.phase = 0;
  }
}

function dominantGood(b: Building): GoodId | null {
  let best: GoodId | null = null;
  let amount = 0;
  for (const [g, a] of Object.entries(b.inv)) {
    if ((a as number) > amount) {
      amount = a as number;
      best = g as GoodId;
    }
  }
  return best;
}

function doProduce(world: World, v: Villager, dt: number): void {
  const b = world.buildings.get(v.task.targetId!);
  if (!b || b.state !== 'active' || !b.enabled) {
    clearTask(v);
    return;
  }
  const def = BUILDINGS[b.def];

  if (v.task.phase === 0) {
    v.state = 'walking';
    const target = workStation(world, b, v);
    if (moveTowards(world, v, dt, target.x, target.y, 1.1)) v.task.phase = 1;
    return;
  }

  v.state = 'working';

  // Pure service buildings (market, chapel, tavern, scholars) just need staff.
  if (!activeRecipe(b)) {
    b.efficiency = 1;
    b.stall = null;
    // Merchants and innkeepers drift around their stalls.
    if (world.rng.chance(dt * 0.25)) {
      const t = workStation(world, b, v);
      v.targetX = t.x;
      v.targetY = t.y;
    }
    moveTowards(world, v, dt, v.targetX, v.targetY, 0.6);
    return;
  }

  const recipe = activeRecipe(b);
  if (!recipe) {
    v.state = 'idle';
    return;
  }
  // Check inputs.
  //
  // Standing at the bench with nothing to work on used to be the end of it:
  // the task was kept, so the worker never went back through task selection
  // and never went to fetch anything. Dropping it here is what lets
  // `workshopErrand` send them to the nearest depot — which is the whole
  // point of workers fetching their own supplies.
  for (const [good, need] of Object.entries(recipe.inputs)) {
    if ((b.inv[good as GoodId] ?? 0) < (need as number)) {
      b.stall = `Manque ${GOODS[good as GoodId].name}`;
      b.efficiency = Math.max(0, b.efficiency - dt * 0.5);
      v.state = 'idle';
      clearTask(v);
      v.taskCooldown = 0.5;
      return;
    }
  }
  if (buildingSpace(world, b) < 8) {
    // The shed is full. Rather than down tools until a porter happens by, the
    // worker runs a load to a depot: the same valve the gatherers have.
    b.stall = 'Stock plein';
    b.efficiency = Math.max(0, b.efficiency - dt * 0.5);
    const spare = dominantGood(b);
    if (spare) {
      v.task = { kind: 'haul', fromId: b.id, toId: -1, good: spare, phase: 0 };
    } else {
      v.state = 'idle';
      clearTask(v);
      v.taskCooldown = 0.5;
    }
    return;
  }
  b.stall = null;

  // Fields and pastures are seasonal; workshops are not.
  const seasonal = def.category === 'farming' ? world.growthFactor() : 1;
  const fertility =
    def.category === 'farming' ? 0.55 + world.averageFertility(b.x, b.y, b.w, b.h) * 0.9 : 1;
  const rate = workRate(world, v, def.profession) * seasonal * fertility;
  v.work += rate * dt;
  b.work += rate * dt;
  b.efficiency = clamp(b.efficiency + dt * 0.35, 0, 1);

  // Farmers roam their field while they work; it reads far better.
  if (def.category === 'farming' && world.rng.chance(dt * 0.6)) {
    v.targetX = b.x + world.rng.range(0.5, b.w - 0.5);
    v.targetY = b.y + world.rng.range(0.5, b.h - 0.5);
  }
  if (def.category === 'farming') moveTowards(world, v, dt, v.targetX, v.targetY, 0.4);

  if (b.work >= recipe.work) {
    b.work -= recipe.work;
    for (const [good, need] of Object.entries(recipe.inputs)) {
      b.inv[good as GoodId] = Math.max(0, (b.inv[good as GoodId] ?? 0) - (need as number));
      if (!b.inv[good as GoodId]) delete b.inv[good as GoodId];
    }
    const yieldMul = world.modifiers.craftYield * outputMultiplier(b);
    for (const [good, amount] of Object.entries(recipe.outputs)) {
      const qty = Math.max(1, Math.round((amount as number) * yieldMul));
      recordOutput(b, good as GoodId, qty);
      const leftover = depositIntoBuilding(world, b, good as GoodId, qty);
      if (leftover > 0) world.addToStock(good as GoodId, leftover, b.cx, b.cy);
    }
  }
}

/** A stable per-worker spot inside or beside the building. */
function workStation(world: World, b: Building, v: Villager): { x: number; y: number } {
  const def = BUILDINGS[b.def];
  if (def.category === 'farming' || def.livestock) {
    const seed = (v.id * 2654435761) % 1000 / 1000;
    return {
      x: b.x + 0.7 + seed * (b.w - 1.4),
      y: b.y + 0.7 + ((v.id * 7) % 100) / 100 * (b.h - 1.4),
    };
  }
  return world.entranceOf(b);
}

function doHaul(world: World, v: Villager, dt: number): void {
  const good = v.task.good;
  if (!good) {
    clearTask(v);
    return;
  }

  if (v.task.phase === 0) {
    // Travel to the source and load up.
    const from = v.task.fromId === -1 ? world.findStoreWith(good, v.x, v.y) : world.buildings.get(v.task.fromId!);
    if (!from) {
      releaseJob(world, v);
      clearTask(v);
      return;
    }
    v.task.fromId = from.id;
    v.state = 'walking';
    const e = world.entranceOf(from);
    if (moveTowards(world, v, dt, e.x, e.y, 0.9)) {
      const want = Math.min(v.task.amount ?? 999, carryCapacity(world, good, v));
      const have = from.inv[good] ?? 0;
      const take = Math.min(want, have);
      if (take <= 0) {
        releaseJob(world, v);
        clearTask(v);
        return;
      }
      from.inv[good] = have - take;
      if (from.inv[good]! <= 0) delete from.inv[good];
      v.carrying = good;
      v.carryAmount = take;
      v.task.phase = 1;
    }
    return;
  }

  // Deliver.
  let to = v.task.toId === -1 ? null : world.buildings.get(v.task.toId!);
  if (!to) {
    to = world.findStoreForDeposit(good, v.x, v.y);
    if (!to) {
      // Nowhere to put it: drop the load back where we are, if possible.
      v.carrying = null;
      v.carryAmount = 0;
      releaseJob(world, v);
      clearTask(v);
      return;
    }
    v.task.toId = to.id;
  }
  v.state = 'hauling';
  const e = world.entranceOf(to);
  if (moveTowards(world, v, dt, e.x, e.y, 0.9)) {
    if (v.carrying) {
      let leftover: number;
      if (to.state === 'planned' || to.state === 'building') {
        to.delivered[v.carrying] = (to.delivered[v.carrying] ?? 0) + v.carryAmount;
        leftover = 0;
      } else {
        leftover = depositIntoBuilding(world, to, v.carrying, v.carryAmount);
      }
      if (leftover > 0) world.addToStock(v.carrying, leftover, to.cx, to.cy);
    }
    v.carrying = null;
    v.carryAmount = 0;
    completeJob(world, v);
    clearTask(v);
  }
}

function releaseJob(world: World, v: Villager): void {
  for (const j of world.haulJobs) if (j.claimedBy === v.id) j.claimedBy = 0;
}

function completeJob(world: World, v: Villager): void {
  world.haulJobs = world.haulJobs.filter((j) => j.claimedBy !== v.id);
}

function doBuild(world: World, v: Villager, dt: number): void {
  const b = world.buildings.get(v.task.targetId!);
  const upgrading = b?.state === 'active' && b.upgrade !== null;
  const demolishing = b?.demolish != null;
  if (!b || (!upgrading && !demolishing && b.state !== 'planned' && b.state !== 'building')) {
    clearTask(v);
    return;
  }
  if (v.task.phase === 0) {
    v.state = 'walking';
    const e = world.entranceOf(b);
    if (moveTowards(world, v, dt, e.x, e.y, 1.2)) v.task.phase = 1;
    return;
  }

  // Taking a building apart is the same job in reverse, and a little quicker.
  if (demolishing) {
    v.state = 'working';
    b.demolish!.progress += workRate(world, v, 'builder') * world.modifiers.buildSpeed * 1.6 * dt;
    if (b.demolish!.progress >= b.demolish!.total) {
      world.finishDemolish(b.id);
      clearTask(v);
    }
    return;
  }

  // Improvement works exactly like a build site, but on a running building.
  if (upgrading) {
    v.state = 'working';
    b.upgrade!.progress += workRate(world, v, 'builder') * world.modifiers.buildSpeed * 1.4 * dt;
    if (b.upgrade!.progress >= b.upgrade!.total) {
      world.finishUpgrade(b.id);
      clearTask(v);
    }
    return;
  }
  if (!hasAllMaterials(world, b)) {
    v.state = 'idle';
    b.stall = 'Matériaux manquants';
    clearTask(v);
    return;
  }
  b.stall = null;
  b.state = 'building';
  v.state = 'working';
  const def = BUILDINGS[b.def];
  const total = siteWork(b);
  b.buildProgress += workRate(world, v, 'builder') * world.modifiers.buildSpeed * 1.4 * dt;
  if (b.buildProgress >= total) {
    b.buildProgress = total;
    const repaired = b.repairing;
    b.repairing = false;
    b.state = 'active';
    b.efficiency = 0;
    world.emitter.emit('buildingCompleted', b);
    world.notify(
      repaired ? `${def.name} relevé de ses ruines` : `${def.name} terminé`,
      'build',
      'good',
      b.cx,
      b.cy,
    );
    clearTask(v);
  }
}

function doEat(world: World, v: Villager, dt: number): void {
  if (v.task.phase === 0) {
    const source = findFoodSource(world, v, v.task.fromId);
    if (!source) {
      v.state = 'idle';
      // Starvation is handled by the population system; keep wandering meanwhile.
      v.task = { kind: 'wander' };
      const t = wanderTarget(world, v, world.rng);
      v.targetX = t.x;
      v.targetY = t.y;
      return;
    }
    v.task.targetId = source.id;
    v.task.phase = 1;
  }
  const b = world.buildings.get(v.task.targetId!);
  if (!b) {
    clearTask(v);
    return;
  }
  // Without this watchdog a villager whose larder turned out to be unreachable
  // walked at a wall until it starved, with the storehouses full. Every other
  // task had an escape; eating — the one that kills — did not.
  if (isStuck(v)) {
    b.stall = 'Accès bloqué';
    const blocked = b.id;
    clearTask(v);
    v.task = { kind: 'eat', phase: 0, fromId: blocked };
    return;
  }
  v.state = 'walking';
  const e = world.entranceOf(b);
  if (moveTowards(world, v, dt, e.x, e.y, 1.0)) {
    const good = bestFoodIn(b);
    if (!good) {
      clearTask(v);
      return;
    }
    b.inv[good] = (b.inv[good] ?? 0) - 1;
    if (b.inv[good]! <= 0) delete b.inv[good];
    v.satiety = Math.min(100, v.satiety + GOODS[good].nutrition * SATIETY_PER_NUTRITION);
    v.state = 'eating';
    if (v.satiety > 72) clearTask(v);
  }
}

/** `avoidId` skips a larder this villager has just failed to reach. */
function findFoodSource(world: World, v: Villager, avoidId?: number): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of world.buildingList) {
    if (b.state !== 'active' || b.id === avoidId) continue;
    const def = BUILDINGS[b.def];
    const isMarket = def.service?.kind === 'market';
    const isStore = def.storage?.global;
    if (!isMarket && !isStore) continue;
    if (!bestFoodIn(b)) continue;
    // Markets are strongly preferred: that is the whole point of building them.
    const d = (b.cx - v.x) ** 2 + (b.cy - v.y) ** 2 * (isMarket ? 0.35 : 1.8);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function bestFoodIn(b: Building): GoodId | null {
  let best: GoodId | null = null;
  let bestNutrition = 0;
  for (const [g, amount] of Object.entries(b.inv)) {
    if ((amount as number) <= 0) continue;
    const n = GOODS[g as GoodId].nutrition;
    if (n > bestNutrition) {
      bestNutrition = n;
      best = g as GoodId;
    }
  }
  return best;
}

function doSleep(world: World, v: Villager, dt: number): void {
  const home = v.homeId ? world.buildings.get(v.homeId) : null;
  if (!home) {
    v.energy = Math.min(100, v.energy + dt * 2);
    clearTask(v);
    return;
  }
  if (v.task.phase === 0) {
    v.state = 'walking';
    const e = world.entranceOf(home);
    if (moveTowards(world, v, dt, e.x, e.y, 0.8)) {
      v.task.phase = 1;
      // Tuck villagers inside so streets empty out at night.
      v.x = home.cx;
      v.y = home.cy;
      v.prevX = v.x;
      v.prevY = v.y;
    }
    return;
  }
  v.state = 'sleeping';
  v.energy = Math.min(100, v.energy + dt * 9);
  if (v.energy >= 99 || !isNight(world.time.dayFraction)) clearTask(v);
}

function doWander(world: World, v: Villager, dt: number): void {
  v.state = 'relaxing';
  if (moveTowards(world, v, dt, v.targetX, v.targetY, 0.6)) clearTask(v);
}

function doDouse(world: World, v: Villager, dt: number): void {
  const b = world.buildings.get(v.task.targetId!);
  if (!b || b.state !== 'burning') {
    clearTask(v);
    return;
  }
  v.state = 'walking';
  const e = world.entranceOf(b);
  if (moveTowards(world, v, dt, e.x, e.y, 1.6)) {
    v.state = 'working';
    // Comfortably faster than the fire grows, so a crew always wins eventually.
    const strength = v.profession === 'firewarden' ? 0.2 : 0.07;
    b.fire = Math.max(0, b.fire - strength * dt);
  }
}
