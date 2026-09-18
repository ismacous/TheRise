import { clamp, damp } from '../core/util';
import { BUILDINGS, type BuildingCategory } from '../data/buildings';
import { COMFORT_GOODS, GOODS, type GoodId } from '../data/goods';
import {
  ADULT_AGE,
  OLD_AGE,
  canWork,
  createVillager,
  fullName,
  happinessTarget,
  satietyDecayPerSecond,
} from './villagers';
import { DAY_SECONDS } from './world';
import type { Building, Villager } from './types';
import type { World } from './world';

/** Hiring order. Food and logistics come first when the larder runs low. */
function employmentPriority(world: World, b: Building): number {
  const def = BUILDINGS[b.def];
  const base: Record<BuildingCategory, number> = {
    gathering: 8,
    farming: 8,
    industry: 7,
    storage: 6,
    crafting: 5,
    service: 5,
    civic: 4,
    housing: 0,
    infrastructure: 0,
  };
  let p = base[def.category];
  const producesFood =
    (def.recipe && Object.keys(def.recipe.outputs).some((g) => GOODS[g as GoodId].nutrition > 0)) ||
    (def.gather && Object.keys(def.gather.outputs).some((g) => GOODS[g as GoodId].nutrition > 0));
  if (producesFood && world.stats.foodDays < 6) p += 6;
  if (def.service?.kind === 'market' && world.stats.foodDays < 8) p += 4;
  // Buildings that are starved of input do not need more idle hands.
  if (b.stall && b.stall.startsWith('Manque')) p -= 3;
  return p;
}

/**
 * Share of the adult workforce allowed to be carriers. Storehouses offer far
 * more porter slots than a young village should fill: without this cap the
 * first ten villagers all become porters and nothing is ever produced.
 */
function carrierBudget(world: World): number {
  return Math.max(1, Math.round(world.stats.adults * 0.25));
}

function countCarriers(world: World): number {
  let n = 0;
  for (const v of world.villagers) if (v.profession === 'carrier') n++;
  return n;
}

