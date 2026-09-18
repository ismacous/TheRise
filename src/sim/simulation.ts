import { clamp } from '../core/util';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { updateVillager } from './behaviour';
import { computeTier, updateEconomy } from './economy';
import { eventFoodMultiplier, updateFires, updateVillageEvents, updateWeather } from './events';
import { rebuildHaulJobs } from './logistics';
import { updateLivestock, updateNature } from './nature';
import {
  updateEmployment,
  updateHousing,
  updateHouseholdConsumption,
  updateEmigration,
  updateImmigration,
  updatePopulation,
  updateVillagerNeeds,
} from './population';
import { updateObjectives } from './objectives';
import { updateResearch } from './research';
import { NUTRITION_PER_DAY, countFoodVariety, createVillager } from './villagers';
import { DAYS_PER_SEASON, DAY_SECONDS, World } from './world';
import { SEASONS, type Season } from './types';
import type { WorldGenOptions } from './worldgen';

/** Fixed simulation step. Everything downstream assumes this cadence. */
export const TICK = 1 / 10;
export const MAX_CATCHUP_TICKS = 20;

export class Simulation {
  world: World;
  /** 0 = paused, 1..4 = speed multipliers. */
  speed = 1;
  private accumulator = 0;
  private jobTimer = 0;
  private employmentTimer = 0;
  private statsTimer = 0;
  private serviceTimer = 0;
  private incomeTimer = 0;
  private lastTierNotified = 1;

  /** Diagnostics. */
  ticksThisFrame = 0;
  /** 0..1 through the tick currently being displayed; drives interpolation. */
  alpha = 0;

  constructor(genOpts: Partial<WorldGenOptions> = {}) {
    this.world = new World(genOpts);
  }

  /** Advance by real elapsed seconds, running as many fixed ticks as needed. */
  update(realDt: number): void {
    this.ticksThisFrame = 0;
    if (this.speed <= 0) return;
    this.accumulator += Math.min(realDt, 0.5) * this.speed;
    let guard = 0;
    while (this.accumulator >= TICK && guard < MAX_CATCHUP_TICKS) {
      this.accumulator -= TICK;
      this.tick(TICK);
      guard++;
      this.ticksThisFrame++;
    }
    if (guard >= MAX_CATCHUP_TICKS) this.accumulator = 0;
    this.alpha = Math.min(1, this.accumulator / TICK);
  }

  tick(dt: number): void {
    const w = this.world;
    w.tickCount++;
    w.pathfinder.beginTick();

    advanceTime(w, dt);
    updateWeather(w, dt);
    w.foodUpkeepEvent = eventFoodMultiplier(w);

    // Job board and hiring do not need to run every tick.
    this.jobTimer -= dt;
    if (this.jobTimer <= 0) {
      this.jobTimer = 1.1;
      rebuildHaulJobs(w);
    }
    this.employmentTimer -= dt;
    if (this.employmentTimer <= 0) {
      this.employmentTimer = 2.2;
      updateEmployment(w);
      updateHousing(w);
    }
    this.serviceTimer -= dt;
    if (this.serviceTimer <= 0) {
      this.serviceTimer = 1;
      w.rebuildServiceFields();
    }

    for (const v of w.villagers) {
      v.prevX = v.x;
      v.prevY = v.y;
      v.prevAngle = v.angle;
      updateVillagerNeeds(w, v, dt);
      updateVillager(w, v, dt);
    }

    updateHouseholdConsumption(w, dt);
    updateNature(w, dt);
    updateLivestock(w, dt);
    updateFires(w, dt);
    updateVillageEvents(w, dt);
    updateResearch(w, dt);
    updateEconomy(w, dt);
    updatePopulation(w, dt);
    updateImmigration(w, dt);
    updateEmigration(w, dt);

    this.statsTimer -= dt;
    if (this.statsTimer <= 0) {
      this.statsTimer = 0.5;
      w.refreshStockCache();
      w.foodVariety = countFoodVariety(w);
      computeStats(w);
      updateObjectives(w);
      const tier = computeTier(w);
      if (tier !== w.stats.tier) {
        w.stats.tier = tier;
        if (tier > this.lastTierNotified) {
          this.lastTierNotified = tier;
          w.emitter.emit('tierUp', { tier });
        }
      }
    }

    this.incomeTimer -= dt;
    if (this.incomeTimer <= 0) {
      this.incomeTimer = 60;
      w.stats.goldPerMinute = w.tradeIncomeWindow + w.taxIncomeWindow;
      w.tradeIncomeWindow = 0;
      w.taxIncomeWindow = 0;
    }
  }
}

export function advanceTime(w: World, dt: number): void {
  w.time.elapsed += dt;
  const dayProgress = dt / DAY_SECONDS;
  w.time.dayFraction += dayProgress;
  while (w.time.dayFraction >= 1) {
    w.time.dayFraction -= 1;
    w.time.day += 1;
    const totalSeasons = Math.floor((w.time.day - 1) / DAYS_PER_SEASON);
    const newSeason: Season = SEASONS[totalSeasons % 4];
    const newYear = 1 + Math.floor(totalSeasons / 4);
    if (newSeason !== w.time.season) {
      w.time.season = newSeason;
      w.notify(`${seasonLabel(newSeason)} — an ${newYear}`, seasonIcon(newSeason), 'neutral');
    }
    w.time.year = newYear;
  }
}

