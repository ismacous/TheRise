import { BUILDINGS } from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import { storageCapacity } from './levels';
import { activeRecipe, currentInputs, currentOutputs } from './recipes';
import type { Building, HaulJob } from './types';
import type { World } from './world';

const MAX_JOBS = 160;

/** Goods a building produces (and therefore wants shipped out). */
export const outputGoods = currentOutputs;

/** Goods a building consumes (and therefore wants delivered). */
export const inputGoods = currentInputs;

/**
 * Adds a job, resolving any "-1" endpoint (meaning "whichever storehouse
 * suits") to a concrete building straight away. Resolving lazily meant every
 * idle villager re-scanned every storehouse for every job, every tick.
 */
function push(world: World, jobs: HaulJob[], j: Omit<HaulJob, 'id' | 'claimedBy'>): void {
  if (jobs.length >= MAX_JOBS) return;
  let { fromId, toId } = j;
  if (fromId === -1) {
    const anchor = toId === -1 ? null : world.buildings.get(toId);
    const store = world.findStoreWith(j.good, anchor?.cx ?? world.startX, anchor?.cy ?? world.startY);
    if (!store) return;
    fromId = store.id;
  }
  if (toId === -1) {
    const anchor = world.buildings.get(fromId);
    const store = world.findStoreForDeposit(j.good, anchor?.cx ?? world.startX, anchor?.cy ?? world.startY);
    if (!store) return;
    toId = store.id;
  }
  if (fromId === toId) return;
  jobs.push({ ...j, fromId, toId, id: world.allocJobId(), claimedBy: 0 });
}

/**
 * Rebuilds the haul board. Claimed jobs are preserved so carriers already on
 * the road are never yanked off a delivery.
 */
export function rebuildHaulJobs(world: World): void {
  const kept = world.haulJobs.filter((j) => j.claimedBy !== 0);
  const jobs: HaulJob[] = [...kept];
  const claimedKey = new Set(kept.map((j) => `${j.fromId}:${j.toId}:${j.good}`));

  const foodShort = world.stats.foodDays < 4;

  for (const b of world.buildingList) {
    const def = BUILDINGS[b.def];

    // 1. Construction sites pulling in their materials.
    if (b.state === 'planned' || b.state === 'building') {
      for (const [g, need] of Object.entries(def.cost)) {
        const have = b.delivered[g as GoodId] ?? 0;
        const inFlight = countInFlight(jobs, b.id, g as GoodId);
        const missing = (need as number) - have - inFlight;
        if (missing <= 0) continue;
        if (world.stockOf(g as GoodId) <= 0) continue;
        const key = `-1:${b.id}:${g}`;
        if (claimedKey.has(key)) continue;
        push(world, jobs, {
          good: g as GoodId,
          amount: Math.min(missing, GOODS[g as GoodId].carry * 2),
          fromId: -1,
          toId: b.id,
          priority: 6,
        });
      }
      continue;
    }
    if (b.state !== 'active') continue;

    // 2. Ship finished goods out to the storehouses.
    if (!def.storage?.global) {
      for (const g of outputGoods(b)) {
        const have = b.inv[g] ?? 0;
        const threshold = def.service?.kind === 'market' ? 1e9 : Math.max(4, GOODS[g].carry);
        if (have < threshold) continue;
        const key = `${b.id}:-1:${g}`;
        if (claimedKey.has(key)) continue;
        push(world, jobs, {
          good: g,
          amount: have,
          fromId: b.id,
          toId: -1,
          priority: foodShort && GOODS[g].nutrition > 0 ? 7 : 3,
        });
      }
    }

    // 3. Pull raw inputs in.
    for (const g of inputGoods(b)) {
      const have = b.inv[g] ?? 0;
      const target = targetInputStock(world, b, g);
      const inFlight = countInFlight(jobs, b.id, g);
      if (have + inFlight >= target) continue;
      if (world.stockOf(g) <= 0) continue;
      const key = `-1:${b.id}:${g}`;
      if (claimedKey.has(key)) continue;
      push(world, jobs, {
        good: g,
        amount: Math.min(target - have - inFlight, GOODS[g].carry * 2),
        fromId: -1,
        toId: b.id,
        priority: 5,
      });
    }

    // 4. Keep markets stocked with food and comfort goods.
    if (def.service?.kind === 'market') {
      const cap = storageCapacity(b);
      const used = world.usedOf(b);
      if (used >= cap * 0.85) continue;
      const wanted = marketWishlist(world);
      // Stalls hold a few days of demand, not the entire reserve: a market that
      // empties the storehouses makes the whole village look like it is starving.
      const perGoodCeiling = Math.max(8, Math.round(world.stats.population * 0.9));
      for (const g of wanted) {
        const have = b.inv[g] ?? 0;
        const perGood = Math.min(
          perGoodCeiling,
          Math.floor((cap / Math.max(3, wanted.length)) * 0.9),
        );
        const inFlight = countInFlight(jobs, b.id, g);
        if (have + inFlight >= perGood) continue;
        if (world.stockOf(g) <= 2) continue;
        const key = `-1:${b.id}:${g}`;
        if (claimedKey.has(key)) continue;
        push(world, jobs, {
          good: g,
          amount: Math.min(perGood - have - inFlight, GOODS[g].carry * 2),
          fromId: -1,
          toId: b.id,
          priority: GOODS[g].nutrition > 0 ? 8 : 4,
        });
      }
    }

    // 5. Chapel and scholars burn candles.
    if ((b.def === 'chapel' || b.def === 'scholars_hall') && (b.inv.candles ?? 0) < 10) {
      if (world.stockOf('candles') > 0 && !claimedKey.has(`-1:${b.id}:candles`)) {
        push(world, jobs, { good: 'candles', amount: 8, fromId: -1, toId: b.id, priority: 2 });
      }
    }
  }

  world.haulJobs = jobs;
  world.constructionSites = world.buildingList.filter(
    (b) => b.state === 'planned' || b.state === 'building' || b.upgrade !== null,
  );
}

function countInFlight(jobs: HaulJob[], toId: number, good: GoodId): number {
  let n = 0;
  for (const j of jobs) if (j.toId === toId && j.good === good) n += j.amount;
  return n;
}

function targetInputStock(_world: World, b: Building, g: GoodId): number {
  const def = BUILDINGS[b.def];
  const per = activeRecipe(b)?.inputs[g] ?? def.gather?.consumes?.[g] ?? 1;
  const cap = storageCapacity(b) || 20;
  // Keep roughly six batches on hand, bounded by the building's own shed.
  return Math.min(Math.max(per * 6, GOODS[g].carry), Math.floor(cap * 0.45));
}

function marketWishlist(world: World): GoodId[] {
  const out: GoodId[] = [];
  for (const g of ['bread', 'meat', 'smoked_fish', 'fish', 'eggs', 'berries'] as GoodId[]) {
    if ((world.stock[g] ?? 0) > 3) out.push(g);
  }
  for (const g of ['clothes', 'boots', 'furniture', 'candles', 'ale'] as GoodId[]) {
    if ((world.stock[g] ?? 0) > 3) out.push(g);
  }
  return out;
}
