import { BUILDINGS } from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import { siteCost } from './build';
import { storageCapacity } from './levels';
import { activeRecipe, currentInputs } from './recipes';
import type { Building, Villager } from './types';
import type { World } from './world';

/**
 * Who fetches what, and from where.
 *
 * Everything used to go through one job board: a workshop short of logs
 * posted a request, a building site posted a request, and whichever carrier
 * happened to be nearest took whichever request scored best. It looked
 * reasonable and it behaved badly. A cottage sat at two logs out of twelve
 * for an entire evening while every log in the village went to the sawmill,
 * because the sawmill was closer to the storehouse than the building site was
 * and the priorities only bought the site thirty tiles of head start.
 *
 * The board is not the model any more. Three kinds of people move goods, and
 * each has its own rule:
 *
 * 1. **Depot porters** go out and bring finished goods *in*. That is the job
 *    the player staffed the warehouse for, and it stays on the board because
 *    it is genuinely a round: one porter, many workshops.
 * 2. **Workers fetch their own inputs.** A sawyer who needs logs goes and
 *    gets logs — from the nearest depot holding them, or straight from a
 *    woodcutters' camp if that is closer. Nobody else has to notice.
 * 3. **Builders fetch only from depots.** Never from a workshop, never from
 *    the far side of the map by accident: the nearest depot that holds the
 *    material, or nothing. That is what makes where you put a warehouse a
 *    decision — a big village wants depots near its building sites, or its
 *    builders spend the day walking.
 *
 * The result is that nothing competes. A site's materials are a builder's
 * errand, a workshop's inputs are its own workers' errand, and neither can
 * be quietly outbid by the other.
 */

/** A trip worth making: go to `from`, pick up `good`, bring it to the job. */
export interface Errand {
  from: Building;
  good: GoodId;
  amount: number;
}

/** Distance discount applied to depots, in squared tiles. */
const DEPOT_BONUS = 60;

/**
 * Does this building make `good`, as opposed to merely having some lying
 * about because it needs it?
 *
 * Without the distinction a sawmill would happily walk to another sawmill and
 * take the logs off its bench, and the two would pass each other on the road
 * for ever.
 */
function producesGood(b: Building, good: GoodId): boolean {
  const def = BUILDINGS[b.def];
  const recipe = activeRecipe(b);
  if (recipe && recipe.outputs[good] !== undefined) return true;
  const gather = def.gather;
  if (gather) {
    if (gather.outputs[good] !== undefined) return true;
    // A camp with no declared yield (the forester) stores whatever it brings
    // back, so its shed's accept list is the best answer available.
    for (const _ in gather.outputs) return false;
    return def.storage?.accepts?.includes(good) ?? false;
  }
  return false;
}

function isDepot(b: Building): boolean {
  return BUILDINGS[b.def].storage?.global === true;
}

/**
 * Nearest depot holding `good`. The only source a builder is allowed.
 */
