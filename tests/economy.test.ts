import { describe, expect, it } from 'vitest';
import type { BuildingId, NodeKind } from '../src/data/buildings';
import { computeStats, createNewGame, type Simulation } from '../src/sim/simulation';
import { World } from '../src/sim/world';
import { igniteBuilding } from '../src/sim/events';
import { createVillager } from '../src/sim/villagers';

function run(sim: Simulation, seconds: number): void {
  const steps = Math.round(seconds / 0.1);
  for (let i = 0; i < steps; i++) sim.tick(0.1);
  computeStats(sim.world);
}

/** Places a building on the best nearby spot, optionally requiring resources. */
function placeNear(w: World, def: BuildingId, node?: NodeKind, minNodes = 6) {
  for (let r = 3; r < 60; r++) {
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      const x = Math.round(w.startX + Math.cos(ang) * r);
      const y = Math.round(w.startY + Math.sin(ang) * r);
      if (!w.canPlace(def, x, y).ok) continue;
      if (node) {
        let n = 0;
        w.nodeGrid.query(x, y, 12, (candidate) => {
          if (candidate.kind === node && candidate.alive) n++;
        });
        if (n < minNodes) continue;
      }
      const b = w.place(def, x, y, 0, true);
      if (b) return b;
    }
  }
  return null;
}

describe('logistics', () => {
  it('moves gathered wood from the camp into a storehouse', () => {
    const sim = createNewGame({ seed: 'logistics' });
    const w = sim.world;
    const camp = placeNear(w, 'woodcutter_camp', 'tree', 20);
    expect(camp).toBeTruthy();
    const before = w.stockOf('logs');
    run(sim, 300);
    expect(w.stockOf('logs')).toBeGreaterThan(before);
  });

  it('never staffs more than a quarter of the village as porters', () => {
    const sim = createNewGame({ seed: 'porters' });
    const w = sim.world;
    placeNear(w, 'storehouse');
    placeNear(w, 'storehouse');
    placeNear(w, 'woodcutter_camp', 'tree', 15);
    run(sim, 60);
    const carriers = w.villagers.filter((v) => v.profession === 'carrier').length;
    expect(carriers).toBeLessThanOrEqual(Math.max(1, Math.round(w.stats.adults * 0.25)) + 1);
    // And the woodcutter camp must actually have staff.
    const camp = w.buildingList.find((b) => b.def === 'woodcutter_camp')!;
    expect(camp.workers.length).toBeGreaterThan(0);
  });
});

describe('production chains', () => {
  it('turns logs into planks at the sawmill', () => {
    const sim = createNewGame({ seed: 'planks' });
    const w = sim.world;
    placeNear(w, 'woodcutter_camp', 'tree', 20);
    placeNear(w, 'woodcutter_camp', 'tree', 15);
    placeNear(w, 'sawmill');
    const before = w.stockOf('planks');
    run(sim, 420);
    expect(w.stockOf('planks')).toBeGreaterThan(before);
  });

  it('runs the full wheat to bread chain', () => {
    const sim = createNewGame({ seed: 'bread' });
    const w = sim.world;
    for (const r of ['r_agriculture', 'r_milling', 'r_charcoal', 'r_baking'] as const) {
      w.research.completed.add(r);
    }
    // Enough hands to staff every step.
    for (let i = 0; i < 18; i++) {
      placeNear(w, 'shack');
    }
    placeNear(w, 'wheat_field');
    placeNear(w, 'windmill');
    placeNear(w, 'charcoal_burner');
    placeNear(w, 'bakery');
    placeNear(w, 'woodcutter_camp', 'tree', 15);
    // Seed the population so the chain has workers immediately.
    while (w.villagers.length < 30) {
      createVillager(w, w.startX + 1, w.startY + 1, 25);
    }
    computeStats(w);
    run(sim, 900);
    expect(w.stockOf('wheat') + w.stockOf('flour') + w.stockOf('bread')).toBeGreaterThan(0);
    expect(w.stockOf('bread')).toBeGreaterThan(0);
  });
});

describe('long run stability', () => {
  it('survives an hour of simulated time without the village collapsing', () => {
    const sim = createNewGame({ seed: 'stability' });
    const w = sim.world;
    placeNear(w, 'woodcutter_camp', 'tree', 15);
    placeNear(w, 'gatherer_hut', 'berry_bush', 3);
    placeNear(w, 'sawmill');
    for (let i = 0; i < 4; i++) placeNear(w, 'shack');
    run(sim, 3600);
    expect(w.stats.population).toBeGreaterThan(0);
    expect(Number.isFinite(w.treasury)).toBe(true);
    // Nothing should have leaked: every worker belongs to a live building.
    for (const v of w.villagers) {
      if (v.workId) expect(w.buildings.has(v.workId)).toBe(true);
      if (v.homeId) expect(w.buildings.has(v.homeId)).toBe(true);
    }
    for (const b of w.buildingList) {
      for (const id of b.workers) expect(w.villagerById.has(id)).toBe(true);
      for (const id of b.residents) expect(w.villagerById.has(id)).toBe(true);
    }
  });
});

describe('fire', () => {
  it('is put out rather than smouldering forever', () => {
    const sim = createNewGame({ seed: 'fire' });
    const w = sim.world;
    const hut = placeNear(w, 'gatherer_hut');
    expect(hut).toBeTruthy();
    igniteBuilding(w, hut!);
    expect(hut!.state).toBe('burning');
    run(sim, 180);
    // Either the villagers saved it or it burned down — never stuck in between.
    const still = w.buildings.get(hut!.id);
    expect(still === undefined || still.state !== 'burning').toBe(true);
  });

  it('does not cascade through the whole village', () => {
    const sim = createNewGame({ seed: 'cascade' });
    const w = sim.world;
    for (let i = 0; i < 6; i++) placeNear(w, 'shack');
    const before = w.buildingList.length;
    const victim = w.buildingList.find((b) => b.def === 'shack' && b.state === 'active')!;
    igniteBuilding(w, victim);
    run(sim, 600);
    // Losing one or two buildings is a setback; losing the village is a bug.
    expect(w.buildingList.length).toBeGreaterThan(before - 4);
  });
});
