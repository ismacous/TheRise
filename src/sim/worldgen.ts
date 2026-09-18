import { Rng, ValueNoise2D } from '../core/rng';
import { clamp, clamp01, smoothstep } from '../core/util';
import type { NodeKind } from '../data/buildings';
import { TileMap } from './tilemap';
import { TERRAIN, type ResourceNode } from './types';

export interface WorldGenOptions {
  width: number;
  height: number;
  seed: number | string;
  /** 0 = sparse forests, 1 = dense. */
  forestDensity: number;
  /** 0 = arid, 1 = many rivers and lakes. */
  waterAmount: number;
  /** 0 = flat plain, 1 = mountainous. */
  relief: number;
}

export const DEFAULT_WORLDGEN: WorldGenOptions = {
  width: 208,
  height: 208,
  seed: 'the-rise',
  forestDensity: 0.62,
  waterAmount: 0.5,
  relief: 0.5,
};

export interface GeneratedWorld {
  map: TileMap;
  nodes: ResourceNode[];
  /** Suggested spot for the town hall: flat, near water and woods. */
  startX: number;
  startY: number;
}

const WATER_LEVEL = 0.0;

/**
 * Builds the playable valley: rolling hills, a meandering river feeding a lake,
 * forests on the wet slopes, rock and ore in the highlands.
 */