export function updateEmployment(world: World): void {
  // Drop workers whose workplace is gone or disabled.
  for (const v of world.villagers) {
    if (!v.workId) continue;
    const b = world.buildings.get(v.workId);
    if (!b || b.state !== 'active' || !b.enabled || !canWork(v)) {
      if (b) {
        const i = b.workers.indexOf(v.id);
        if (i !== -1) b.workers.splice(i, 1);
      }
      v.workId = 0;
      v.profession = v.age < ADULT_AGE ? 'child' : 'idle';
      v.task = { kind: 'none' };
    }
  }

  const carrierCap = carrierBudget(world);
  let carriers = countCarriers(world);

  const openings: Array<{ b: Building; priority: number }> = [];
  for (const b of world.buildingList) {
    if (b.state !== 'active' || !b.enabled) continue;
    const def = BUILDINGS[b.def];
    if (def.workers <= 0) continue;
    if (b.workers.length >= def.workers) continue;
    if (def.profession === 'carrier' && carriers >= carrierCap) continue;
    openings.push({ b, priority: employmentPriority(world, b) });
  }
  if (openings.length === 0) return;
  openings.sort((a, z) => z.priority - a.priority);

  const free = world.villagers.filter((v) => canWork(v) && v.workId === 0);

  // Nobody idle but something important is unstaffed: take a worker off the
  // least useful job rather than leaving a bakery empty forever.
  if (free.length === 0) {
    const top = openings[0];
    const donor = lowestPriorityWorker(world, top.priority);
    if (!donor) return;
    const from = world.buildings.get(donor.workId)!;
    const i = from.workers.indexOf(donor.id);
    if (i !== -1) from.workers.splice(i, 1);
    donor.workId = 0;
    donor.profession = 'idle';
    donor.task = { kind: 'none' };
    free.push(donor);
  }

  for (const { b } of openings) {
    const def = BUILDINGS[b.def];
    if (def.profession === 'carrier' && carriers >= carrierCap) continue;
    while (b.workers.length < def.workers && free.length > 0) {
      if (def.profession === 'carrier' && carriers >= carrierCap) break;
      // Nearest idle adult to the workplace.
      let bestIdx = 0;
      let bestD = Infinity;
      for (let i = 0; i < free.length; i++) {
        const d = (free[i].x - b.cx) ** 2 + (free[i].y - b.cy) ** 2;
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      const v = free.splice(bestIdx, 1)[0];
      b.workers.push(v.id);
      v.workId = b.id;
      v.profession = def.profession;
      v.task = { kind: 'none' };
      if (def.profession === 'carrier') carriers++;
    }
    if (free.length === 0) break;
  }
}

/** The worker doing the least urgent job, if it is clearly less urgent. */
function lowestPriorityWorker(world: World, wantedPriority: number): Villager | null {
  let worst: Villager | null = null;
  let worstPriority = wantedPriority - 2;
  for (const v of world.villagers) {
    if (!v.workId || !canWork(v)) continue;
    const b = world.buildings.get(v.workId);
    if (!b) continue;
    const p = employmentPriority(world, b);
    if (p < worstPriority) {
      worstPriority = p;
      worst = v;
    }
  }
  return worst;
}

export function updateHousing(world: World): void {
  const homeless = world.villagers.filter((v) => !v.homeId || !world.buildings.has(v.homeId));
  if (homeless.length === 0) return;
  const homes = world.buildingList.filter((b) => {
    const def = BUILDINGS[b.def];
    return b.state === 'active' && def.housing && b.residents.length < def.housing.capacity;
  });
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
      const def = BUILDINGS[h.def];
      if (h.residents.length >= def.housing!.capacity) continue;
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
    world.treasury += used * 2.2;
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

  const target = happinessTarget(world, v) + Math.min(14, world.comfortPool * 0.35);
  v.happiness = damp(v.happiness, clamp(target, 0, 100), 0.35, dt);

  // Health: starvation and sickness wear people down; rest and food restore.
  if (v.sick > 0) {
    v.sick = Math.max(0, v.sick - dt * (0.004 / world.modifiers.diseaseResist));
    v.health = Math.max(0, v.health - dt * 0.5);
  } else if (v.satiety <= 0) {
    v.health = Math.max(0, v.health - dt * 1.6);
  } else if (v.satiety > 55) {
    v.health = Math.min(100, v.health + dt * 0.8);
  }
}

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
    if (v.sick > 0.7) dieChance += 0.00004 * dt * (1 / world.modifiers.diseaseResist);
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
      world.stats.foodDays > 5 &&
      v.happiness > 45 &&
      v.satiety > 45
    ) {
      // Roughly one child per mother every eight game days at high morale,
      // slowing sharply when there are no spare beds.
      const p = 0.0016 * dt * (v.happiness / 100) * (cap > pop + 2 ? 1 : 0.2);
      if (world.rng.next() < p) v.pregnant = 2.5;
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
  for (const j of world.haulJobs) if (j.claimedBy === v.id) j.claimedBy = 0;
  if (v.task.nodeId) {
    const n = world.nodes.get(v.task.nodeId);
    if (n && n.claimedBy === v.id) n.claimedBy = 0;
  }
  const idx = world.villagers.indexOf(v);
  if (idx !== -1) world.villagers.splice(idx, 1);
  world.villagerById.delete(v.id);
  world.emitter.emit('villagerDied', { villager: v, cause });
  if (cause !== 'vieillesse') {
    world.notify(`${fullName(v)} est mort·e de ${cause}`, '🪦', 'bad', v.x, v.y);
  }
}

/** Newcomers drift in when the village is attractive and has spare beds. */
export function updateImmigration(world: World, dt: number): void {
  const s = world.stats;
  if (s.housingCapacity - s.population < 2) return;
  if (s.happiness < 48 || s.foodDays < 6) return;
  const attractiveness = clamp((s.happiness - 40) / 30, 0, 1.6) * (1 + (s.tier - 1) * 0.2);
  const p = 0.012 * dt * attractiveness;
  if (world.rng.next() >= p) return;

  const hall = world.buildingList.find((b) => b.def === 'town_hall');
  const ex = hall ? hall.cx : world.startX;
  const ey = hall ? hall.cy : world.startY;
  const group = world.rng.int(1, 3);
  for (let i = 0; i < group; i++) {
    createVillager(world, ex + world.rng.range(-2, 2), ey + world.rng.range(-2, 2), world.rng.range(16, 34));
  }
  world.notify(
    group === 1 ? 'Un voyageur s’installe au village' : `${group} nouveaux venus s’installent`,
    '🚶',
    'good',
    ex,
    ey,
  );
}
