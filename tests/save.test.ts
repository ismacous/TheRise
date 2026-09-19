import { describe, expect, it } from 'vitest';
import { computeStats, createNewGame } from '../src/sim/simulation';
import { outputRates } from '../src/sim/output';
import { deserialize, serialize } from '../src/sim/save';
import { startResearch } from '../src/sim/research';
import { orderSell } from '../src/sim/economy';
import type { BuildingId } from '../src/data/buildings';
import type { World } from '../src/sim/world';
import { workerSlots } from '../src/sim/levels';

const GEN = { seed: 'save-test' };

function place(w: World, def: BuildingId, node?: string, minNodes = 6) {
  for (let r = 3; r < 60; r++) {
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      const x = Math.round(w.startX + Math.cos(ang) * r);
      const y = Math.round(w.startY + Math.sin(ang) * r);
      if (!w.canPlace(def, x, y).ok) continue;
      if (node) {
        let n = 0;
        w.nodeGrid.query(x, y, 12, (c) => {
          if (c.kind === node && c.alive) n++;
        });
        if (n < minNodes) continue;
      }
      const b = w.place(def, x, y, 0, true);
      if (b) {
        while (b.workers.length < workerSlots(b) && w.assignWorker(b.id)) { /* staff it */ }
        return b;
      }
    }
  }
  return null;
}

/** Plays a while, then snapshots. */
function playedGame() {
  const sim = createNewGame(GEN);
  const w = sim.world;
  // Enough standing timber that the camp cannot strip the wood bare mid-test.
  place(w, 'woodcutter_camp', 'tree', 40);
  place(w, 'gatherer_hut', 'berry_bush');
  place(w, 'sawmill');
  place(w, 'shack');
  place(w, 'shack');
  place(w, 'university');
  w.treasury = 2000;
  startResearch(w, 'r_forestry');
  // Paint a stretch of road so the sparse road layer is exercised.
  w.research.completed.add('r_paths');
  for (let i = 0; i < 12; i++) w.place('dirt_path', Math.floor(w.startX) + i, Math.floor(w.startY) + 6);
  for (let i = 0; i < 4000; i++) sim.tick(0.1);
  computeStats(w);
  return sim;
}

describe('save and load', () => {
  it('restores the world faithfully', () => {
    const sim = playedGame();
    const before = sim.world;
    const data = JSON.parse(JSON.stringify(serialize(sim, GEN)));
    const restored = deserialize(data).world;

    expect(restored.villagers.length).toBe(before.villagers.length);
    expect(restored.buildingList.length).toBe(before.buildingList.length);
    expect(restored.treasury).toBeCloseTo(before.treasury, 4);
    expect(restored.time.day).toBe(before.time.day);
    expect(restored.time.season).toBe(before.time.season);
    expect([...restored.research.completed].sort()).toEqual([...before.research.completed].sort());
    expect(restored.research.active).toBe(before.research.active);
    expect(restored.completedObjectives.size).toBe(before.completedObjectives.size);

    computeStats(restored);
    computeStats(before);
    expect(restored.stats.population).toBe(before.stats.population);
    expect(restored.stockOf('logs')).toBe(before.stockOf('logs'));
    expect(restored.stockOf('planks')).toBe(before.stockOf('planks'));
    expect(restored.stats.housingCapacity).toBe(before.stats.housingCapacity);

    // Roads, felled trees and regrown saplings must all survive.
    let roadsBefore = 0;
    let roadsAfter = 0;
    for (let i = 0; i < before.map.road.length; i++) {
      if (before.map.road[i]) roadsBefore++;
      if (restored.map.road[i]) roadsAfter++;
    }
    expect(roadsAfter).toBe(roadsBefore);
    expect(roadsBefore).toBeGreaterThan(5);
    expect(restored.nodes.size).toBe(before.nodes.size);

    // Employment and housing links must point at the same buildings.
    for (const v of before.villagers) {
      const r = restored.villagerById.get(v.id)!;
      expect(r, `villager ${v.id} missing`).toBeTruthy();
      expect(r.workId).toBe(v.workId);
      expect(r.homeId).toBe(v.homeId);
      expect(r.profession).toBe(v.profession);
    }
  });

  it('keeps running normally after a load', () => {
    const sim = playedGame();
    const data = JSON.parse(JSON.stringify(serialize(sim, GEN)));
    const restoredSim = deserialize(data);
    const w = restoredSim.world;
    for (let i = 0; i < 3000; i++) restoredSim.tick(0.1);
    computeStats(w);
    expect(w.stats.population).toBeGreaterThan(0);
    // The berry hut must still be gathering after a load. This used to compare
    // the larder against a snapshot, which measured the balance of gathering
    // against eating rather than whether the hut works at all: on a village
    // that happened to be a little hungry that day, a perfectly good save
    // failed the test. The hut's own measured output says it plainly.
    const hut = w.buildingList.find((b) => b.def === 'gatherer_hut')!;
    const gathered = outputRates(hut).reduce((sum, r) => sum + r.perMinute, 0);
    expect(gathered, 'la hutte du cueilleur ne ramasse plus rien').toBeGreaterThan(0);
    // Villagers must have picked their jobs back up rather than idling.
    const working = w.villagers.filter((v) => v.workId !== 0).length;
    expect(working).toBeGreaterThan(0);
  });

  it('survives a save taken mid-trade', () => {
    const sim = createNewGame(GEN);
    const w = sim.world;
    w.research.completed.add('r_trade_post');
    w.modifiers.tradeTier = 1;
    place(w, 'trade_post');
    w.addToStock('planks', 60);
    w.refreshStockCache();
    expect(orderSell(w, 'aubepine', 'planks', 10).ok).toBe(true);
    for (let i = 0; i < 100; i++) sim.tick(0.1);

    const restored = deserialize(JSON.parse(JSON.stringify(serialize(sim, GEN)))).world;
    expect(restored.contracts.length).toBe(1);
    expect(restored.contracts[0].good).toBe('planks');
  });

  it('rejects a snapshot from another version', () => {
    const sim = createNewGame(GEN);
    const data = serialize(sim, GEN);
    data.version = 1;
    expect(() => deserialize(data)).toThrow();
  });
});
