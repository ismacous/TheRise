import { clamp } from '../core/util';
import { BUILDINGS } from '../data/buildings';
import { SEASONS, type Building, type WeatherKind } from './types';
import { createVillager } from './villagers';
import type { World } from './world';

// ── Weather ────────────────────────────────────────────────────────────────

const SEASON_WEATHER: Record<string, Array<[WeatherKind, number]>> = {
  spring: [
    ['clear', 0.5],
    ['rain', 0.33],
    ['fog', 0.1],
    ['storm', 0.07],
  ],
  summer: [
    ['clear', 0.72],
    ['rain', 0.16],
    ['storm', 0.09],
    ['fog', 0.03],
  ],
  autumn: [
    ['clear', 0.42],
    ['rain', 0.34],
    ['fog', 0.15],
    ['storm', 0.09],
  ],
  winter: [
    ['clear', 0.42],
    ['snow', 0.38],
    ['fog', 0.13],
    ['storm', 0.07],
  ],
};

export function updateWeather(world: World, dt: number): void {
  world.weatherTimer -= dt;
  if (world.weatherTimer <= 0) {
    const table = SEASON_WEATHER[world.time.season];
    const roll = world.rng.next();
    let acc = 0;
    let picked: WeatherKind = 'clear';
    for (const [kind, p] of table) {
      acc += p;
      if (roll <= acc) {
        picked = kind;
        break;
      }
    }
    if (picked !== world.weather) {
      world.weather = picked;
      if (picked === 'rain') {
        world.notify('La pluie tombe : récoltes accélérées, moral en baisse', '🌧️', 'neutral');
      } else if (picked === 'storm') {
        world.notify('Orage sur la vallée : tout le monde ralentit', '⛈️', 'bad');
      } else if (picked === 'snow') {
        world.notify('La neige recouvre les toits', '❄️', 'neutral');
      }
    }
    world.weatherTimer = world.rng.range(60, 190);
  }
  const wet = world.weather === 'rain' ? 1 : world.weather === 'storm' ? 0.85 : world.weather === 'snow' ? 0.4 : 0;
  world.wetness += (wet - world.wetness) * Math.min(1, dt * 0.35);
}

// ── Fires ──────────────────────────────────────────────────────────────────

export function updateFires(world: World, dt: number): void {
  // Ignition.
  const dryness = world.weather === 'rain' || world.weather === 'storm' ? 0.15 : world.weather === 'snow' ? 0.5 : 1;
  const summer = world.time.season === 'summer' ? 1.6 : 1;
  for (const b of world.buildingList) {
    if (b.state !== 'active') continue;
    const def = BUILDINGS[b.def];
    if (def.fireRisk <= 0) continue;
    const protection = world.fireProtectionAt(b.cx, b.cy);
    const p =
      0.0000034 *
      dt *
      def.fireRisk *
      dryness *
      summer *
      world.modifiers.fireRisk *
      (1 / (1 + protection * 1.4));
    if (world.rng.next() < p) igniteBuilding(world, b);
  }

  // Burning. Villagers douse fires during their own update, which runs before
  // this pass, so the extinction test needs an epsilon: comparing against zero
  // exactly left buildings smouldering forever at the growth rate added below.
  const OUT = 0.05;
  for (const b of world.buildingList) {
    if (b.state !== 'burning') continue;
    const protection = world.fireProtectionAt(b.cx, b.cy);
    const spreadRate = 0.019 * (world.weather === 'rain' ? 0.45 : 1) * (1 / (1 + protection * 0.5));

    if (b.fire <= OUT) {
      b.state = 'active';
      b.fire = 0;
      world.notify(`Incendie maîtrisé : ${BUILDINGS[b.def].name}`, '💧', 'good', b.cx, b.cy);
      continue;
    }
    b.fire = clamp(b.fire + spreadRate * dt, 0, 1);

    // Only a well-established blaze throws sparks at its neighbours.
    if (b.fire > 0.35 && world.rng.chance(dt * 0.04 * b.fire)) {
      for (const other of world.buildingList) {
        if (other === b || other.state !== 'active') continue;
        const d2 = (other.cx - b.cx) ** 2 + (other.cy - b.cy) ** 2;
        if (d2 < 30 && BUILDINGS[other.def].fireRisk > 0 && world.rng.chance(0.3)) {
          igniteBuilding(world, other);
          break;
        }
      }
    }

    if (b.fire >= 1) {
      world.notify(`${BUILDINGS[b.def].name} détruit par les flammes`, '🔥', 'bad', b.cx, b.cy);
      world.removeBuilding(b.id, false);
    }
  }

  dispatchFirefighters(world);
}

export function igniteBuilding(world: World, b: Building): void {
  if (b.state !== 'active') return;
  b.state = 'burning';
  b.fire = 0.12;
  world.notify(`Au feu ! ${BUILDINGS[b.def].name} brûle`, '🔥', 'bad', b.cx, b.cy);
  world.pushEvent({
    kind: 'fire',
    title: 'Incendie',
    body: `${BUILDINGS[b.def].name} a pris feu. Envoyez du monde, ou construisez des puits.`,
    duration: 90,
    severity: 1,
    targets: [b.id],
    icon: '🔥',
    tone: 'bad',
  });
}

