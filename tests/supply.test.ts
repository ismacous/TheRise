import { describe, expect, it } from 'vitest';
import type { BuildingId, NodeKind } from '../src/data/buildings';
import { computeStats, createNewGame, type Simulation } from '../src/sim/simulation';
import { createVillager } from '../src/sim/villagers';
import { workerSlots } from '../src/sim/levels';
import { rebuildHaulJobs } from '../src/sim/logistics';
import { findDepotWith, findInputSource, planSupply, siteErrand, workshopErrand } from '../src/sim/supply';
import type { Building } from '../src/sim/types';
import type { World } from '../src/sim/world';

function run(sim: Simulation, seconds: number): void {
  const steps = Math.round(seconds / 0.1);
  for (let i = 0; i < steps; i++) sim.tick(0.1);
  computeStats(sim.world);
}

function staff(w: World, b: Building | null): Building | null {
  if (!b) return null;
  while (b.workers.length < workerSlots(b)) if (!w.assignWorker(b.id)) break;
  return b;
}

function placeNear(w: World, def: BuildingId, node?: NodeKind, minNodes = 6, instant = true) {
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
      const b = w.place(def, x, y, 0, instant);
      if (b) return instant ? staff(w, b) : b;
    }
  }
  return null;
}

/**
 * The reported bug, as a test.
 *
 * A cottage sat at two logs out of twelve all evening while every log in the
 * village went to the sawmill: both were requests on one shared board, and
 * the sawmill simply stood nearer the storehouse. Nothing about priority
 * fixed it — priority 6 against priority 5 bought the site thirty tiles.
 */
describe('a building site next to a hungry workshop', () => {
  it('gets its materials even while a sawmill is eating every log', () => {
    const sim = createNewGame({ seed: 'starved-site' });
    const w = sim.world;
    for (let i = 0; i < 6; i++) placeNear(w, 'shack');
    while (w.villagers.length < 22) createVillager(w, w.startX + 1, w.startY + 1, 25);
    placeNear(w, 'woodcutter_camp', 'tree', 12);
    placeNear(w, 'sawmill');
    computeStats(w);
    // Let the woodcutters fill the stores so there is something to fight over.
    run(sim, 300);
    expect(w.stockOf('logs')).toBeGreaterThan(12);

    const site = placeNear(w, 'shack', undefined, 6, false)!;
    expect(site).toBeTruthy();
    expect(site.state).toBe('planned');
    const need = 12;

    run(sim, 420);
    // Either it is finished or the logs are on the plot; what must not happen
    // is the site sitting at a couple of logs while the sawmill runs.
    const delivered = site.state === 'active' ? need : site.delivered.logs ?? 0;
    expect(delivered, 'le chantier reste affamé').toBeGreaterThanOrEqual(need);
  }, 60000);
});

describe('who may take from where', () => {
  it('sends a builder to a depot and never to a workshop', () => {
    const sim = createNewGame({ seed: 'depot-only' });
    const w = sim.world;
    const camp = placeNear(w, 'woodcutter_camp', 'tree', 12)!;
    const site = placeNear(w, 'shack', undefined, 6, false)!;
    const builder = w.villagers[0];

    // Every log in the village is at the camp; no depot has one.
    for (const b of w.buildingList) {
      if (b.id !== camp.id) delete b.inv.logs;
    }
    camp.inv.logs = 40;
    w.refreshStockCache();
    expect(findDepotWith(w, 'logs', builder.x, builder.y)).toBeNull();
    expect(siteErrand(w, site, builder), 'un bâtisseur a pioché dans un atelier').toBeNull();

    // Put the logs in the town hall and the errand appears.
    const hall = w.buildingList.find((b) => b.def === 'town_hall')!;
    delete camp.inv.logs;
    hall.inv.logs = 40;
    w.refreshStockCache();
    expect(siteErrand(w, site, builder)?.from.id).toBe(hall.id);
  });

  it('lets a workshop take from the source when no depot has any', () => {
    const sim = createNewGame({ seed: 'source' });
    const w = sim.world;
    const camp = staff(w, placeNear(w, 'woodcutter_camp', 'tree', 12))!;
    const mill = staff(w, placeNear(w, 'sawmill'))!;
    for (const b of w.buildingList) {
      if (b.id !== camp.id) delete b.inv.logs;
    }
    camp.inv.logs = 40;
    delete mill.inv.logs;
    w.refreshStockCache();

    // A sawyer walks to the woodcutters rather than standing at an empty bench.
    expect(findInputSource(w, mill, 'logs', mill.cx, mill.cy)?.id).toBe(camp.id);
    // The search itself runs once a second for the whole village; the errand
    // a worker acts on is read back from that plan.
    planSupply(w);
    const errand = workshopErrand(w, mill);
    expect(errand?.good).toBe('logs');
    expect(errand?.from.id).toBe(camp.id);
  });
});

/**
 * Sorting is what lets a village have quarters: ore by the forges, grain by
 * the bakery. It is only useful if the rest of the simulation honours it —
 * including for goods already inside when the player changes their mind.
 */
describe('depot sorting', () => {
  it('refuses what it is not sorting, and sends away what it already had', () => {
    const sim = createNewGame({ seed: 'sorting' });
    const w = sim.world;
    const hall = w.buildingList.find((b) => b.def === 'town_hall')!;

    expect(hall.sorting).toBeNull();
    expect(w.accepts(hall, 'logs')).toBe(true);
    expect(w.accepts(hall, 'stone')).toBe(true);

    hall.inv.stone = 20;
    w.setSorting(hall, ['logs']);
    expect(w.accepts(hall, 'logs')).toBe(true);
    expect(w.accepts(hall, 'stone')).toBe(false);
    // A deposit of an unsorted good never lands here, whatever else does with
    // it — the opening village has more than one depot.
    const before = hall.inv.stone ?? 0;
    w.addToStock('stone', 5, hall.cx, hall.cy);
    expect(hall.inv.stone ?? 0).toBe(before);

    // And the stone already inside is queued to leave rather than stranded.
    placeNear(w, 'storehouse');
    w.refreshStockCache();
    rebuildHaulJobs(w);
    const eviction = w.haulJobs.find((j) => j.fromId === hall.id && j.good === 'stone');
    expect(eviction, 'la pierre reste bloquée dans un dépôt qui la refuse').toBeTruthy();
  });

  it('treats "everything ticked" as everything, not as today’s catalogue', () => {
    const sim = createNewGame({ seed: 'sorting-all' });
    const w = sim.world;
    const hall = w.buildingList.find((b) => b.def === 'town_hall')!;
    w.setSorting(hall, w.sortableGoods(hall));
    // Null, not a frozen list: a depot built today must still take a good
    // that only exists once its study lands.
    expect(hall.sorting).toBeNull();
  });
});
