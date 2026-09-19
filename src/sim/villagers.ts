import { Rng } from '../core/rng';
import { clamp } from '../core/util';
import { BUILDINGS, type NodeKind } from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import { FEMALE_NAMES, HAIR_COLORS, MALE_NAMES, SKIN_TONES, SURNAMES } from '../data/names';
import type { ProfessionId } from '../data/professions';
import { taxHappiness } from './economy';
import { gatherRadius, outputMultiplier, storageCapacity } from './levels';
import { gatherYieldFor, workSpeedFor } from './modifiers';
import { TERRAIN, type Building, type ResourceNode, type Villager } from './types';
import { DAY_SECONDS, type World } from './world';

/** A child becomes a worker after four days — about forty minutes of play. */
export const ADULT_AGE = 4;
export const OLD_AGE = 26;
/** Tiles per second on flat grass, unburdened. */
export const BASE_SPEED = 2.6;

export const NODE_GOOD: Record<NodeKind, GoodId> = {
  tree: 'logs',
  berry_bush: 'berries',
  stone_rock: 'stone',
  clay_patch: 'clay',
  coal_vein: 'coal',
  iron_vein: 'iron_ore',
  gold_vein: 'gold_ore',
  fish_shoal: 'fish',
  wild_animal: 'game',
};

export function createVillager(world: World, x: number, y: number, age: number, female?: boolean): Villager {
  const rng = world.rng;
  const isFemale = female ?? rng.chance(0.5);
  const v: Villager = {
    id: world.allocVillagerId(),
    name: rng.pick(isFemale ? FEMALE_NAMES : MALE_NAMES),
    surname: rng.pick(SURNAMES),
    female: isFemale,
    age,
    skin: rng.int(0, SKIN_TONES.length - 1),
    hair: rng.int(0, HAIR_COLORS.length - 1),
    hairStyle: rng.int(0, 3),
    bodyScale: rng.range(0.93, 1.07),
    profession: age < ADULT_AGE ? 'child' : 'idle',
    homeId: 0,
    workId: 0,
    x,
    y,
    prevX: x,
    prevY: y,
    prevAngle: 0,
    angle: rng.range(0, Math.PI * 2),
    state: 'idle',
    task: { kind: 'none' },
    path: null,
    pathIndex: 0,
    pathCooldown: 0,
    taskCooldown: 0,
    stuckTimer: 0,
    bestDist: Infinity,
    targetX: x,
    targetY: y,
    carrying: null,
    carryAmount: 0,
    satiety: 80,
    energy: 90,
    happiness: 60,
    health: 100,
    sick: 0,
    work: 0,
    phase: rng.range(0, Math.PI * 2),
    idleFor: 0,
    pregnant: 0,
    happinessTarget: 60,
  };
  world.villagers.push(v);
  world.villagerById.set(v.id, v);
  return v;
}

export function fullName(v: Villager): string {
  return `${v.name} ${v.surname}`;
}

/** Villager speed after terrain, load, morale and research. */
export function speedOf(world: World, v: Villager): number {
  const terrain = world.map.speedAt(v.x, v.y);
  const load = v.carrying ? 0.82 : 1;
  const morale = 0.8 + (v.happiness / 100) * 0.3;
  const fed = v.satiety < 15 ? 0.7 : 1;
  const sick = v.sick > 0 ? 0.65 : 1;
  const weather = world.weather === 'storm' ? 0.8 : world.weather === 'snow' ? 0.85 : 1;
  return BASE_SPEED * terrain * load * morale * fed * sick * weather * world.modifiers.moveSpeed;
}

/**
 * Steps a villager toward (tx, ty), pathing around obstacles when needed.
 * Returns true once within `arrive` tiles of the target.
 */
