import { clamp } from '../core/util';
import { BUILDINGS } from '../data/buildings';
import { TERRAIN, type ResourceNode } from './types';
import type { World } from './world';

let nextNaturalId = 1_000_000;

/** Trees, bushes and herds. Everything that regrows on its own. */
export function updateNature(world: World, dt: number): void {
  const growth = world.growthFactor();

  // Saplings become harvestable trees.
  for (const n of world.nodes.values()) {
    if (n.kind === 'tree' && n.growth < 1) {
      n.growth = Math.min(1, n.growth + dt * 0.006 * growth);
    } else if (n.kind === 'berry_bush' && n.amount < n.maxAmount) {
      n.amount = Math.min(n.maxAmount, n.amount + dt * 0.35 * growth);
    }
  }

  updateForesters(world, dt, growth);
  updateHerds(world, dt);
}

function updateForesters(world: World, dt: number, growth: number): void {
  for (const b of world.buildingList) {
    if (b.def !== 'forester_hut' || b.state !== 'active' || !b.enabled) continue;
    if (b.workers.length === 0) {
      b.stall = 'Sans forestier';
      continue;
    }
    b.stall = null;
    b.efficiency = 1;
    // One sapling roughly every four seconds per worker, faster in spring.
    b.work += dt * b.workers.length * growth;
    const interval = 4;
    while (b.work >= interval) {
      b.work -= interval;
      plantSapling(world, b.cx, b.cy, 15);
    }
  }
}

function plantSapling(world: World, cx: number, cy: number, radius: number): void {
  for (let attempt = 0; attempt < 14; attempt++) {
    const a = world.rng.range(0, Math.PI * 2);
    const r = Math.sqrt(world.rng.next()) * radius;
    const x = Math.floor(cx + Math.cos(a) * r);
    const y = Math.floor(cy + Math.sin(a) * r);
    if (!world.map.inBounds(x, y)) continue;
    const i = world.map.idx(x, y);
    const t = world.map.terrain[i];
    if (t === TERRAIN.WATER || t === TERRAIN.ROCK || t === TERRAIN.SAND) continue;
    if (world.map.occupancy[i] !== -1 || world.map.blocker[i] !== -1) continue;
    if (world.map.road[i] !== 0) continue;
    const node: ResourceNode = {
      id: nextNaturalId++,
      kind: 'tree',
      x,
      y,
      amount: 1,
      maxAmount: 1,
      variant: world.rng.int(0, 3),
      growth: 0.08,
      alive: true,
      claimedBy: 0,
    };
    world.addNode(node);
    return;
  }
}

function updateHerds(world: World, dt: number): void {
  const alive: ResourceNode[] = [];
  for (const a of world.animals) {
    if (!a.alive) continue;
    alive.push(a);
    a.wanderTimer = (a.wanderTimer ?? 0) - dt;
    if (a.wanderTimer <= 0) {
      a.wanderTimer = world.rng.range(3, 11);
      const ang = world.rng.range(0, Math.PI * 2);
      const speed = world.rng.range(0.25, 0.75);
      a.vx = Math.cos(ang) * speed;
      a.vy = Math.sin(ang) * speed;
    }
    const nx = a.x + (a.vx ?? 0) * dt;
    const ny = a.y + (a.vy ?? 0) * dt;
    if (world.map.walkable(Math.floor(nx), Math.floor(ny))) {
      a.x = nx;
      a.y = ny;
    } else {
      a.vx = -(a.vx ?? 0);
      a.vy = -(a.vy ?? 0);
    }
  }
  world.animals = alive;

  // Repopulate the woods so hunting is renewable but never free.
  const target = Math.round((world.map.width * world.map.height) / 950);
  if (alive.length < target && world.rng.chance(dt * 0.25 * world.growthFactor())) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = world.rng.int(3, world.map.width - 4);
      const y = world.rng.int(3, world.map.height - 4);
      if (world.map.terrain[world.map.idx(x, y)] !== TERRAIN.FOREST) continue;
      if (!world.map.walkable(x, y)) continue;
      const node: ResourceNode = {
        id: nextNaturalId++,
        kind: 'wild_animal',
        x,
        y,
        amount: 1,
        maxAmount: 1,
        variant: world.rng.int(0, 1),
        growth: 1,
        alive: true,
        claimedBy: 0,
        vx: 0,
        vy: 0,
        wanderTimer: world.rng.range(0, 5),
      };
      world.nodes.set(node.id, node);
      world.animals.push(node);
      world.nodeGrid.insert(node);
      break;
    }
  }
}

/** Livestock breeds inside pastures and is culled by the recipe. */
export function updateLivestock(world: World, dt: number): void {
  for (const b of world.buildingList) {
    const def = BUILDINGS[b.def];
    if (!def.livestock || b.state !== 'active') continue;
    const cap = def.livestock.capacity;
    const fed = (b.inv.wheat ?? 0) > 0 ? 1 : 0.35;
    b.herd = clamp(b.herd + dt * 0.02 * fed * (1 - b.herd / cap), 0.5, cap);
  }
}
