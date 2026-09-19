import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { GoodId } from '../data/goods';
import type { Building } from './types';

/**
 * Every building can be improved. Families with a visual identity per tier —
 * a shack becoming a cottage, a fishing hut becoming a harbour — swap to the
 * next definition. Everything else gains an in-place level.
 *
 * The player only ever sees one button, so the two mechanisms must agree on
 * what a level means: more worker slots, more output, a wider working radius.
 */
export const MAX_IN_PLACE_LEVEL = 3;

/** Extra worker slots granted per in-place level. */
const SLOTS_PER_LEVEL = 1;
/** Output multiplier granted per in-place level. */
const OUTPUT_PER_LEVEL = 0.35;
/** Working-radius multiplier granted per in-place level. */
const RADIUS_PER_LEVEL = 0.18;

/**
 * Highest level this building may reach.
 *
 * `cap` is the ceiling the research tree currently allows. It starts at 1:
 * improving anything at all is something the player studies for, rather than
 * a button that has always been there.
 */
export function maxLevelOf(defId: BuildingId, cap = MAX_IN_PLACE_LEVEL): number {
  return BUILDINGS[defId].upgradesTo ? 1 : Math.min(MAX_IN_PLACE_LEVEL, Math.max(1, cap));
}

/** Worker slots this building currently offers. */
export function workerSlots(b: Building): number {
  const def = BUILDINGS[b.def];
  if (def.workers <= 0) return 0;
  return def.workers + (b.level - 1) * SLOTS_PER_LEVEL;
}

/** Multiplier on everything this building produces. */
export function outputMultiplier(b: Building): number {
  return 1 + (b.level - 1) * OUTPUT_PER_LEVEL;
}

/** Multiplier on a gathering or service radius. */
export function radiusMultiplier(b: Building): number {
  return 1 + (b.level - 1) * RADIUS_PER_LEVEL;
}

export function gatherRadius(b: Building): number {
  const g = BUILDINGS[b.def].gather;
  return g ? g.radius * radiusMultiplier(b) : 0;
}

export function serviceRadius(b: Building): number {
  const s = BUILDINGS[b.def].service;
  return s ? s.radius * radiusMultiplier(b) : 0;
}

/**
 * How far a depot's own porters go looking for goods to bring in. Zero for
 * anything that is not a collecting depot.
 */
export function collectRadius(b: Building): number {
  const r = BUILDINGS[b.def].storage?.collect ?? 0;
  return r > 0 ? r * radiusMultiplier(b) : 0;
}

export function storageCapacity(b: Building): number {
  const def = BUILDINGS[b.def];
  if (!def.storage) return 0;
  if (def.storage.fixed) return def.storage.capacity;
  return Math.floor(def.storage.capacity * (1 + (b.level - 1) * 0.5));
}

export function housingCapacity(b: Building): number {
  const def = BUILDINGS[b.def];
  if (!def.housing) return 0;
  return def.housing.capacity + (b.level - 1) * Math.max(1, Math.round(def.housing.capacity * 0.4));
}

export interface UpgradeTarget {
  /** Definition to swap to, or null for an in-place level. */
  toDef: BuildingId | null;
  toLevel: number;
  name: string;
  cost: Partial<Record<GoodId, number>>;
  goldCost: number;
  work: number;
}

/**
 * What improving this building would produce, or null when it cannot be
 * improved — either because it is maxed out or because `cap`, the ceiling the
 * research tree allows, has not been raised that far yet.
 */
export function upgradeTargetOf(b: Building, cap = MAX_IN_PLACE_LEVEL): UpgradeTarget | null {
  const def = BUILDINGS[b.def];
  if (def.upgradesTo) {
    const next = BUILDINGS[def.upgradesTo];
    return {
      toDef: def.upgradesTo,
      toLevel: 1,
      name: next.name,
      cost: next.cost,
      goldCost: next.goldCost,
      work: Math.max(30, next.buildWork * 0.7),
    };
  }
  if (b.level >= maxLevelOf(b.def, cap)) return null;
  const level = b.level + 1;
  // An in-place level costs a growing share of the original build.
  const scale = 0.7 + (level - 2) * 0.5;
  const cost: Partial<Record<GoodId, number>> = {};
  for (const [g, amount] of Object.entries(def.cost)) {
    cost[g as GoodId] = Math.max(1, Math.round((amount as number) * scale));
  }
  return {
    toDef: null,
    toLevel: level,
    name: `${def.name} ${'I'.repeat(level)}`,
    cost,
    goldCost: Math.round(def.goldCost * scale) + 10 * level,
    work: Math.max(25, def.buildWork * 0.6 * scale),
  };
}

/** Display name including the level, e.g. "Scierie II". */
export function displayName(b: Building): string {
  const def = BUILDINGS[b.def];
  return b.level > 1 ? `${def.name} ${'I'.repeat(b.level)}` : def.name;
}
