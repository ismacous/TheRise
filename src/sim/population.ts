import { clamp, damp } from '../core/util';
import { BUILDINGS } from '../data/buildings';
import { COMFORT_GOODS, GOODS } from '../data/goods';
import {
  ADULT_AGE,
  FOOD_BIRTH_DAYS,
  FOOD_EXODUS_DAYS,
  FOOD_IMMIGRATION_DAYS,
  OLD_AGE,
  canWork,
  createVillager,
  dropCarried,
  fullName,
  happinessTarget,
  satietyDecayPerSecond,
} from './villagers';
import { housingCapacity, workerSlots } from './levels';
import { DAY_SECONDS } from './world';
import type { Building, Villager } from './types';
import type { World } from './world';

/**
 * Staffing is the player's decision now, so this only enforces the rules:
 * a worker whose building vanished, who grew too old or too ill, or who no
 * longer fits in the building's slots goes back to the pool of labourers.
 *
 * Unassigned adults are not idle — they are the ones who build and haul.
 */
export function updateEmployment(world: World): void {
  for (const v of world.villagers) {
    if (!v.workId) continue;
    const b = world.buildings.get(v.workId);
    const stillValid =
      b &&
      b.state === 'active' &&
      canWork(v) &&
      b.workers.indexOf(v.id) < workerSlots(b);
    if (stillValid) continue;
    if (b) {
      const i = b.workers.indexOf(v.id);
      if (i !== -1) b.workers.splice(i, 1);
    }
    v.workId = 0;
    v.profession = v.age < ADULT_AGE ? 'child' : 'idle';
    dropCarried(world, v);
    v.task = { kind: 'none' };
  }

  // Children who have come of age join the labour pool.
  for (const v of world.villagers) {
    if (v.profession === 'child' && v.age >= ADULT_AGE) v.profession = 'idle';
  }
}