export function moveTowards(
  world: World,
  v: Villager,
  dt: number,
  tx: number,
  ty: number,
  arrive = 0.55,
): boolean {
  const dx = tx - v.x;
  const dy = ty - v.y;
  const distSq = dx * dx + dy * dy;
  if (distSq <= arrive * arrive) {
    v.path = null;
    v.stuckTimer = 0;
    v.bestDist = Infinity;
    return true;
  }

  v.pathCooldown -= dt;
  const targetMoved = Math.abs(tx - v.targetX) > 0.9 || Math.abs(ty - v.targetY) > 0.9;
  if (targetMoved) {
    v.path = null;
    v.targetX = tx;
    v.targetY = ty;
    v.stuckTimer = 0;
    v.bestDist = Infinity;
  }

  // Progress watchdog. A building walled in by its neighbours used to trap its
  // carriers forever, and one stuck carrier holding a load is one worker the
  // village never gets back.
  const dist = Math.sqrt(distSq);
  if (dist < v.bestDist - 0.3) {
    v.bestDist = dist;
    v.stuckTimer = 0;
  } else {
    v.stuckTimer += dt;
  }

  // Short clear hops do not deserve a full A* search.
  const needsPath =
    !v.path &&
    (distSq > 36 || !world.pathfinder.straightWalkable(v.x, v.y, tx, ty));

  if (needsPath && v.pathCooldown <= 0) {
    if (world.pathfinder.budget > 0) {
      v.pathCooldown = 0.45 + world.rng.next() * 0.3;
      const p = world.pathfinder.find(v.x, v.y, tx, ty, 1.5);
      v.path = p && p.length > 0 ? p : null;
      v.pathIndex = 0;
    } else {
      // No search slot this tick: keep walking straight and try again shortly.
      v.pathCooldown = 0.05 + world.rng.next() * 0.1;
    }
  }

  let goalX = tx;
  let goalY = ty;
  if (v.path && v.pathIndex < v.path.length) {
    const tile = v.path[v.pathIndex];
    goalX = (tile % world.map.width) + 0.5;
    goalY = Math.floor(tile / world.map.width) + 0.5;
    if ((goalX - v.x) ** 2 + (goalY - v.y) ** 2 < 0.2) {
      v.pathIndex++;
      if (v.pathIndex >= v.path.length) v.path = null;
    }
  }

  const gdx = goalX - v.x;
  const gdy = goalY - v.y;
  const gl = Math.hypot(gdx, gdy);
  if (gl < 1e-4) return false;
  const speed = speedOf(world, v);
  const step = Math.min(gl, speed * dt);
  const nx = v.x + (gdx / gl) * step;
  const ny = v.y + (gdy / gl) * step;

  // Never let rounding push a villager into water or a wall. A refused
  // diagonal is retried one axis at a time: cutting a corner between two
  // buildings used to reject the step outright, and a villager whose only
  // route out was that corner walked on the spot until it starved.
  if (world.map.walkable(Math.floor(nx), Math.floor(ny))) {
    v.x = nx;
    v.y = ny;
  } else if (world.map.walkable(Math.floor(nx), Math.floor(v.y))) {
    v.x = nx;
  } else if (world.map.walkable(Math.floor(v.x), Math.floor(ny))) {
    v.y = ny;
  } else {
    v.path = null;
    v.pathCooldown = 0;
  }

  const desired = Math.atan2(gdy, gdx);
  let diff = desired - v.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  v.angle += diff * Math.min(1, dt * 9);

  return false;
}

/** Amount a villager carries per trip for a given good. */
export function carryCapacity(world: World, good: GoodId, v?: Villager): number {
  // A storehouse carrier works with a handcart; an unassigned labourer does not.
  const cart = v && v.profession === 'carrier' ? 1.6 : 1;
  return Math.max(1, Math.round(GOODS[good].carry * world.modifiers.carryCapacity * cart));
}

export function buildingInvTotal(b: Building): number {
  let n = 0;
  for (const v of Object.values(b.inv)) n += v as number;
  return n;
}

export function buildingSpace(_world: World, b: Building): number {
  return storageCapacity(b) - buildingInvTotal(b);
}