export function generateWorld(opts: Partial<WorldGenOptions> = {}): GeneratedWorld {
  const o: WorldGenOptions = { ...DEFAULT_WORLDGEN, ...opts };
  const rng = new Rng(o.seed);
  const map = new TileMap(o.width, o.height);
  const base = new ValueNoise2D(rng);
  const detail = new ValueNoise2D(rng);
  const moistNoise = new ValueNoise2D(rng);
  const oreNoise = new ValueNoise2D(rng);

  const W = o.width;
  const H = o.height;
  const invW = 1 / W;
  const invH = 1 / H;
  const reliefScale = 3.2 + o.relief * 7.5;

  // ── 1. Base elevation ───────────────────────────────────────────────────
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = x * invW;
      const ny = y * invH;
      // Gentle bowl so the playable area sits in a valley ringed by highlands.
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const radial = Math.sqrt(dx * dx + dy * dy) * 2;
      const rim = smoothstep(clamp01((radial - 0.72) / 0.35));

      const continental = base.fbm(nx * 3.1, ny * 3.1, 5, 2.05, 0.52);
      const ridges = Math.abs(detail.fbm(nx * 7.5 + 11, ny * 7.5 + 7, 4) - 0.5) * 2;

      let e = (continental - 0.45) * reliefScale;
      e += (1 - ridges) * 1.6 * o.relief;
      e += rim * 9 * (0.4 + o.relief);
      map.elevation[map.idx(x, y)] = e;
    }
  }

  // ── 2. Carve a river from a highland source down to the lowest basin ─────
  const rivers = 1 + Math.round(o.waterAmount * 2);
  for (let r = 0; r < rivers; r++) carveRiver(map, rng, r, o.waterAmount);
  carveLake(map, rng, o.waterAmount);

  // ── 3. Classify terrain & fertility ─────────────────────────────────────
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = map.idx(x, y);
      const e = map.elevation[i];
      const moisture = moistNoise.fbm(x * 0.021 + 3, y * 0.021 + 9, 4);
      const nearWater = distanceToWaterApprox(map, x, y, 4);

      let t = TERRAIN.GRASS;
      if (e <= WATER_LEVEL) {
        t = TERRAIN.WATER;
      } else if (e < WATER_LEVEL + 0.45 || nearWater <= 1) {
        t = TERRAIN.SAND;
      } else if (e > 5.2 + (1 - moisture) * 2.2) {
        t = TERRAIN.ROCK;
      } else if (moisture > 0.62 - o.forestDensity * 0.22 && e < 6.5) {
        t = TERRAIN.FOREST;
      }
      map.terrain[i] = t;

      const wetness = clamp01(1 - nearWater / 26) * 0.55 + moisture * 0.45;
      const slopePenalty = clamp01(1 - localSlope(map, x, y) / 1.6);
      map.fertility[i] =
        t === TERRAIN.WATER || t === TERRAIN.ROCK
          ? 0
          : Math.round(clamp01(wetness * 0.75 + slopePenalty * 0.35) * 255);
    }
  }

  // ── 4. Scatter resources ────────────────────────────────────────────────
  const nodes: ResourceNode[] = [];
  let nextId = 1;
  const add = (kind: NodeKind, x: number, y: number, amount: number, variant: number): void => {
    nodes.push({
      id: nextId++,
      kind,
      x,
      y,
      amount,
      maxAmount: amount,
      variant,
      growth: 1,
      alive: true,
      claimedBy: 0,
    });
  };

  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = map.idx(x, y);
      const t = map.terrain[i];
      const e = map.elevation[i];
      if (t === TERRAIN.WATER) continue;

      // Trees: dense in forest, scattered on grass.
      if (t === TERRAIN.FOREST) {
        if (rng.chance(0.34 * (0.6 + o.forestDensity * 0.7))) {
          add('tree', x, y, 1, rng.int(0, 3));
          map.blocker[i] = nodes[nodes.length - 1].id;
          continue;
        }
      } else if (t === TERRAIN.GRASS && rng.chance(0.022 * o.forestDensity)) {
        add('tree', x, y, 1, rng.int(0, 3));
        map.blocker[i] = nodes[nodes.length - 1].id;
        continue;
      }

      // Berry bushes cluster on forest edges.
      if ((t === TERRAIN.FOREST || t === TERRAIN.GRASS) && rng.chance(0.012)) {
        add('berry_bush', x, y, 40, rng.int(0, 1));
        continue;
      }

      // Stone outcrops.
      if (t === TERRAIN.ROCK && rng.chance(0.10)) {
        add('stone_rock', x, y, rng.int(260, 480), rng.int(0, 2));
        map.blocker[i] = nodes[nodes.length - 1].id;
        continue;
      }
      if (t === TERRAIN.GRASS && rng.chance(0.0025)) {
        add('stone_rock', x, y, rng.int(160, 280), rng.int(0, 2));
        map.blocker[i] = nodes[nodes.length - 1].id;
        continue;
      }

      // Clay near shores.
      if (t === TERRAIN.SAND && rng.chance(0.05)) {
        add('clay_patch', x, y, rng.int(180, 320), 0);
        continue;
      }

      // Ore veins, gated by noise so they come in believable clusters.
      const ore = oreNoise.fbm(x * 0.045 + 17, y * 0.045 + 23, 3);
      if (t === TERRAIN.ROCK || e > 4.4) {
        if (ore > 0.74 && rng.chance(0.09)) {
          add('coal_vein', x, y, rng.int(400, 700), 0);
          continue;
        }
        if (ore > 0.80 && rng.chance(0.055)) {
          add('iron_vein', x, y, rng.int(300, 520), 0);
          continue;
        }
        if (ore > 0.86 && e > 6.2 && rng.chance(0.022)) {
          add('gold_vein', x, y, rng.int(120, 230), 0);
          continue;
        }
      }
    }
  }

  // Fish shoals in open water away from the shore.
  for (let y = 3; y < H - 3; y += 2) {
    for (let x = 3; x < W - 3; x += 2) {
      if (map.terrain[map.idx(x, y)] !== TERRAIN.WATER) continue;
      if (!surroundedByWater(map, x, y, 2)) continue;
      if (rng.chance(0.09)) add('fish_shoal', x, y, 9999, rng.int(0, 1));
    }
  }

  // Roaming wildlife in and around the woods.
  const herdCount = Math.round((W * H) / 2600);
  for (let i = 0; i < herdCount; i++) {
    const hx = rng.int(6, W - 7);
    const hy = rng.int(6, H - 7);
    if (map.terrain[map.idx(hx, hy)] !== TERRAIN.FOREST) continue;
    const size = rng.int(3, 6);
    for (let k = 0; k < size; k++) {
      const ax = clamp(hx + rng.gaussian(0, 2.4), 2, W - 3);
      const ay = clamp(hy + rng.gaussian(0, 2.4), 2, H - 3);
      if (map.isWater(Math.floor(ax), Math.floor(ay))) continue;
      const n: ResourceNode = {
        id: nextId++,
        kind: 'wild_animal',
        x: ax,
        y: ay,
        amount: 1,
        maxAmount: 1,
        variant: rng.int(0, 1),
        growth: 1,
        alive: true,
        claimedBy: 0,
        vx: 0,
        vy: 0,
        wanderTimer: rng.range(0, 6),
      };
      nodes.push(n);
    }
  }

  const start = findStartLocation(map, rng);
  return { map, nodes, startX: start.x, startY: start.y };
}