function seasonLabel(s: Season): string {
  return { spring: 'Printemps', summer: 'Été', autumn: 'Automne', winter: 'Hiver' }[s];
}
function seasonIcon(s: Season): string {
  return { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' }[s];
}

export function computeStats(w: World): void {
  let adults = 0;
  let children = 0;
  let employed = 0;
  let happinessSum = 0;
  let healthSum = 0;
  for (const v of w.villagers) {
    if (v.profession === 'child') children++;
    else {
      adults++;
      if (v.workId !== 0) employed++;
    }
    happinessSum += v.happiness;
    healthSum += v.health;
  }
  const pop = w.villagers.length;

  let housing = 0;
  for (const b of w.buildingList) {
    if (b.state !== 'active') continue;
    housing += BUILDINGS[b.def].housing?.capacity ?? 0;
  }

  const food = w.totalFood();
  const dailyNeed = Math.max(0.5, pop * NUTRITION_PER_DAY * w.modifiers.foodUpkeep * w.foodUpkeepEvent);

  w.stats.population = pop;
  w.stats.adults = adults;
  w.stats.children = children;
  w.stats.employed = employed;
  w.stats.idle = adults - employed;
  w.stats.housingCapacity = housing;
  w.stats.foodStock = food;
  w.stats.foodDays = food / dailyNeed;
  w.stats.happiness = pop === 0 ? 50 : clamp(happinessSum / pop, 0, 100);
  w.stats.health = pop === 0 ? 100 : clamp(healthSum / pop, 0, 100);
  w.stats.gold = w.treasury;
}

// ── New game setup ─────────────────────────────────────────────────────────

export interface NewGameOptions extends Partial<WorldGenOptions> {
  startingVillagers?: number;
  startingGold?: number;
}

export function createNewGame(opts: NewGameOptions = {}): Simulation {
  const sim = new Simulation(opts);
  const w = sim.world;
  w.rebuildServiceFields();
  const sx = w.startX;
  const sy = w.startY;

  w.treasury = opts.startingGold ?? 140;

  // Clear a small glade so the first buildings have somewhere to go. The felled
  // timber goes straight into the stores, which doubles as the opening tutorial.
  let salvagedLogs = 0;
  for (const node of [...w.nodes.values()]) {
    if (node.kind !== 'tree') continue;
    const d2 = (node.x - sx) ** 2 + (node.y - sy) ** 2;
    if (d2 > 42) continue;
    salvagedLogs++;
    w.killNode(node.id);
  }

  // The town hall is the anchor; everything else is the player's doing.
  const hall = w.place('town_hall', sx - 2, sy - 2, 0, true);
  const hallX = hall ? hall.cx : sx;
  const hallY = hall ? hall.cy : sy;

  placeNear(w, 'storehouse', hallX + 5, hallY, true);
  // Two salvaged shelters: enough to start, nowhere near enough to grow.
  placeNear(w, 'shack', hallX - 5, hallY + 3, true);
  placeNear(w, 'shack', hallX - 5, hallY - 3, true);

  // The abandoned village the player has come to rebuild.
  scatterRuins(w, hallX, hallY);

  // Starting stock: enough to raise the first camps, not enough to coast.
  w.addToStock('logs', 70 + Math.min(40, salvagedLogs));
  w.addToStock('planks', 24);
  w.addToStock('stone', 24);
  w.addToStock('berries', 70);
  w.addToStock('bread', 30);
  w.refreshStockCache();

  const count = opts.startingVillagers ?? 8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = clamp(hallX + Math.cos(a) * 4, 2, w.map.width - 3);
    const y = clamp(hallY + Math.sin(a) * 4, 2, w.map.height - 3);
    createVillager(w, x, y, w.rng.range(18, 40), i % 2 === 0);
  }
  // A couple of children so the village reads as alive from the first frame.
  for (let i = 0; i < 2; i++) {
    createVillager(w, hallX + w.rng.range(-3, 3), hallY + w.rng.range(-3, 3), w.rng.range(3, 12));
  }

  computeStats(w);
  w.notify('Le village vous attend. Commencez par le bois.', '🪵', 'neutral', hallX, hallY);
  return sim;
}

function placeNear(w: World, def: BuildingId, x: number, y: number, instant: boolean): void {
  for (let r = 0; r < 18; r++) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (Math.abs(i) !== r && Math.abs(j) !== r && r > 0) continue;
        const px = Math.round(x + i);
        const py = Math.round(y + j);
        if (w.canPlace(def, px, py).ok) {
          w.place(def, px, py, 0, instant);
          return;
        }
      }
    }
  }
}

/**
 * Drops a handful of collapsed structures around the start. They do nothing
 * except look evocative and hand back salvage when the player clears them.
 */
function scatterRuins(w: World, cx: number, cy: number): void {
  const count = w.rng.int(5, 8);
  let placed = 0;
  for (let attempt = 0; attempt < 120 && placed < count; attempt++) {
    const a = w.rng.range(0, Math.PI * 2);
    const r = w.rng.range(7, 22);
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    const def: BuildingId = w.rng.chance(0.6) ? 'shack' : 'cottage';
    if (!w.canPlace(def, x, y).ok) continue;
    const b = w.place(def, x, y, w.rng.int(0, 3), true);
    if (!b) continue;
    b.state = 'ruined';
    b.enabled = false;
    b.delivered = { logs: w.rng.int(6, 14), stone: w.rng.int(0, 8) };
    placed++;
  }
}