export function updateHousing(world: World): void {
  const homeless = world.villagers.filter((v) => !v.homeId || !world.buildings.has(v.homeId));
  if (homeless.length === 0) return;
  const homes = world.buildingList.filter(
    (b) => b.state === 'active' && housingCapacity(b) > b.residents.length,
  );
  if (homes.length === 0) return;

  for (const v of homeless) {
    v.homeId = 0;
    // Prefer a home near the workplace, otherwise near where they stand.
    const anchor = v.workId ? world.buildings.get(v.workId) : null;
    const ax = anchor ? anchor.cx : v.x;
    const ay = anchor ? anchor.cy : v.y;
    let best: Building | null = null;
    let bestD = Infinity;
    for (const h of homes) {
      if (h.residents.length >= housingCapacity(h)) continue;
      const d = (h.cx - ax) ** 2 + (h.cy - ay) ** 2;
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (!best) break;
    best.residents.push(v.id);
    v.homeId = best.id;
  }
}

/** Households pull comfort goods from their market, which feeds happiness. */
export function updateHouseholdConsumption(world: World, dt: number): void {
  for (const b of world.buildingList) {
    const def = BUILDINGS[b.def];
    if (def.service?.kind !== 'market' || b.state !== 'active') continue;
    // Markets slowly convert comfort goods into village morale.
    for (const g of COMFORT_GOODS) {
      const have = b.inv[g] ?? 0;
      if (have <= 0) continue;
      const rate = 0.02 * dt * world.stats.population * 0.05;
      const used = Math.min(have, rate);
      b.inv[g] = have - used;
      if (b.inv[g]! <= 0.001) delete b.inv[g];
      world.comfortPool += used * (GOODS[g].comfort ?? 0);
    }
  }

  // Taverns turn ale into happiness and a trickle of coin.
  for (const b of world.buildingList) {
    if (b.def !== 'tavern' || b.state !== 'active' || b.workers.length === 0) continue;
    const ale = b.inv.ale ?? 0;
    if (ale <= 0) {
      b.stall = 'Plus de bière';
      continue;
    }
    b.stall = null;
    const used = Math.min(ale, dt * 0.05 * Math.max(1, world.stats.population * 0.02));
    b.inv.ale = ale - used;
    if (b.inv.ale! <= 0.001) delete b.inv.ale;
    world.comfortPool += used * 1.8;
    world.earn(used * 2.2, 'tavern');
  }

  world.comfortPool = Math.max(0, world.comfortPool - dt * 0.35);
}

export function updateVillagerNeeds(world: World, v: Villager, dt: number): void {
  v.age += dt / DAY_SECONDS;
  v.satiety = Math.max(0, v.satiety - satietyDecayPerSecond(world) * dt);
  if (v.state === 'sleeping') {
    v.energy = Math.min(100, v.energy + dt * 9);
  } else {
    v.energy = Math.max(0, v.energy - dt * 0.55);
  }

  if (v.profession === 'child' && v.age >= ADULT_AGE) {
    v.profession = 'idle';
  }

  // Happiness is the most expensive per-villager score, so each villager
  // refreshes its target on its own tenth of a second and merely eases toward
  // it in between. The result is indistinguishable and ten times cheaper.
  if ((world.tickCount + v.id) % 10 === 0) {
    v.happinessTarget = happinessTarget(world, v);
  }
  const target = v.happinessTarget + Math.min(14, world.comfortPool * 0.35);
  v.happiness = damp(v.happiness, clamp(target, 0, 100), 0.35, dt);

  // Health. Starvation is the only thing that can empty the gauge.
  if (v.satiety <= 0) {
    // Slow on purpose: a week of empty larders before anyone dies leaves the
    // player time to react. This is a chill game.
    v.health = Math.max(0, v.health - dt * 0.22);
  } else if (v.satiety > 55 && v.sick <= 0) {
    v.health = Math.min(100, v.health + dt * 0.8);
  }
  if (v.sick > 0) {
    // A fever runs its course in about four minutes, half that once herbalism
    // is studied, and wears its patient down to SICK_HEALTH_FLOOR and no
    // further. Letting it drain to zero made a single outbreak a village-wide
    // culling — and two outbreaks in a row unsurvivable however well fed the
    // village was. A fever on top of an empty belly still kills, because
    // starvation above keeps biting past the floor.
    v.sick = Math.max(0, v.sick - dt * (0.004 / world.modifiers.diseaseResist));
    if (v.health > SICK_HEALTH_FLOOR) {
      v.health = Math.max(SICK_HEALTH_FLOOR, v.health - dt * 0.2);
    }
  }
}

/** Health a fever alone will never take a villager below. */
const SICK_HEALTH_FLOOR = 30;

export interface PopulationOutcome {
  births: number;
  deaths: number;
}

export function updatePopulation(world: World, dt: number): PopulationOutcome {
  let births = 0;
  let deaths = 0;
  const cap = world.stats.housingCapacity;
  const pop = world.villagers.length;

  for (let i = world.villagers.length - 1; i >= 0; i--) {
    const v = world.villagers[i];

    // ── Death ───────────────────────────────────────────────────────────
    let dieChance = 0;
    if (v.health <= 0) dieChance = 1;
    else if (v.age > OLD_AGE) dieChance = (v.age - OLD_AGE) * 0.00002 * dt;
    // diseaseResist is a severity multiplier: below one means milder, so it
    // multiplies the risk rather than dividing it.
    if (v.sick > 0.7) dieChance += 0.00004 * dt * world.modifiers.diseaseResist;
    if (dieChance > 0 && world.rng.next() < dieChance) {
      removeVillager(world, v, v.health <= 0 ? (v.satiety <= 0 ? 'faim' : 'maladie') : 'vieillesse');
      deaths++;
      continue;
    }

    // ── Birth ───────────────────────────────────────────────────────────
    if (v.pregnant > 0) {
      v.pregnant -= dt / DAY_SECONDS;
      if (v.pregnant <= 0) {
        const child = createVillager(world, v.x, v.y, 0, undefined);
        child.surname = v.surname;
        child.skin = v.skin;
        births++;
        world.emitter.emit('villagerBorn', child);
      }
      continue;
    }
    if (
      v.female &&
      v.age >= 18 &&
      v.age <= 42 &&
      v.homeId !== 0 &&
      pop + 1 <= cap &&
      world.stats.foodDays > FOOD_BIRTH_DAYS &&
      v.happiness > 45 &&
      v.satiety > 45
    ) {
      // Roughly one child per mother every eight game days at high morale,
      // slowing sharply when there are no spare beds.
      const p = 0.0016 * dt * (v.happiness / 100) * (cap > pop + 2 ? 1 : 0.2);
      if (world.rng.next() < p) v.pregnant = 0.7;
    }
  }

  return { births, deaths };
}

export function removeVillager(world: World, v: Villager, cause: string): void {
  const home = v.homeId ? world.buildings.get(v.homeId) : null;
  if (home) {
    const i = home.residents.indexOf(v.id);
    if (i !== -1) home.residents.splice(i, 1);
  }
  const work = v.workId ? world.buildings.get(v.workId) : null;
  if (work) {
    const i = work.workers.indexOf(v.id);
    if (i !== -1) work.workers.splice(i, 1);
  }
  dropCarried(world, v);
  for (const j of world.haulJobs) if (j.claimedBy === v.id) j.claimedBy = 0;
  if (v.task.nodeId) {
    const n = world.nodes.get(v.task.nodeId);
    if (n && n.claimedBy === v.id) n.claimedBy = 0;
  }
  const idx = world.villagers.indexOf(v);
  if (idx !== -1) world.villagers.splice(idx, 1);
  world.villagerById.delete(v.id);
  world.emitter.emit('villagerDied', { villager: v, cause });
  if (cause !== 'vieillesse' && cause !== 'départ') {
    world.notify(`${fullName(v)} est mort·e de ${cause}`, '🪦', 'bad', v.x, v.y);
  }
}

/**
 * Villagers pack up and leave when life becomes unbearable. Emigration is the
 * pressure valve that keeps a mismanaged village from spiralling into a wipe:
 * the population shrinks back to what the food supply can carry instead of
 * everyone starving to death.
 */
export function updateEmigration(world: World, dt: number): void {
  const s = world.stats;
  if (world.villagers.length <= 3) return;
  const desperate = s.foodDays < FOOD_EXODUS_DAYS || s.happiness < 22;
  if (!desperate) return;

  for (let i = world.villagers.length - 1; i >= 0; i--) {
    const v = world.villagers[i];
    if (v.profession === 'child') continue;
    // Nobody packs up and walks out of the valley with a fever. Without this
    // an outbreak drove people away precisely because it had made them
    // miserable, which turned every epidemic into an exodus.
    if (v.sick > 0) continue;
    if (v.happiness > 30 && v.satiety > 25) continue;
    const p = 0.0016 * dt * (1 + (30 - Math.min(30, v.happiness)) / 30);
    if (world.rng.next() >= p) continue;
    const name = fullName(v);
    removeVillager(world, v, 'départ');
    world.notify(`${name} quitte le village`, '🚪', 'bad');
    // One departure per tick keeps the exodus legible rather than sudden.
    break;
  }
}

/** Newcomers drift in when the village is attractive and has spare beds. */
export function updateImmigration(world: World, dt: number): void {
  const s = world.stats;
  if (s.housingCapacity - s.population < 2) return;
  if (s.happiness < 48 || s.foodDays < FOOD_IMMIGRATION_DAYS) return;
  const attractiveness = clamp((s.happiness - 40) / 30, 0, 1.6) * (1 + (s.tier - 1) * 0.2);
  const p = 0.012 * dt * attractiveness;
  if (world.rng.next() >= p) return;

  const hall = world.buildingList.find((b) => b.def === 'town_hall');
  const ex = hall ? hall.cx : world.startX;
  const ey = hall ? hall.cy : world.startY;
  const group = world.rng.int(1, 3);
  for (let i = 0; i < group; i++) {
    // Young adults, not pensioners: see the note on the founding cohort.
    createVillager(world, ex + world.rng.range(-2, 2), ey + world.rng.range(-2, 2), world.rng.range(5, 18));
  }
  world.notify(
    group === 1 ? 'Un voyageur s’installe au village' : `${group} nouveaux venus s’installent`,
    '🚶',
    'good',
    ex,
    ey,
  );
}
