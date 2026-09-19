import { describe, expect, it } from 'vitest';
import { computeStats, createNewGame } from '../src/sim/simulation';
import { ADULT_AGE, createVillager } from '../src/sim/villagers';
import { INCOME_SOURCES, EXPENSE_SOURCES } from '../src/sim/history';
import { DAY_SECONDS } from '../src/sim/world';
import type { Simulation } from '../src/sim/simulation';

function run(sim: Simulation, seconds: number): void {
  const steps = Math.round(seconds / 0.1);
  for (let i = 0; i < steps; i++) sim.tick(0.1);
}

describe('the opening village', () => {
  /**
   * The single most important invariant in a chill game: a player who has done
   * nothing wrong must not be punished. Stretching the day from two to twelve
   * minutes once left every food-day threshold six times too strict, so a
   * brand new village slid straight past the exodus line and bled settlers
   * while the storehouse was still a third full.
   */
  it('neither starves nor shrinks while the player finds their feet', () => {
    const sim = createNewGame({ seed: 'opening' });
    const w = sim.world;
    const deaths: string[] = [];
    w.emitter.on('villagerDied', ({ cause }) => deaths.push(cause));
    const startPop = w.stats.population;

    // Twenty minutes of doing absolutely nothing.
    run(sim, 1200);
    computeStats(w);

    expect(deaths).toEqual([]);
    expect(w.stats.population).toBeGreaterThanOrEqual(startPop);
    // Still a real clock ticking: the larder empties, it just does not kill.
    expect(w.stats.foodDays).toBeGreaterThan(1);
    expect(w.stats.foodDays).toBeLessThan(3);
  }, 60000);

  it('gives almost everyone a bed on day one', () => {
    const sim = createNewGame({ seed: 'beds' });
    const w = sim.world;
    // Homelessness costs 24 happiness, which alone held morale under the floor
    // for births and for newcomers.
    expect(w.stats.housingCapacity).toBeGreaterThanOrEqual(w.stats.population - 1);
  });
});

describe('children', () => {
  /**
   * Children used to play until they starved: their update returned before the
   * "go and eat" override, so nobody born in the village ever reached working
   * age and only immigration grew the population.
   */
  it('grows a newborn all the way to adulthood', () => {
    const sim = createNewGame({ seed: 'childhood' });
    const w = sim.world;
    const hall = w.buildingList.find((b) => b.def === 'town_hall')!;
    const child = createVillager(w, hall.cx + 1.5, hall.cy + 1.5, 0);
    expect(child.profession).toBe('child');

    // Keep the larder stocked; this test is about eating, not about farming.
    const top = (): void => {
      if (w.stockOf('bread') < 40) w.addToStock('bread', 60);
    };
    const steps = Math.round((ADULT_AGE * DAY_SECONDS + 120) / 0.1);
    for (let i = 0; i < steps; i++) {
      sim.tick(0.1);
      if (i % 600 === 0) top();
    }

    expect(w.villagerById.has(child.id)).toBe(true);
    expect(child.satiety).toBeGreaterThan(0);
    expect(child.profession).not.toBe('child');
  }, 120000);
});

describe('illness', () => {
  /**
   * Sickness drained half a health point a second and cleared in four minutes,
   * so a patient always ran out of health first: a single fever was a
   * village-wide culling, herbalist or not.
   */
  it('is survivable without a herbalist, even when it takes the whole village', () => {
    const sim = createNewGame({ seed: 'fever' });
    const w = sim.world;
    const gone: string[] = [];
    w.emitter.on('villagerDied', ({ cause }) => gone.push(cause));
    for (const v of w.villagers) v.sick = 1;
    const ids = w.villagers.map((v) => v.id);

    run(sim, 600);

    // Nobody dies of it, and nobody flees mid-fever either.
    expect(gone).toEqual([]);
    expect(ids.every((id) => w.villagerById.has(id))).toBe(true);
    for (const id of ids) {
      const v = w.villagerById.get(id)!;
      expect(v.sick).toBe(0);
      expect(v.health).toBeGreaterThan(0);
    }
  }, 60000);
});

describe('movement', () => {
  it('frees a villager walled in on a single tile', () => {
    const sim = createNewGame({ seed: 'island' });
    const w = sim.world;
    const v = w.villagers[0];
    const x = Math.floor(v.x);
    const y = Math.floor(v.y);
    // Ring the tile they stand on. A* cannot route out of somewhere with no
    // way off, so without a rescue they walk on the spot until they starve.
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      w.map.blocker[w.map.idx(x + dx, y + dy)] = 999000 + dx * 10 + dy;
    }

    run(sim, 2);

    const nx = Math.floor(v.x);
    const ny = Math.floor(v.y);
    expect(nx !== x || ny !== y).toBe(true);
    expect(w.map.walkable(nx, ny)).toBe(true);
  }, 30000);
});

describe('the ledger', () => {
  it('books every coin against a source and keeps the curves in step', () => {
    const sim = createNewGame({ seed: 'ledger' });
    const w = sim.world;
    const opening = w.treasury;

    run(sim, DAY_SECONDS);

    const h = w.history;
    let income = 0;
    let expense = 0;
    for (const k of INCOME_SOURCES) income += h.total[k];
    for (const k of EXPENSE_SOURCES) expense += h.total[k];
    // Taxes are the only income a village this young has, and it spends
    // nothing on its own, so the books must close on the balance exactly.
    expect(income).toBeGreaterThan(0);
    expect(opening + income - expense).toBeCloseTo(w.treasury, 4);

    // Two samples per day, plus the one taken when the game was created.
    expect(h.samples.length).toBeGreaterThanOrEqual(3);
    const last = h.samples[h.samples.length - 1];
    expect(last.income).toBeGreaterThan(0);
    expect(last.population).toBe(w.stats.population);
  }, 60000);

  it('caps the rolling window instead of growing for ever', () => {
    const sim = createNewGame({ seed: 'window' });
    const w = sim.world;
    for (let i = 0; i < 200; i++) w.history.push(w);
    expect(w.history.samples.length).toBeLessThanOrEqual(48);
  });
});