export function depositIntoBuilding(world: World, b: Building, good: GoodId, amount: number): number {
  // Somebody got here, so whatever made an earlier carrier give up is over.
  // Without this a single timed-out delivery labels a storehouse unreachable
  // for the rest of the game: nothing else ever clears the flag on a building
  // that produces nothing.
  if (b.stall === 'Accès bloqué') b.stall = null;
  const space = buildingSpace(world, b);
  const put = Math.max(0, Math.min(space, amount));
  if (put > 0) b.inv[good] = (b.inv[good] ?? 0) + put;
  return amount - put;
}

// ── Node selection ─────────────────────────────────────────────────────────

export function findHarvestNode(world: World, b: Building, v: Villager): ResourceNode | null {
  const def = BUILDINGS[b.def];
  if (!def.gather) return null;
  const kinds = def.gather.nodes;
  const radius = gatherRadius(b);
  let best: ResourceNode | null = null;
  let bestScore = Infinity;
  world.nodeGrid.query(b.cx, b.cy, radius, (n) => {
    if (!n.alive || n.amount <= 0) return;
    if (!kinds.includes(n.kind)) return;
    if (n.growth < 0.95 && n.kind === 'tree') return;
    // Only single-use nodes — a tree to fell, an animal to hunt — are claimed.
    // A vein, a quarry rock or a berry bush holds plenty for a whole crew, and
    // reserving it for one worker left the rest of the team reporting that
    // there was nothing in range.
    if (n.maxAmount <= 1 && n.claimedBy !== 0 && n.claimedBy !== v.id) return;
    const dxb = n.x - b.cx;
    const dyb = n.y - b.cy;
    if (dxb * dxb + dyb * dyb > radius * radius) return;
    // Prefer nodes near the worker, but keep the camp's own distance in mind
    // so crews spread out instead of all racing to the same tree.
    const dxv = n.x - v.x;
    const dyv = n.y - v.y;
    const score = dxv * dxv + dyv * dyv + (dxb * dxb + dyb * dyb) * 0.25;
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  });
  return best;
}

/** Where a worker must stand to harvest a node (fish and trees block tiles). */
export function harvestStandPoint(world: World, n: ResourceNode): { x: number; y: number } {
  const nx = Math.floor(n.x);
  const ny = Math.floor(n.y);
  if (world.map.walkable(nx, ny)) return { x: n.x + 0.5, y: n.y + 0.5 };
  for (let r = 1; r <= 3; r++) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (Math.abs(i) !== r && Math.abs(j) !== r) continue;
        if (world.map.walkable(nx + i, ny + j)) return { x: nx + i + 0.5, y: ny + j + 0.5 };
      }
    }
  }
  return { x: n.x, y: n.y };
}

export function yieldFromNode(world: World, b: Building, n: ResourceNode): { good: GoodId; amount: number } {
  const def = BUILDINGS[b.def];
  const g = def.gather!;
  const mul = gatherYieldFor(world.modifiers, def.profession) * outputMultiplier(b);
  const entries = Object.entries(g.outputs) as Array<[GoodId, number]>;
  if (entries.length === 0) {
    // Deep mine and other polymorphic extractors take whatever the vein holds.
    const good = NODE_GOOD[n.kind];
    return { good, amount: Math.max(1, Math.round(3 * mul)) };
  }
  const [good, amount] = entries[0];
  return { good, amount: Math.max(1, Math.round(amount * mul)) };
}

/** Secondary outputs (hides from the hunting lodge, etc.). */
export function extraYields(_world: World, b: Building): Array<[GoodId, number]> {
  const g = BUILDINGS[b.def].gather;
  if (!g) return [];
  const mul = outputMultiplier(b);
  const entries = Object.entries(g.outputs) as Array<[GoodId, number]>;
  return entries.slice(1).map(([good, amount]) => [good, Math.max(1, Math.round(amount * mul))]);
}

