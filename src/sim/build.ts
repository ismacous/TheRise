import { BUILDINGS } from '../data/buildings';
import type { GoodId } from '../data/goods';
import type { Building } from './types';

/**
 * What a site still costs to finish, and what taking one down costs in time.
 *
 * A new building pays its definition's price. A ruin being put back on its
 * feet pays a share of it: the walls are standing, the foundations are there,
 * and what was salvaged from the rubble already sits on the plot and counts
 * towards the bill. The share is a share and not a flat sum on purpose — the
 * grander the original, the dearer the repair, exactly as asked, without a
 * second table of numbers to keep in step with the first.
 */

/** Share of a new build's materials and coin a repair costs. */
export const REPAIR_COST_SHARE = 0.55;
/** Share of a new build's work a repair costs. It is labour, not money. */
export const REPAIR_WORK_SHARE = 0.75;

/**
 * Share of a build's work that pulling it down costs.
 *
 * Demolition used to be instantaneous, which made a ruin a button rather than
 * a decision, and made "clear this and build there instead" free. Taking a
 * house apart is quicker than putting one up, but it is not nothing.
 */
const DEMOLISH_WORK_SHARE = 0.4;
const MIN_DEMOLISH_WORK = 18;

/**
 * True for a site that is a repair rather than a new build.
 *
 * A ruin counts even before the player agrees to raise it: the panel has to
 * quote the repair price to be worth reading, and quoting the full price and
 * then charging less would be a strange way to make the offer.
 */
export function isRepair(b: Building): boolean {
  return b.repairing || b.state === 'ruined';
}

/** Materials this site still needs delivered before work can start. */
export function siteCost(b: Building): Partial<Record<GoodId, number>> {
  const cost = BUILDINGS[b.def].cost;
  if (!isRepair(b)) return cost;
  const out: Partial<Record<GoodId, number>> = {};
  for (const [g, amount] of Object.entries(cost)) {
    const scaled = Math.round((amount as number) * REPAIR_COST_SHARE);
    if (scaled > 0) out[g as GoodId] = scaled;
  }
  return out;
}

/** Work units this site needs before it opens. */
export function siteWork(b: Building): number {
  const work = BUILDINGS[b.def].buildWork;
  return isRepair(b) ? Math.max(10, Math.round(work * REPAIR_WORK_SHARE)) : work;
}

/** Coin a repair costs up front. */
export function repairGoldCost(b: Building): number {
  return Math.round(BUILDINGS[b.def].goldCost * REPAIR_COST_SHARE);
}

/** Work units needed to pull a building down. */
export function demolishWork(b: Building): number {
  const def = BUILDINGS[b.def];
  // A ruin is already half down, so clearing it is quicker than demolishing
  // a standing building of the same size.
  const share = b.state === 'ruined' ? DEMOLISH_WORK_SHARE * 0.5 : DEMOLISH_WORK_SHARE;
  return Math.max(MIN_DEMOLISH_WORK, Math.round(def.buildWork * share));
}

/** True once every material a site needs is on the plot. */
export function hasAllMaterials(b: Building): boolean {
  for (const [g, need] of Object.entries(siteCost(b))) {
    if ((b.delivered[g as GoodId] ?? 0) < (need as number)) return false;
  }
  return true;
}
