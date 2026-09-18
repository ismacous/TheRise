import { describe, expect, it } from 'vitest';
import { createNewGame, computeStats } from '../src/sim/simulation';
import { BUILDINGS } from '../src/data/buildings';
import { startResearch } from '../src/sim/research';
import { orderBuy, orderSell } from '../src/sim/economy';
import { GOODS, ALL_GOOD_IDS } from '../src/data/goods';
import { workerSlots } from '../src/sim/levels';
import { RESEARCH, ALL_RESEARCH_IDS } from '../src/data/research';

function run(sim: ReturnType<typeof createNewGame>, seconds: number): void {
  const steps = Math.round(seconds / 0.1);
  for (let i = 0; i < steps; i++) sim.tick(0.1);
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
  it('every research prerequisite exists and is acyclic', () => {
    for (const id of ALL_RESEARCH_IDS) {
      for (const req of RESEARCH[id].requires) {
        expect(RESEARCH[req], `${id} requires missing ${req}`).toBeTruthy();
      }
    }
    // Topological sort must succeed.
    const done = new Set<string>();
    let guard = 0;
    while (done.size < ALL_RESEARCH_IDS.length && guard++ < 200) {
      for (const id of ALL_RESEARCH_IDS) {
        if (done.has(id)) continue;
        if (RESEARCH[id].requires.every((r) => done.has(r))) done.add(id);
      }
    }
    expect(done.size).toBe(ALL_RESEARCH_IDS.length);
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

  it('accumulates research points and completes a topic', () => {
    const sim = createNewGame({ seed: 'research' });
    const w = sim.world;
    run(sim, 120);
    w.research.points = 100;
    expect(startResearch(w, 'r_shelter')).toBe(true);
    run(sim, 60);
    expect(w.research.completed.has('r_shelter')).toBe(true);
    expect(w.modifiers.buildSpeed).toBeGreaterThan(1);
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
  it('has a French name, icon and colour for every good', () => {
    for (const id of ALL_GOOD_IDS) {
      const g = GOODS[id];
      expect(g.name.length).toBeGreaterThan(1);
      expect(g.icon.length).toBeGreaterThan(0);
      expect(g.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(g.value).toBeGreaterThan(0);
    }
  });
});