function localSlope(map: TileMap, x: number, y: number): number {
  const e = map.elevationAt(x, y);
  return Math.max(
    Math.abs(e - map.elevationAt(x + 1, y)),
    Math.abs(e - map.elevationAt(x - 1, y)),
    Math.abs(e - map.elevationAt(x, y + 1)),
    Math.abs(e - map.elevationAt(x, y - 1)),
  );
}

function distanceToWaterApprox(map: TileMap, x: number, y: number, step: number): number {
  for (let r = 1; r <= 30; r += step) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const sx = Math.round(x + Math.cos(ang) * r);
      const sy = Math.round(y + Math.sin(ang) * r);
      if (map.inBounds(sx, sy) && map.elevation[map.idx(sx, sy)] <= WATER_LEVEL) return r;
    }
  }
  return 999;
}

function surroundedByWater(map: TileMap, x: number, y: number, r: number): boolean {
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      if (!map.inBounds(x + i, y + j)) return false;
      if (map.terrain[map.idx(x + i, y + j)] !== TERRAIN.WATER) return false;
    }
  }
  return true;
}

/** Random-walk a river downhill, widening as it goes. */
function carveRiver(map: TileMap, rng: Rng, index: number, waterAmount: number): void {
  const W = map.width;
  const H = map.height;
  // Start on a high rim tile.
  let best = { x: 0, y: 0, e: -Infinity };
  for (let attempt = 0; attempt < 400; attempt++) {
    const edge = (index + attempt) % 4;
    const x = edge === 0 ? rng.int(8, W - 9) : edge === 1 ? W - 9 : edge === 2 ? rng.int(8, W - 9) : 8;
    const y = edge === 0 ? 8 : edge === 1 ? rng.int(8, H - 9) : edge === 2 ? H - 9 : rng.int(8, H - 9);
    const e = map.elevation[map.idx(x, y)];
    if (e > best.e) best = { x, y, e };
  }

  let cx = best.x;
  let cy = best.y;
  let dirX = (W / 2 - cx) / W;
  let dirY = (H / 2 - cy) / H;
  const len = Math.hypot(dirX, dirY) || 1;
  dirX /= len;
  dirY /= len;

  const width = 1.6 + waterAmount * 2.1;
  const depth = 2.4 + waterAmount * 1.4;
  const steps = Math.floor((W + H) * 0.9);

  for (let s = 0; s < steps; s++) {
    // Follow the local downhill gradient, blended with a wander and a pull
    // toward the valley centre so rivers cross the playable area.
    let gx = 0;
    let gy = 0;
    const here = map.elevationAt(Math.round(cx), Math.round(cy));
    for (const [ox, oy] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ] as const) {
      const d = map.elevationAt(Math.round(cx + ox), Math.round(cy + oy)) - here;
      gx -= (d * ox) / 2;
      gy -= (d * oy) / 2;
    }
    const gl = Math.hypot(gx, gy);
    if (gl > 0.0001) {
      gx /= gl;
      gy /= gl;
    }
    const wander = rng.range(-0.55, 0.55);
    const wx = Math.cos(s * 0.07 + index) * 0.5 + wander;
    const wy = Math.sin(s * 0.07 + index) * 0.5 + wander;
    let vx = gx * 0.55 + dirX * 0.3 + wx * 0.35;
    let vy = gy * 0.55 + dirY * 0.3 + wy * 0.35;
    const vl = Math.hypot(vx, vy) || 1;
    vx /= vl;
    vy /= vl;

    cx += vx;
    cy += vy;
    if (cx < 3 || cy < 3 || cx > W - 4 || cy > H - 4) break;

    const w = width + Math.sin(s * 0.05) * 0.6 + (s / steps) * 1.8;
    const r = Math.ceil(w) + 2;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const px = Math.round(cx) + i;
        const py = Math.round(cy) + j;
        if (!map.inBounds(px, py)) continue;
        const d = Math.hypot(i, j);
        const k = map.idx(px, py);
        if (d <= w) {
          map.elevation[k] = Math.min(map.elevation[k], -depth * (1 - d / (w + 1)));
        } else if (d <= w + 2.2) {
          // Carve gentle banks so the shoreline reads well in low poly.
          const t = (d - w) / 2.2;
          map.elevation[k] = Math.min(map.elevation[k], -depth * 0.2 + t * 1.4);
        }
      }
    }
  }
}

