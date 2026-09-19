import { BUILDINGS, type BuildingId, type Recipe } from '../data/buildings';
import type { GoodId } from '../data/goods';
import type { Building } from './types';

/** The recipe a workshop is currently set to produce. */
export function activeRecipe(b: Building): Recipe | undefined {
  const def = BUILDINGS[b.def];
  if (def.recipes && def.recipes.length > 0) {
    return def.recipes[Math.min(b.recipeIndex, def.recipes.length - 1)];
  }
  return def.recipe;
}

export function recipeOptions(defId: BuildingId): Recipe[] {
  const def = BUILDINGS[defId];
  if (def.recipes && def.recipes.length > 0) return def.recipes;
  return def.recipe ? [def.recipe] : [];
}

export function setRecipe(b: Building, index: number): void {
  const options = recipeOptions(b.def);
  if (index < 0 || index >= options.length) return;
  if (index === b.recipeIndex) return;
  b.recipeIndex = index;
  b.work = 0;
  b.stall = null;
}

/**
 * Goods the building currently consumes.
 *
 * Memoised by (type, recipe), because the answer only depends on those two
 * and this is asked often enough to matter: a starved workshop asks it every
 * half-second, per worker, and a set plus an array per call added up to real
 * time in a city of three hundred buildings.
 */
const inputCache = new Map<string, GoodId[]>();

export function currentInputs(b: Building): GoodId[] {
  const key = `${b.def}:${b.recipeIndex}`;
  const cached = inputCache.get(key);
  if (cached) return cached;
  const r = activeRecipe(b);
  const out = new Set<GoodId>();
  if (r) for (const g of Object.keys(r.inputs)) out.add(g as GoodId);
  const gather = BUILDINGS[b.def].gather;
  if (gather?.consumes) for (const g of Object.keys(gather.consumes)) out.add(g as GoodId);
  const list = [...out];
  inputCache.set(key, list);
  return list;
}

/** Goods the building currently produces. */
export function currentOutputs(b: Building): GoodId[] {
  const r = activeRecipe(b);
  const out = new Set<GoodId>();
  if (r) for (const g of Object.keys(r.outputs)) out.add(g as GoodId);
  const def = BUILDINGS[b.def];
  if (def.gather) {
    const keys = Object.keys(def.gather.outputs);
    if (keys.length === 0) {
      for (const g of def.storage?.accepts ?? []) out.add(g);
    } else {
      for (const g of keys) out.add(g as GoodId);
    }
  }
  return [...out];
}