export function workRate(world: World, v: Villager, profession: ProfessionId): number {
  const daylight = world.daylight();
  const nightPenalty = 0.35 + daylight * 0.65;
  const morale = 0.7 + (v.happiness / 100) * 0.45;
  const fed = v.satiety < 25 ? 0.6 : v.satiety < 50 ? 0.85 : 1;
  const sick = v.sick > 0 ? 0.45 : 1;
  const weather = world.weather === 'storm' ? 0.7 : world.weather === 'snow' ? 0.8 : 1;
  return workSpeedFor(world.modifiers, profession) * nightPenalty * morale * fed * sick * weather;
}

/** Picks a scenic idle destination so the village never looks frozen. */
export function wanderTarget(world: World, v: Villager, rng: Rng): { x: number; y: number } {
  const anchor = v.homeId ? world.buildings.get(v.homeId) : null;
  const ax = anchor ? anchor.cx : world.startX;
  const ay = anchor ? anchor.cy : world.startY;
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(clamp(ax + rng.gaussian(0, 7), 2, world.map.width - 3));
    const y = Math.floor(clamp(ay + rng.gaussian(0, 7), 2, world.map.height - 3));
    if (world.map.walkable(x, y) && world.map.terrain[world.map.idx(x, y)] !== TERRAIN.WATER) {
      return { x: x + 0.5, y: y + 0.5 };
    }
  }
  return { x: v.x, y: v.y };
}

export function happinessTarget(world: World, v: Villager): number {
  let h = 42 + world.modifiers.happiness;
  // Food quality: eating a varied diet matters more than raw calories.
  h += Math.min(14, world.foodVariety * 3.5);
  if (v.satiety > 70) h += 10;
  else if (v.satiety < 30) h -= 22;
  else if (v.satiety < 50) h -= 8;

  const home = v.homeId ? world.buildings.get(v.homeId) : null;
  if (home) {
    const def = BUILDINGS[home.def];
    h += (def.housing?.comfort ?? 0) * 14;
    const crowd = home.residents.length / Math.max(1, def.housing?.capacity ?? 1);
    if (crowd > 1) h -= (crowd - 1) * 25;
  } else {
    h -= 24;
  }

  // Work. Being idle is dispiriting; a job at a workshop that is actually
  // running is the opposite. The design says happiness comes from taxes, work,
  // home and leisure — this is the "work" term, and it was missing.
  if (v.profession === 'child') {
    h += 4;
  } else if (v.workId === 0) {
    h -= 6;
  } else {
    const work = world.buildings.get(v.workId);
    h += work && !work.stall ? 7 : 2;
  }
  h += taxHappiness(world);
  if (v.sick > 0) h -= 20;
  if (world.weather === 'rain') h -= 4;
  if (world.weather === 'storm') h -= 9;
  if (world.time.season === 'winter') h -= 6;
  h += world.serviceBonusAt(v.x, v.y);
  return clamp(h, 0, 100);
}

/** Recomputed once per stats pass rather than per villager per tick. */
export function countFoodVariety(world: World): number {
  let n = 0;
  for (const g of ['bread', 'meat', 'fish', 'smoked_fish', 'berries', 'eggs'] as GoodId[]) {
    if ((world.stock[g] ?? 0) > 5) n++;
  }
  return n;
}

export function isAdult(v: Villager): boolean {
  return v.age >= ADULT_AGE;
}

export function canWork(v: Villager): boolean {
  return isAdult(v) && v.age < OLD_AGE + 12 && v.sick < 2;
}

export function clearTask(v: Villager): void {
  v.task = { kind: 'none' };
  v.work = 0;
  v.path = null;
  v.stuckTimer = 0;
  v.bestDist = Infinity;
}

/**
 * Returns whatever a villager is carrying to the stores. Any code path that
 * cancels a task must call this, or the load rides around on someone who is no
 * longer doing the job and is lost to the village.
 */