/** Flood the lowest basin into a lake, so shore buildings always have a spot. */
function carveLake(map: TileMap, rng: Rng, waterAmount: number): void {
  const W = map.width;
  const H = map.height;
  let lx = 0;
  let ly = 0;
  let lowest = Infinity;
  for (let attempt = 0; attempt < 600; attempt++) {
    const x = rng.int(Math.floor(W * 0.25), Math.floor(W * 0.75));
    const y = rng.int(Math.floor(H * 0.25), Math.floor(H * 0.75));
    const e = map.elevation[map.idx(x, y)];
    if (e < lowest) {
      lowest = e;
      lx = x;
      ly = y;
    }
  }
  const radius = 9 + waterAmount * 12;
  for (let j = -Math.ceil(radius) - 3; j <= Math.ceil(radius) + 3; j++) {
    for (let i = -Math.ceil(radius) - 3; i <= Math.ceil(radius) + 3; i++) {
      const x = lx + i;
      const y = ly + j;
      if (!map.inBounds(x, y)) continue;
      const d = Math.hypot(i, j) / radius;
      if (d > 1.25) continue;
      const k = map.idx(x, y);
      const target = d < 1 ? -3.2 * (1 - d * 0.7) : (d - 1) * 3;
      map.elevation[k] = Math.min(map.elevation[k], target);
    }
  }
}

/** Pick a flat, fertile spot with water and woods nearby. */
function findStartLocation(map: TileMap, rng: Rng): { x: number; y: number } {
  const W = map.width;
  const H = map.height;
  let best = { x: Math.floor(W / 2), y: Math.floor(H / 2), score: -Infinity };
  for (let attempt = 0; attempt < 3000; attempt++) {
    const x = rng.int(Math.floor(W * 0.2), Math.floor(W * 0.8));
    const y = rng.int(Math.floor(H * 0.2), Math.floor(H * 0.8));
    if (!map.canPlace(x, y, 8, 8, 0.9)) continue;

    let trees = 0;
    let water = 0;
    let flat = 0;
    for (let j = -14; j <= 14; j += 2) {
      for (let i = -14; i <= 14; i += 2) {
        const px = x + i;
        const py = y + j;
        if (!map.inBounds(px, py)) continue;
        const t = map.terrain[map.idx(px, py)];
        if (t === TERRAIN.FOREST) trees++;
        if (t === TERRAIN.WATER) water++;
        if (t === TERRAIN.GRASS) flat++;
      }
    }
    const score = flat * 1.0 + trees * 1.4 + Math.min(water, 25) * 1.6 - Math.abs(water - 18) * 0.3;
    if (score > best.score) best = { x, y, score };
  }
  return { x: best.x, y: best.y };
}
