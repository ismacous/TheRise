import { describe, expect, it } from 'vitest';
import { createNewGame, computeStats } from '../src/sim/simulation';
import { BUILDINGS } from '../src/data/buildings';
import {
  canStartResearch,
  scholarCount,
  startResearch,
  unlockedTier,
} from '../src/sim/research';
import { orderBuy, orderSell } from '../src/sim/economy';
import { GOODS, ALL_GOOD_IDS } from '../src/data/goods';
import { workerSlots } from '../src/sim/levels';
import {
  ALL_RESEARCH_IDS,
  MAX_TIER,
  RESEARCH,
  researchOfTier,
  TIER_NAMES,
} from '../src/data/research';
import type { BuildingId } from '../src/data/buildings';
import type { World } from '../src/sim/world';

function run(sim: ReturnType<typeof createNewGame>, seconds: number): void {
  const steps = Math.round(seconds / 0.1);
  for (let i = 0; i < steps; i++) sim.tick(0.1);
}

/** Drops a finished building on the first legal spot spiralling out of town. */
function placeNearStart(w: World, def: BuildingId) {
  for (let r = 3; r < 60; r++) {
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      const x = Math.round(w.startX + Math.cos(ang) * r);
      const y = Math.round(w.startY + Math.sin(ang) * r);
      if (!w.canPlace(def, x, y).ok) continue;
      const b = w.place(def, x, y, 0, true);
      if (b) return b;
    }
  }
  return null;
}

describe('world generation', () => {
  it('produces a walkable start location with resources nearby', () => {
    const sim = createNewGame({ seed: 'test-1' });
    const w = sim.world;
    expect(w.map.width).toBeGreaterThan(100);
    expect(w.map.walkable(Math.floor(w.startX), Math.floor(w.startY))).toBe(true);

    let trees = 0;
    w.nodeGrid.query(w.startX, w.startY, 30, (n) => {
      if (n.kind === 'tree' && n.alive) trees++;
    });
    expect(trees).toBeGreaterThan(20);
  });

  it('is deterministic for a given seed', () => {
    const a = createNewGame({ seed: 'determinism' });
    const b = createNewGame({ seed: 'determinism' });
    expect(a.world.startX).toBe(b.world.startX);
    expect(a.world.startY).toBe(b.world.startY);
    expect(a.world.nodes.size).toBe(b.world.nodes.size);
  });
});