export function findDepotWith(world: World, good: GoodId, x: number, y: number): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of world.depotList) {
    if ((b.inv[good] ?? 0) <= 0) continue;
    if (!world.accepts(b, good)) continue;
    const d = (b.cx - x) ** 2 + (b.cy - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/**
 * Where a workshop's own people may fetch an input: the nearest depot that
 * holds it, or the nearest building that makes it. The depot gets a small
 * head start, because a depot is meant to be the place you go.
 */
export function findInputSource(
  world: World,
  consumer: Building,
  good: GoodId,
  x: number,
  y: number,
): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of world.buildingList) {
    if (b.id === consumer.id || b.state !== 'active') continue;
    if ((b.inv[good] ?? 0) <= 0) continue;
    const depot = isDepot(b);
    if (!depot && !producesGood(b, good)) continue;
    const d = (b.cx - x) ** 2 + (b.cy - y) ** 2 - (depot ? DEPOT_BONUS : 0);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** How many of this building's workers are already out fetching `good`. */
function fetchersFor(world: World, b: Building, good: GoodId): number {
  let n = 0;
  for (const id of b.workers) {
    const v = world.villagerById.get(id);
    if (v && v.task.kind === 'haul' && v.task.toId === b.id && v.task.good === good) n++;
  }
  return n;
}

/**
 * The errand a worker at this building should run before going back to the
 * bench, or null when the shelves are stocked.
 *
 * The expensive half — finding the source — is done once a second for the
 * whole village by `planSupply` and read back here. A workshop with nothing
 * on its shelf drops its worker's task every half second, so asking each of
 * them to scan three hundred buildings for themselves was the one change in
 * this rework that actually cost measurable time.
 */
export function workshopErrand(world: World, b: Building): Errand | null {
  const planned = world.supplyPlan.get(b.id);
  if (planned === undefined || planned === null) return null;
  const from = world.buildings.get(planned.fromId);
  if (!from || from.state !== 'active' || (from.inv[planned.good] ?? 0) <= 0) return null;
  const capacity = storageCapacity(b) || 20;
  const have = b.inv[planned.good] ?? 0;
  const target = inputTarget(b, planned.good, capacity);
  const inFlight = fetchersFor(world, b, planned.good) * GOODS[planned.good].carry;
  if (have + inFlight >= target) return null;
  return { from, good: planned.good, amount: planned.amount };
}

/**
 * Works out, for every workshop, what it is short of and where to get it.
 * Called once a second from the building pass.
 */
export function planSupply(world: World): void {
  const plan = world.supplyPlan;
  plan.clear();
  for (const b of world.buildingList) {
    if (b.state !== 'active' || !b.enabled || b.workers.length === 0) continue;
    const errand = computeErrand(world, b);
    plan.set(b.id, errand ? { fromId: errand.from.id, good: errand.good, amount: errand.amount } : null);
  }
}

function computeErrand(world: World, b: Building): Errand | null {
  const def = BUILDINGS[b.def];
  // A depot's porters have their own rounds, and a market is served by the
  // board: neither fetches its own inputs.
  if (def.storage?.global || def.service?.kind === 'market') return null;
  if (currentInputs(b).length === 0) return null;
  const capacity = storageCapacity(b) || 20;

  for (const good of currentInputs(b)) {
    const have = b.inv[good] ?? 0;
    const target = inputTarget(b, good, capacity);
    if (have >= target) continue;
    // One trip per worker at a time, and never more trips than the shelf can
    // hold: four sawyers should not all come back with the same full load.
    const carry = GOODS[good].carry;
    const inFlight = fetchersFor(world, b, good) * carry;
    if (have + inFlight >= target) continue;
    const from = findInputSource(world, b, good, b.cx, b.cy);
    if (!from) continue;
    return { from, good, amount: Math.min(carry, target - have - inFlight) };
  }
  return null;
}

/** How much of an input a workshop likes to keep on the shelf. */
function inputTarget(b: Building, good: GoodId, capacity: number): number {
  const def = BUILDINGS[b.def];
  const per = activeRecipe(b)?.inputs[good] ?? def.gather?.consumes?.[good] ?? 1;
  return Math.min(Math.max(per * 6, GOODS[good].carry), Math.floor(capacity * 0.45));
}

/**
 * The next material a builder should carry to this site, taken only from a
 * depot. Returns null when the site is already stocked, or when nothing that
 * it needs is sitting in any depot.
 */
export function siteErrand(world: World, site: Building, v: Villager): Errand | null {
  for (const [g, need] of Object.entries(siteCost(site))) {
    const good = g as GoodId;
    const have = site.delivered[good] ?? 0;
    const missing = (need as number) - have;
    if (missing <= 0) continue;
    const carry = GOODS[good].carry;
    const inFlight = builderCarriersFor(world, site, good) * carry;
    if (missing - inFlight <= 0) continue;
    const from = findDepotWith(world, good, v.x, v.y);
    if (!from) continue;
    return { from, good, amount: Math.min(carry, missing - inFlight) };
  }
  return null;
}

/** Builders already on the road with this material for this site. */
function builderCarriersFor(world: World, site: Building, good: GoodId): number {
  let n = 0;
  for (const v of world.villagers) {
    if (v.task.kind === 'haul' && v.task.toId === site.id && v.task.good === good) n++;
  }
  return n;
}

/** True once every material a site needs is on the plot. */
export function siteStocked(b: Building): boolean {
  for (const [g, need] of Object.entries(siteCost(b))) {
    if ((b.delivered[g as GoodId] ?? 0) < (need as number)) return false;
  }
  return true;
}
