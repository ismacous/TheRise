import { TERRAIN, type RoadLevel, type TerrainType } from './types';

/**
 * Flat typed-array tile grid. Everything the simulation needs to answer
 * "can I stand here / build here / how fast do I move here" lives in here.
 */
export class TileMap {
  readonly width: number;
  readonly height: number;
  readonly elevation: Float32Array;
  readonly terrain: Uint8Array;
  /** Building id occupying the tile, or -1. */
  readonly occupancy: Int32Array;
  /** Resource node id blocking the tile, or -1. */
  readonly blocker: Int32Array;
  readonly road: Uint8Array;
  /** 0..255 farming suitability. */
  readonly fertility: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const n = width * height;
    this.elevation = new Float32Array(n);
    this.terrain = new Uint8Array(n);
    this.occupancy = new Int32Array(n).fill(-1);
    this.blocker = new Int32Array(n).fill(-1);
    this.road = new Uint8Array(n);
    this.fertility = new Uint8Array(n);
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  terrainAt(x: number, y: number): TerrainType {
    if (!this.inBounds(x, y)) return TERRAIN.WATER;
    return this.terrain[this.idx(x, y)] as TerrainType;
  }

  elevationAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.elevation[this.idx(x, y)];
  }

  /** Bilinear elevation sample, for placing meshes at float positions. */
  sampleElevation(fx: number, fy: number): number {
    const x = Math.min(this.width - 2, Math.max(0, Math.floor(fx)));
    const y = Math.min(this.height - 2, Math.max(0, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - x));
    const ty = Math.min(1, Math.max(0, fy - y));
    const e = this.elevation;
    const w = this.width;
    const a = e[y * w + x];
    const b = e[y * w + x + 1];
    const c = e[(y + 1) * w + x];
    const d = e[(y + 1) * w + x + 1];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  isWater(x: number, y: number): boolean {
    return this.terrainAt(x, y) === TERRAIN.WATER;
  }

  /** Can a villager stand on this tile? */
  walkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    if (this.terrain[i] === TERRAIN.WATER) return false;
    if (this.blocker[i] !== -1) return false;
    return true;
  }

  /** Movement cost multiplier: roads are cheap, rough ground is not. */
  moveCost(x: number, y: number): number {
    const i = this.idx(x, y);
    const r = this.road[i] as RoadLevel;
    if (r === 2) return 0.55;
    if (r === 1) return 0.74;
    const t = this.terrain[i];
    if (t === TERRAIN.ROCK) return 1.25;
    if (t === TERRAIN.SAND) return 1.15;
    if (t === TERRAIN.FOREST) return 1.1;
    return 1;
  }

  /** Speed multiplier applied to villagers standing on the tile. */
  speedAt(fx: number, fy: number): number {
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    if (!this.inBounds(x, y)) return 1;
    return 1 / this.moveCost(x, y);
  }

  /** True when the whole footprint is free, flat enough and on land. */
  canPlace(x: number, y: number, w: number, h: number, maxSlope = 1.15): boolean {
    if (x < 1 || y < 1 || x + w > this.width - 1 || y + h > this.height - 1) return false;
    let min = Infinity;
    let max = -Infinity;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const k = this.idx(i, j);
        if (this.terrain[k] === TERRAIN.WATER) return false;
        if (this.occupancy[k] !== -1) return false;
        const e = this.elevation[k];
        if (e < min) min = e;
        if (e > max) max = e;
      }
    }
    return max - min <= maxSlope;
  }

  /** True when the footprint touches at least one water tile (for piers). */
  touchesWater(x: number, y: number, w: number, h: number): boolean {
    for (let j = y - 1; j <= y + h; j++) {
      for (let i = x - 1; i <= x + w; i++) {
        if (!this.inBounds(i, j)) continue;
        if (i >= x && i < x + w && j >= y && j < y + h) continue;
        if (this.terrain[this.idx(i, j)] === TERRAIN.WATER) return true;
      }
    }
    return false;
  }

  /** Average elevation across a footprint, used to seat building meshes. */
  footprintElevation(x: number, y: number, w: number, h: number): number {
    let sum = 0;
    let count = 0;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (!this.inBounds(i, j)) continue;
        sum += this.elevation[this.idx(i, j)];
        count++;
      }
    }
    return count === 0 ? 0 : sum / count;
  }

  setOccupancy(x: number, y: number, w: number, h: number, id: number): void {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (this.inBounds(i, j)) this.occupancy[this.idx(i, j)] = id;
      }
    }
  }

  /** Flatten a footprint so buildings never float or sink into a slope. */
  flatten(x: number, y: number, w: number, h: number): number {
    const target = this.footprintElevation(x, y, w, h);
    const pad = 1;
    for (let j = y - pad; j < y + h + pad; j++) {
      for (let i = x - pad; i < x + w + pad; i++) {
        if (!this.inBounds(i, j)) continue;
        const k = this.idx(i, j);
        if (this.terrain[k] === TERRAIN.WATER) continue;
        const inside = i >= x && i < x + w && j >= y && j < y + h;
        this.elevation[k] = inside ? target : (this.elevation[k] + target) * 0.5;
      }
    }
    return target;
  }
}