function dispatchFirefighters(world: World): void {
  const burning = world.buildingList.filter((b) => b.state === 'burning');
  if (burning.length === 0) return;
  for (const b of burning) {
    let assigned = 0;
    for (const v of world.villagers) {
      if (v.task.kind === 'douse' && v.task.targetId === b.id) assigned++;
    }
    // A bigger blaze pulls in more hands.
    const want = b.fire > 0.5 ? 7 : 5;
    if (assigned >= want) continue;
    // Wardens first, then anyone close enough to matter.
    const candidates = world.villagers
      .filter((v) => v.profession !== 'child' && v.task.kind !== 'douse')
      .map((v) => ({
        v,
        d: (v.x - b.cx) ** 2 + (v.y - b.cy) ** 2 - (v.profession === 'firewarden' ? 6000 : 0),
      }))
      .filter((c) => c.d < 1600)
      .sort((a, z) => a.d - z.d);
    for (const c of candidates.slice(0, want - assigned)) {
      c.v.task = { kind: 'douse', targetId: b.id, phase: 0 };
      c.v.path = null;
    }
  }
}

// ── Random village events ──────────────────────────────────────────────────

export function updateVillageEvents(world: World, dt: number): void {
  for (let i = world.activeEvents.length - 1; i >= 0; i--) {
    const e = world.activeEvents[i];
    e.remaining -= dt;
    if (e.remaining <= 0) {
      world.activeEvents.splice(i, 1);
      world.emitter.emit('eventEnded', e);
    }
  }

  world.eventCooldown -= dt;
  if (world.eventCooldown > 0) return;
  if (world.stats.population < 6) {
    world.eventCooldown = 60;
    return;
  }
  world.eventCooldown = world.rng.range(150, 380);

  const roll = world.rng.next();
  if (roll < 0.2) startDisease(world);
  else if (roll < 0.42) startBlessing(world);
  else if (roll < 0.58) startBumperCrop(world);
  else if (roll < 0.74) startWanderingFamily(world);
  else if (roll < 0.88) startMerchantVisit(world);
  else startHarshSeason(world);
}

function startDisease(world: World): void {
  const healers = world.buildingList.filter((b) => b.def === 'healer_hut' && b.state === 'active').length;
  const severity = clamp(0.6 * world.modifiers.diseaseResist * (1 - healers * 0.25), 0.12, 1);
  const count = Math.max(1, Math.round(world.stats.population * 0.08 * severity));
  const shuffled = world.rng.shuffle([...world.villagers]);
  for (const v of shuffled.slice(0, count)) v.sick = 1;
  world.pushEvent({
    kind: 'disease',
    title: 'Fièvre au village',
    body: `${count} villageois sont alités. Une herboriste réduirait la durée et la gravité.`,
    duration: 180,
    severity,
    targets: [],
    icon: '🤒',
    tone: 'bad',
  });
}

function startBlessing(world: World): void {
  world.weather = 'rain';
  world.weatherTimer = 150;
  world.pushEvent({
    kind: 'rain_blessing',
    title: 'Pluies bienfaisantes',
    body: "Les champs et les forêts poussent bien plus vite, mais l'humeur est morose.",
    duration: 150,
    severity: 1,
    targets: [],
    icon: '🌧️',
    tone: 'neutral',
  });
}

function startBumperCrop(world: World): void {
  const fields = world.buildingList.filter((b) => BUILDINGS[b.def].category === 'farming');
  for (const f of fields) f.work += BUILDINGS[f.def].recipe?.work ?? 0;
  world.pushEvent({
    kind: 'bumper_crop',
    title: 'Récolte exceptionnelle',
    body: 'Les champs donnent une moisson entière en prime.',
    duration: 30,
    severity: 1,
    targets: fields.map((f) => f.id),
    icon: '🌾',
    tone: 'good',
  });
}

function startWanderingFamily(world: World): void {
  const free = world.stats.housingCapacity - world.stats.population;
  if (free < 3) return;
  const hall = world.buildingList.find((b) => b.def === 'town_hall');
  const ex = hall ? hall.cx : world.startX;
  const ey = hall ? hall.cy : world.startY;
  const adults = 2;
  const kids = world.rng.int(1, 3);
  for (let i = 0; i < adults; i++) {
    createVillager(world, ex + world.rng.range(-2, 2), ey + world.rng.range(-2, 2), world.rng.range(22, 38), i === 0);
  }
  for (let i = 0; i < kids; i++) {
    createVillager(world, ex + world.rng.range(-2, 2), ey + world.rng.range(-2, 2), world.rng.range(1, 12));
  }
  world.pushEvent({
    kind: 'wandering_family',
    title: 'Une famille sur les routes',
    body: `${adults} adultes et ${kids} enfants demandent asile. Ils rejoignent le village.`,
    duration: 25,
    severity: 1,
    targets: [],
    icon: '👨‍👩‍👧',
    tone: 'good',
  });
}

function startMerchantVisit(world: World): void {
  const bonus = Math.round(20 + world.stats.population * 1.4);
  world.treasury += bonus;
  world.pushEvent({
    kind: 'merchant_visit',
    title: 'Colporteur de passage',
    body: `Un marchand ambulant a fait halte au village et laissé ${bonus} pièces.`,
    duration: 25,
    severity: 1,
    targets: [],
    icon: '🧳',
    tone: 'good',
  });
}

function startHarshSeason(world: World): void {
  const idx = SEASONS.indexOf(world.time.season);
  const isCold = idx === 3;
  world.pushEvent({
    kind: 'harsh_winter',
    title: isCold ? 'Hiver rigoureux' : 'Saison difficile',
    body: 'Les réserves fondent plus vite que prévu. Surveillez la nourriture.',
    duration: 240,
    severity: 1.35,
    targets: [],
    icon: '🥶',
    tone: 'bad',
  });
}

/** Multiplier applied to food consumption by active events. */
export function eventFoodMultiplier(world: World): number {
  let m = 1;
  for (const e of world.activeEvents) {
    if (e.kind === 'harsh_winter') m *= e.severity;
  }
  return m;
}
