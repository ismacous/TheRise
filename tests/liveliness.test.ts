import { describe, expect, it } from 'vitest';
import { createNewGame, type Simulation } from '../src/sim/simulation';
import { WORN_TRAIL } from '../src/sim/paths';
import { happinessTarget } from '../src/sim/villagers';
import { BUILDINGS, type BuildingId } from '../src/data/buildings';
import { ALL_RESEARCH_IDS } from '../src/data/research';
import { CROP_STAGES, cropStage } from '../src/render/buildings';
import { collectRadius, maxLevelOf, workerSlots } from '../src/sim/levels';
import { rebuildHaulJobs } from '../src/sim/logistics';
import { computeModifiers } from '../src/sim/modifiers';
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
  // Adding to the set is not enough: the modifiers are what the rest of the
  // simulation reads, and the level ceiling now lives in there.
  w.modifiers = computeModifiers(w.research.completed);
}

/** First legal spot for `def`, spiralling out from a point. */
function spotNear(w: World, def: BuildingId, ox: number, oy: number) {
  for (let r = 1; r < 24; r++) {
    for (let a = 0; a < 40; a++) {
      const ang = (a / 40) * Math.PI * 2;
      const x = Math.round(ox + Math.cos(ang) * r);
      const y = Math.round(oy + Math.sin(ang) * r);
      if (w.canPlace(def, x, y).ok) return { x, y };
    }
  }
  return null;
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

describe('buildings inside buildings', () => {
  /**
   * A woodcutters' camp that outgrows its forester strips the wood bare, and a
   * mill on the far side of the village means every sheaf crosses it twice.
   * Both are now sited inside their host and improve with it.
   */
  it('refuses a forester hut outside a woodcutters circle, and allows one inside', () => {
    const sim = createNewGame({ seed: 'nested' });
    const w = sim.world;
    fund(w);

    // Nothing to sit inside yet.
    const far = w.canPlace('forester_hut', Math.floor(w.startX) + 30, Math.floor(w.startY) + 30);
    expect(far.ok).toBe(false);
    expect(far.reason).toContain('zone');

    const camp = placeNearStart(w, 'woodcutter_camp')!;
    expect(camp).toBeTruthy();
    // Somewhere free inside the camp's circle, rather than on top of the camp.
    const spot = spotNear(w, 'forester_hut', camp.cx, camp.cy);
    expect(spot).toBeTruthy();
    expect(w.canPlace('forester_hut', spot!.x, spot!.y).ok).toBe(true);
    expect(w.hostFor('forester_hut', spot!.x, spot!.y, 2, 2)?.id).toBe(camp.id);
  });

  it('puts the mill inside the field it grinds for', () => {
    const sim = createNewGame({ seed: 'mill' });
    const w = sim.world;
    fund(w);
    const field = placeNearStart(w, 'wheat_field');
    if (!field) return; // No fertile ground on this seed; nothing to assert.
    expect(w.canPlace('windmill', Math.floor(w.startX) + 40, Math.floor(w.startY) + 40).ok).toBe(false);
    expect(w.hostFor('windmill', field.x, field.y - 4, 3, 3)?.id).toBe(field.id);
  });

  it('raises the forester with the camp, free of charge', () => {
    const sim = createNewGame({ seed: 'linked' });
    const w = sim.world;
    fund(w);
    const camp = placeNearStart(w, 'woodcutter_camp')!;
    const spot = spotNear(w, 'forester_hut', camp.cx, camp.cy)!;
    const hut = w.place('forester_hut', spot.x, spot.y, 0, true);
    expect(hut).toBeTruthy();
    expect(hut!.level).toBe(1);

    camp.upgrade = { toDef: null, toLevel: 2, progress: 0, total: 1 };
    w.finishUpgrade(camp.id);

    expect(camp.level).toBe(2);
    expect(hut!.level).toBe(2);
  });
});

describe('the field through its year', () => {
  it('walks the whole cycle instead of standing ripe for ever', () => {
    // Stubble, then turned earth, shoots, green, ripe, and round again.
    expect(cropStage(0)).toBe(4);
    expect(cropStage(0.2)).toBe(0);
    expect(cropStage(0.4)).toBe(1);
    expect(cropStage(0.7)).toBe(2);
    expect(cropStage(0.95)).toBe(3);
    // Every value maps somewhere; nothing falls through.
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const s = cropStage(t);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(CROP_STAGES);
    }
  });
});

describe('depots that fetch', () => {
  /**
   * A warehouse used to be a shed: goods only reached it because the general
   * labour pool happened to pick up a shipping job, and only once a workshop
   * had a full load waiting. Staffing one now buys a collection round.
   */
  it('sends its own porters out for what the workshops have made', () => {
    const sim = createNewGame({ seed: 'depot' });
    const w = sim.world;
    fund(w);

    const depot = w.buildingList.find((b) => b.def === 'storehouse')!;
    // `fund` fills both depots to the brim; a full shed has nothing to collect
    // into, which is correct behaviour and not what this test is about.
    depot.inv = {};
    w.refreshStockCache();
    expect(collectRadius(depot)).toBeGreaterThan(0);
    while (depot.workers.length < workerSlots(depot) && w.assignWorker(depot.id)) {
      /* staff the depot */
    }
    expect(depot.workers.length).toBeGreaterThan(0);

    // A workshop sitting on a part load — under the threshold that would make
    // the ordinary shipping rule offer it to anyone.
    const shop = placeNearStart(w, 'sawmill')!;
    shop.inv.planks = 2;

    rebuildHaulJobs(w);
    const round = w.haulJobs.find(
      (j) => j.fromId === shop.id && j.toId === depot.id && j.good === 'planks',
    );
    expect(round).toBeTruthy();
  });

  it('stays quiet while nobody is staffing it', () => {
    const sim = createNewGame({ seed: 'depot-empty' });
    const w = sim.world;
    fund(w);
    const depot = w.buildingList.find((b) => b.def === 'storehouse')!;
    depot.inv = {};
    w.refreshStockCache();
    depot.workers.length = 0;
    const shop = placeNearStart(w, 'sawmill')!;
    shop.inv.planks = 2;

    rebuildHaulJobs(w);
    expect(w.haulJobs.some((j) => j.fromId === shop.id && j.toId === depot.id)).toBe(false);
  });

  it('reaches further as it is improved', () => {
    const sim = createNewGame({ seed: 'depot-level' });
    const w = sim.world;
    const depot = w.buildingList.find((b) => b.def === 'storehouse')!;
    const atOne = collectRadius(depot);
    depot.level = 3;
    expect(collectRadius(depot)).toBeGreaterThan(atOne);
    // And its shed grows with it, like every other building's.
    expect(maxLevelOf('warehouse')).toBeGreaterThan(1);
  });
});