describe('data integrity', () => {
  it('never unlocks a building before the era that supplies its inputs', () => {
    // A study's era must be at least that of every research its unlocked
    // buildings depend on through their recipe inputs. Half a chain is worse
    // than none: it strands a workshop with nothing to work on.
    const eraOfGood = new Map<string, number>();
    for (const id of ALL_RESEARCH_IDS) {
      for (const bid of RESEARCH[id].unlocks) {
        for (const r of BUILDINGS[bid].recipes ?? (BUILDINGS[bid].recipe ? [BUILDINGS[bid].recipe!] : [])) {
          for (const g of Object.keys(r.outputs)) {
            eraOfGood.set(g, Math.min(eraOfGood.get(g) ?? 99, RESEARCH[id].tier));
          }
        }
        for (const g of Object.keys(BUILDINGS[bid].gather?.outputs ?? {})) {
          eraOfGood.set(g, Math.min(eraOfGood.get(g) ?? 99, RESEARCH[id].tier));
        }
      }
    }
    // Starting buildings need no research at all.
    for (const def of Object.values(BUILDINGS)) {
      if (def.requires) continue;
      for (const r of def.recipes ?? (def.recipe ? [def.recipe] : [])) {
        for (const g of Object.keys(r.outputs)) eraOfGood.set(g, 0);
      }
      for (const g of Object.keys(def.gather?.outputs ?? {})) eraOfGood.set(g, 0);
    }

    // A workshop with several recipes only needs one of them usable on day
    // one; the weaver may well wait for flax to reach the fifth era.
    for (const id of ALL_RESEARCH_IDS) {
      const tier = RESEARCH[id].tier;
      for (const bid of RESEARCH[id].unlocks) {
        const recipes = BUILDINGS[bid].recipes ?? (BUILDINGS[bid].recipe ? [BUILDINGS[bid].recipe!] : []);
        if (recipes.length === 0) continue;
        const usable = recipes.filter((r) =>
          Object.keys(r.inputs).every((g) => (eraOfGood.get(g) ?? 99) <= tier),
        );
        expect(
          usable.length,
          `${bid} (era ${tier}) has no recipe whose inputs exist yet`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('spreads every era over several branches', () => {
    for (let tier = 1; tier <= MAX_TIER; tier++) {
      const defs = researchOfTier(tier);
      expect(defs.length, `era ${tier} is empty`).toBeGreaterThan(2);
      expect(TIER_NAMES[tier], `era ${tier} has no name`).toBeTruthy();
    }
  });

  it('every building cost and recipe references a real good', () => {
    for (const def of Object.values(BUILDINGS)) {
      for (const g of Object.keys(def.cost)) expect(ALL_GOOD_IDS).toContain(g);
      for (const r of def.recipes ?? (def.recipe ? [def.recipe] : [])) {
        for (const g of Object.keys(r.inputs)) expect(ALL_GOOD_IDS).toContain(g);
        for (const g of Object.keys(r.outputs)) expect(ALL_GOOD_IDS).toContain(g);
      }
      for (const g of def.storage?.accepts ?? []) expect(ALL_GOOD_IDS).toContain(g);
    }
  });

  it('every non-starter building is unlocked by exactly one research', () => {
    for (const def of Object.values(BUILDINGS)) {
      if (!def.requires) continue;
      expect(RESEARCH[def.requires], `${def.id} requires unknown ${def.requires}`).toBeTruthy();
      expect(
        RESEARCH[def.requires].unlocks,
        `${def.requires} should unlock ${def.id}`,
      ).toContain(def.id);
    }
  });

  it('every good is produced by something or gathered', () => {
    const produced = new Set<string>();
    for (const def of Object.values(BUILDINGS)) {
      for (const r of def.recipes ?? (def.recipe ? [def.recipe] : [])) {
        for (const g of Object.keys(r.outputs)) produced.add(g);
      }
      for (const g of Object.keys(def.gather?.outputs ?? {})) produced.add(g);
    }
    // deep_mine has polymorphic output; add what its veins yield.
    produced.add('coal').add('iron_ore').add('gold_ore');
    const missing = ALL_GOOD_IDS.filter((g) => !produced.has(g));
    expect(missing, `unproduceable goods: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('early game loop', () => {
  it('gathers wood into the storehouse once a camp is staffed', () => {
    const sim = createNewGame({ seed: 'wood' });
    const w = sim.world;
    const before = w.stockOf('logs');

    // Place a woodcutter camp near trees.
    let placed = false;
    for (let r = 4; r < 40 && !placed; r++) {
      for (let a = 0; a < 24 && !placed; a++) {
        const ang = (a / 24) * Math.PI * 2;
        const x = Math.round(w.startX + Math.cos(ang) * r);
        const y = Math.round(w.startY + Math.sin(ang) * r);
        if (!w.canPlace('woodcutter_camp', x, y).ok) continue;
        let trees = 0;
        w.nodeGrid.query(x, y, 12, (n) => {
          if (n.kind === 'tree' && n.alive) trees++;
        });
        if (trees < 12) continue;
        const b = w.place('woodcutter_camp', x, y, 0, true);
        if (b) while (b.workers.length < workerSlots(b) && w.assignWorker(b.id)) { /* staff it */ }
        placed = !!b;
      }
    }
    expect(placed).toBe(true);

    run(sim, 240);
    computeStats(w);
    expect(w.stockOf('logs')).toBeGreaterThan(before);
  });

  it('keeps the village fed and alive for ten minutes', () => {
    const sim = createNewGame({ seed: 'survive' });
    const w = sim.world;
    const startPop = w.stats.population;
    run(sim, 600);
    computeStats(w);
    expect(w.stats.population).toBeGreaterThan(startPop * 0.5);
    expect(w.time.day).toBeGreaterThan(1);
  });

  it('refuses to study without a university, then completes a topic', () => {
    const sim = createNewGame({ seed: 'research' });
    const w = sim.world;
    run(sim, 120);
    w.treasury = 5000;
    // No university yet: the tree is out of reach.
    expect(canStartResearch(w, 'r_paths').ok).toBe(false);

    const hall = placeNearStart(w, 'university');
    expect(hall).toBeTruthy();
    while (hall!.workers.length < workerSlots(hall!) && w.assignWorker(hall!.id)) { /* staff it */ }
    expect(scholarCount(w)).toBeGreaterThan(0);

    const before = w.treasury;
    expect(startResearch(w, 'r_paths')).toBe(true);
    expect(w.treasury).toBeLessThan(before);
    run(sim, 120);
    expect(w.research.completed.has('r_paths')).toBe(true);
  });

  it('keeps a later era locked until the current one is finished', () => {
    const sim = createNewGame({ seed: 'eras' });
    const w = sim.world;
    w.treasury = 100000;
    const hall = placeNearStart(w, 'university');
    while (hall!.workers.length < workerSlots(hall!) && w.assignWorker(hall!.id)) { /* staff it */ }
    expect(unlockedTier(w)).toBe(1);
    expect(canStartResearch(w, 'r_agriculture').ok).toBe(false);
    for (const d of researchOfTier(1)) w.research.completed.add(d.id);
    expect(unlockedTier(w)).toBe(2);
    expect(canStartResearch(w, 'r_agriculture').ok).toBe(true);
  });
});

describe('trade', () => {
  it('refuses trade without a post and settles a sale once unlocked', () => {
    const sim = createNewGame({ seed: 'trade' });
    const w = sim.world;
    expect(orderSell(w, 'aubepine', 'planks', 5).ok).toBe(false);

    w.research.completed.add('r_marketplace');
    w.research.completed.add('r_trade_post');
    w.modifiers.tradeTier = 1;
    const post = w.place('trade_post', w.startX + 8, w.startY + 8, 0, true);
    expect(post ?? w.buildingList.find((b) => b.def === 'trade_post')).toBeTruthy();

    w.addToStock('planks', 40);
    w.refreshStockCache();
    const goldBefore = w.treasury;
    const res = orderSell(w, 'aubepine', 'planks', 10);
    expect(res.ok, res.reason).toBe(true);
    run(sim, 120);
    expect(w.treasury).toBeGreaterThan(goldBefore);
  });

  it('buys goods and delivers them to the storehouse', () => {
    const sim = createNewGame({ seed: 'trade2' });
    const w = sim.world;
    w.research.completed.add('r_trade_post');
    w.modifiers.tradeTier = 1;
    w.place('trade_post', w.startX + 8, w.startY + 8, 0, true);
    w.treasury = 5000;
    const before = w.stockOf('stone');
    const res = orderBuy(w, 'valmoreau', 'stone', 20);
    expect(res.ok, res.reason).toBe(true);
    run(sim, 120);
    w.refreshStockCache();
    expect(w.stockOf('stone')).toBeGreaterThan(before);
  });
});

describe('goods catalogue', () => {
  it('has a French name, a short label and a distinct colour for every good', () => {
    const seen = new Set<string>();
    for (const id of ALL_GOOD_IDS) {
      const g = GOODS[id];
      expect(g.name.length).toBeGreaterThan(1);
      // The interface identifies a good by its pastille and its short label,
      // so both have to exist and the colour has to be a real one.
      expect(g.short.length).toBeGreaterThan(1);
      expect(g.short.length).toBeLessThanOrEqual(12);
      expect(g.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(g.value).toBeGreaterThan(0);
      seen.add(g.color.toLowerCase());
    }
    // Pastilles that repeat make two goods look like the same thing.
    expect(seen.size).toBe(ALL_GOOD_IDS.length);
  });
});
