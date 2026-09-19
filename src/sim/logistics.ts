import { BUILDINGS } from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import { collectRadius, storageCapacity } from './levels';
import { currentInputs, currentOutputs } from './recipes';
import type { HaulJob } from './types';
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
function push(
  world: World,
  jobs: HaulJob[],
  j: Omit<HaulJob, 'id' | 'claimedBy'>,
  queued?: Set<string>,
): void {
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
  queued?.add(`${fromId}:${toId}:${j.good}`);
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
  // Jobs queued during this rebuild, so a collection round never scans the
  // whole board looking for a duplicate of itself.
  const queuedKey = new Set(claimedKey);

  const foodShort = world.stats.foodDays < 4;

  for (const b of world.buildingList) {
    const def = BUILDINGS[b.def];

    // 1. Building sites are not on this board.
    //
    // They used to be, and it was the worst bug in the game: a cottage sat at
    // two logs out of twelve while every log in the village went to the
    // sawmill, because the sawmill stood nearer the storehouse and priority 6
    // against priority 5 buys a site thirty tiles of head start, no more.
    // Materials for a site are a builder's errand now, taken from a depot —
    // see `sim/supply.ts`.
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

    // 3. Nor are a workshop's inputs. Its own people fetch them, which is
    //    both what a sawyer would actually do and the only arrangement in
    //    which a workshop cannot be starved by a busier neighbour.

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

    // 5. A staffed depot sends its own porters out on a round.
    //
    // Rule 2 already offers a workshop's output to whoever is nearest, but it
    // only fires once a workshop has a full load waiting. A depot with people
    // in it does better than that: it empties the small stuff too, so a
    // carpenter is never sitting on three chairs nobody thought worth a trip.
    if (def.storage?.global && def.storage.collect && b.workers.length > 0) {
      const radius = collectRadius(b);
      const free = storageCapacity(b) - world.usedOf(b);
      // One round per porter on duty. Queueing a job for every workshop in
      // range every second would fill the board and cost a scan of the whole
      // village for each depot.
      let rounds = b.workers.length;
      if (free > 12) {
        for (const source of world.buildingList) {
          if (rounds <= 0) break;
          if (source.id === b.id || source.state !== 'active') continue;
          const sourceDef = BUILDINGS[source.def];
          if (sourceDef.storage?.global || sourceDef.service?.kind === 'market') continue;
          if ((source.cx - b.cx) ** 2 + (source.cy - b.cy) ** 2 > radius * radius) continue;
          for (const g of outputGoods(source)) {
            const have = source.inv[g] ?? 0;
            if (have < 1) continue;
            if (!world.accepts(b, g)) continue;
            if (queuedKey.has(`${source.id}:${b.id}:${g}`)) continue;
            push(
              world,
              jobs,
              {
                good: g,
                amount: have,
                fromId: source.id,
                toId: b.id,
                // Above ordinary shipping, below construction and food relief,
                // so a collection round never starves a building site.
                priority: 4,
              },
              queuedKey,
            );
            rounds--;
            break;
          }
        }
      }
    }

    // 6. Chapel and scholars burn candles.
    if ((b.def === 'chapel' || b.def === 'university') && (b.inv.candles ?? 0) < 10) {
      if (world.stockOf('candles') > 0 && !claimedKey.has(`-1:${b.id}:candles`)) {
        push(world, jobs, { good: 'candles', amount: 8, fromId: -1, toId: b.id, priority: 2 });
      }
    }
  }

  world.haulJobs = jobs;
  // Pulling a building down is builders' work too, so a demolition belongs on
  // the same list the builders read.
  world.constructionSites = world.buildingList.filter(
    (b) =>
      b.demolish !== null ||
      b.state === 'planned' ||
      b.state === 'building' ||
      b.upgrade !== null,
  );
}

function countInFlight(jobs: HaulJob[], toId: number, good: GoodId): number {
  let n = 0;
  for (const j of jobs) if (j.toId === toId && j.good === good) n += j.amount;
  return n;
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
