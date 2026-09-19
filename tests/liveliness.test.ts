import { describe, expect, it } from 'vitest';
import { createNewGame, type Simulation } from '../src/sim/simulation';
import { WORN_TRAIL } from '../src/sim/paths';
import { happinessTarget } from '../src/sim/villagers';
import { BUILDINGS, type BuildingId } from '../src/data/buildings';
import { ALL_RESEARCH_IDS } from '../src/data/research';
import type { World } from '../src/sim/world';

function run(sim: Simulation, seconds: number): void {
  const steps = Math.round(seconds / 0.1);
  for (let i = 0; i < steps; i++) sim.tick(0.1);
}

function countTrails(w: World): number {
  let n = 0;
  for (let i = 0; i < w.map.road.length; i++) if (w.map.road[i] === WORN_TRAIL) n++;
  return n;
}

/** Enough coin, material and study that placement is never refused. */
function fund(w: World): void {
  w.treasury = 20000;
  for (const good of ['stone', 'planks', 'logs'] as const) w.addToStock(good, 400);
  w.refreshStockCache();
  for (const id of ALL_RESEARCH_IDS) w.research.completed.add(id);
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

describe('desire paths', () => {
  /**
   * Nobody draws the track between the camp and the storehouse: it appears
   * because the same feet cross the same grass a few hundred times.
   */
  it('wears a trail where villagers actually walk, and only there', () => {
    const sim = createNewGame({ seed: 'trails' });
    const w = sim.world;
    expect(countTrails(w)).toBe(0);

    const camp = placeNearStart(w, 'woodcutter_camp')!;
    while (camp.workers.length < 2 && w.assignWorker(camp.id)) {
      /* staff it, so somebody has a reason to walk */
    }
    run(sim, 900);

    const trails = countTrails(w);
    expect(trails).toBeGreaterThan(0);
    // Only a tiny fraction of the map should ever be worn: a whole map turning
    // to dirt would mean the wear threshold is meaningless.
    expect(trails).toBeLessThan(w.map.road.length * 0.02);

    // Every trail sits on walkable ground nobody built on.
    for (let i = 0; i < w.map.road.length; i++) {
      if (w.map.road[i] !== WORN_TRAIL) continue;
      expect(w.map.occupancy[i]).toBe(-1);
      expect(w.map.walkable(i % w.map.width, Math.floor(i / w.map.width))).toBe(true);
    }
  }, 120000);

  it('lets the grass take a trail back once the traffic stops', () => {
    // The same valley as the test above, which is known to grow a trail: this
    // test is about the grass coming back, not about where feet go.
    const sim = createNewGame({ seed: 'trails' });
    const w = sim.world;
    const camp = placeNearStart(w, 'woodcutter_camp')!;
    while (camp.workers.length < 2 && w.assignWorker(camp.id)) {
      /* staff it */
    }
    run(sim, 900);
    const peak = countTrails(w);
    expect(peak).toBeGreaterThan(0);

    // Everyone leaves. Nothing walks anywhere any more.
    for (const v of [...w.villagers]) {
      const i = w.villagers.indexOf(v);
      if (i !== -1) w.villagers.splice(i, 1);
      w.villagerById.delete(v.id);
    }
    run(sim, 900);

    expect(countTrails(w)).toBeLessThan(peak);
  }, 180000);

  it('never paves over a road the player laid', () => {
    const sim = createNewGame({ seed: 'roads' });
    const w = sim.world;
    const x = Math.floor(w.startX) + 2;
    const y = Math.floor(w.startY);
    w.map.road[w.map.idx(x, y)] = 2;
    run(sim, 600);
    expect(w.map.road[w.map.idx(x, y)]).toBe(2);
  }, 120000);
});

describe('ornament and leisure', () => {
  it('makes a villager standing beside a fountain happier than one who is not', () => {
    const sim = createNewGame({ seed: 'decor' });
    const w = sim.world;
    fund(w);
    const v = w.villagers[0];
    w.rebuildServiceFields();
    const before = happinessTarget(w, v);

    const fountain = placeNearStart(w, 'fountain')!;
    v.x = fountain.cx;
    v.y = fountain.cy;
    w.rebuildServiceFields();

    expect(happinessTarget(w, v)).toBeGreaterThan(before);
  });

  it('gives leisure a stronger pull than ornament, and both fall off with distance', () => {
    const sim = createNewGame({ seed: 'leisure' });
    const w = sim.world;
    fund(w);
    const green = placeNearStart(w, 'village_green')!;
    w.rebuildServiceFields();

    const near = w.serviceBonusAt(green.cx, green.cy);
    const far = w.serviceBonusAt(green.cx + 40, green.cy + 40);
    expect(near).toBeGreaterThan(0);
    expect(far).toBe(0);
  });

  it('keeps every ornament buildable without a worker', () => {
    for (const id of ['flower_bed', 'bench', 'lamp_post', 'fountain', 'statue'] as BuildingId[]) {
      const def = BUILDINGS[id];
      expect(def.workers).toBe(0);
      expect(def.service?.kind).toBe('decor');
      // An ornament nobody can afford early is an ornament nobody builds.
      expect(def.goldCost).toBeLessThanOrEqual(300);
    }
  });
});

describe('work and happiness', () => {
  /**
   * The design says morale comes from taxes, work, home and leisure. The
   * "work" term was missing entirely: holding a job only avoided a penalty.
   */
  it('rewards a villager whose workshop is actually running', () => {
    const sim = createNewGame({ seed: 'work' });
    const w = sim.world;
    const camp = placeNearStart(w, 'woodcutter_camp')!;
    const v = w.assignWorker(camp.id)!;
    expect(v).toBeTruthy();
    w.rebuildServiceFields();

    camp.stall = null;
    const running = happinessTarget(w, v);
    camp.stall = 'Aucune ressource à portée';
    const stalled = happinessTarget(w, v);

    expect(running).toBeGreaterThan(stalled);
  });
});