export function dropCarried(world: World, v: Villager): void {
  if (!v.carrying) return;
  const leftover = world.addToStock(v.carrying, v.carryAmount, v.x, v.y);
  if (leftover > 0 && v.workId) {
    const work = world.buildings.get(v.workId);
    if (work) {
      const cap = BUILDINGS[work.def].storage?.capacity ?? 0;
      let used = 0;
      for (const amount of Object.values(work.inv)) used += amount as number;
      const room = Math.max(0, cap - used);
      const put = Math.min(room, leftover);
      if (put > 0) work.inv[v.carrying] = (work.inv[v.carrying] ?? 0) + put;
    }
  }
  v.carrying = null;
  v.carryAmount = 0;
}

/**
 * Puts a villager back on walkable ground.
 *
 * `moveTowards` refuses every step that would land on an unwalkable tile, so a
 * villager who ends up standing *inside* one — a building raised on top of
 * them, terrain flattened under their feet — can never move again. They then
 * walk on the spot until they starve, with full storehouses a few tiles away.
 * One array lookup per tick buys immunity from that whole class of bug.
 */
export function rescueIfTrapped(world: World, v: Villager): void {
  const cx = Math.floor(v.x);
  const cy = Math.floor(v.y);
  const onSolidGround = world.map.walkable(cx, cy);
  // A one-tile island counts as trapped too: the tile itself is fine, but a
  // tree or a new wall has closed every way off it, and A* cannot route out of
  // somewhere it cannot leave.
  const hasExit =
    world.map.walkable(cx + 1, cy) ||
    world.map.walkable(cx - 1, cy) ||
    world.map.walkable(cx, cy + 1) ||
    world.map.walkable(cx, cy - 1);
  if (onSolidGround && hasExit) return;
  for (let r = 1; r <= 8; r++) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (Math.abs(i) !== r && Math.abs(j) !== r) continue;
        const x = cx + i;
        const y = cy + j;
        if (!world.map.walkable(x, y)) continue;
        v.x = x + 0.5;
        v.y = y + 0.5;
        v.prevX = v.x;
        v.prevY = v.y;
        v.path = null;
        v.stuckTimer = 0;
        v.bestDist = Infinity;
        return;
      }
    }
  }
}

/** Seconds of no progress after which a destination is treated as unreachable. */
export const STUCK_LIMIT = 12;

export function isStuck(v: Villager): boolean {
  return v.stuckTimer > STUCK_LIMIT;
}

export function releaseNode(world: World, v: Villager): void {
  if (v.task.nodeId) {
    const n = world.nodes.get(v.task.nodeId);
    if (n && n.claimedBy === v.id) n.claimedBy = 0;
  }
}

/**
 * Satiety burned per real second. Deliberately independent of the day length:
 * hunger is balanced against production rates, which are also per second, so
 * making days longer changes the light and the seasons without quietly making
 * food six times more plentiful.
 */
export const SATIETY_PER_SECOND = 0.26;
/** Satiety restored per unit of nutrition eaten. */
export const SATIETY_PER_NUTRITION = 22;
/** Nutrition one villager needs per in-game day, derived for display. */
export const NUTRITION_PER_DAY = (SATIETY_PER_SECOND * DAY_SECONDS) / SATIETY_PER_NUTRITION;

/**
 * Every rule that reacts to the larder is expressed here, in days of food, and
 * nowhere else.
 *
 * These numbers are not arbitrary: because hunger is per real second while a
 * day now lasts twelve minutes, one "day of food" is six times the stock it
 * used to be. The thresholds inherited from the two-minute day meant a brand
 * new village started below the exodus line, and no village could ever hold
 * the six days that immigration demanded — the population could only shrink.
 * A test pins the opening so that never happens again.
 */
export const FOOD_EXODUS_DAYS = 0.75;
export const FOOD_BIRTH_DAYS = 1.5;
export const FOOD_IMMIGRATION_DAYS = 2;

export function satietyDecayPerSecond(world: World): number {
  const winter = world.time.season === 'winter' ? 1.25 : 1;
  return SATIETY_PER_SECOND * winter * world.modifiers.foodUpkeep * world.foodUpkeepEvent;
}
