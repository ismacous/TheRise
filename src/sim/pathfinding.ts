import type { TileMap } from './tilemap';

/** Binary min-heap keyed by f-score, storing tile indices. */
class MinHeap {
  private items: number[] = [];
  private keys: Float64Array;

  constructor(capacity: number) {
    this.keys = new Float64Array(capacity);
  }

  clear(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }

  push(node: number, key: number): void {
    this.keys[node] = key;
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[this.items[p]] <= this.keys[this.items[i]]) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }

  pop(): number {
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      const n = this.items.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this.keys[this.items[l]] < this.keys[this.items[m]]) m = l;
        if (r < n && this.keys[this.items[r]] < this.keys[this.items[m]]) m = r;
        if (m === i) break;
        [this.items[m], this.items[i]] = [this.items[i], this.items[m]];
        i = m;
      }
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;

/**
 * Grid A* with road-aware costs. Buffers are allocated once and reused, so a
 * search costs no garbage even with hundreds of villagers.
 */
export class PathFinder {
  private map: TileMap;
  private gScore: Float32Array;
  private cameFrom: Int32Array;
  private stamp: Int32Array;
  private closed: Uint8Array;
  private open: MinHeap;
  private run = 0;
  /** Soft cap on expanded nodes so one bad request cannot stall a frame. */
  maxNodes = 9000;

  /** Diagnostics for the perf overlay. */
  lastExpanded = 0;
  searches = 0;
  /**
   * Searches allowed in the current tick. A village of four hundred people
   * asks for hundreds of paths a second; spreading them over a few ticks is
   * invisible in play (villagers keep walking straight meanwhile) and keeps
   * the frame budget predictable.
   */
  budget = 0;
  budgetPerTick = 14;
  /** Requests refused this tick, for diagnostics. */
  deferred = 0;

  constructor(map: TileMap) {
    this.map = map;
    const n = map.width * map.height;
    this.gScore = new Float32Array(n);
    this.cameFrom = new Int32Array(n);
    this.stamp = new Int32Array(n).fill(-1);
    this.closed = new Uint8Array(n);
    this.open = new MinHeap(n);
  }

  private heuristic(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    // Octile distance, slightly weighted to bias toward straight-ish routes.
    return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
  }

  /**
   * Returns a compact array of tile indices from start to goal (inclusive of
   * goal, exclusive of start), or null when unreachable.
   *
   * `goalRadius` lets a caller path "next to" a blocked tile such as a tree.
   */
  /** Called once per simulation tick to replenish the search allowance. */
  beginTick(): void {
    this.budget = this.budgetPerTick;
  }

  find(sx: number, sy: number, gx: number, gy: number, goalRadius = 0): Int32Array | null {
    if (this.budget <= 0) {
      this.deferred++;
      return null;
    }
    this.budget--;
    const map = this.map;
    sx = Math.floor(sx);
    sy = Math.floor(sy);
    gx = Math.floor(gx);
    gy = Math.floor(gy);
    if (!map.inBounds(sx, sy) || !map.inBounds(gx, gy)) return null;

    const start = map.idx(sx, sy);
    const goal = map.idx(gx, gy);
    if (start === goal) return new Int32Array(0);

    this.run++;
    this.searches++;
    const run = this.run;
    const { gScore, cameFrom, stamp, closed, open } = this;
    open.clear();

    stamp[start] = run;
    gScore[start] = 0;
    cameFrom[start] = -1;
    closed[start] = 0;
    open.push(start, this.heuristic(sx, sy, gx, gy));

    const W = map.width;
    let expanded = 0;
    let bestNode = -1;
    let bestH = Infinity;

    while (open.size > 0) {
      const current = open.pop();
      if (closed[current] === 1 && stamp[current] === run) continue;
      closed[current] = 1;
      stamp[current] = run;
      expanded++;

      const cx = current % W;
      const cy = (current / W) | 0;
      const h = this.heuristic(cx, cy, gx, gy);
      if (h < bestH) {
        bestH = h;
        bestNode = current;
      }

      if (current === goal || (goalRadius > 0 && h <= goalRadius)) {
        this.lastExpanded = expanded;
        return this.reconstruct(current, start);
      }
      if (expanded > this.maxNodes) break;

      for (let d = 0; d < 8; d++) {
        const ox = d < 4 ? [1, -1, 0, 0][d] : [1, 1, -1, -1][d - 4];
        const oy = d < 4 ? [0, 0, 1, -1][d] : [1, -1, 1, -1][d - 4];
        const nx = cx + ox;
        const ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
        if (!map.walkable(nx, ny)) continue;
        // Forbid cutting corners diagonally between two blocked tiles.
        if (d >= 4 && (!map.walkable(cx + ox, cy) || !map.walkable(cx, cy + oy))) continue;

        const n = ny * W + nx;
        if (stamp[n] === run && closed[n] === 1) continue;
        const step = (d < 4 ? 1 : SQRT2) * map.moveCost(nx, ny);
        const tentative = gScore[current] + step;
        if (stamp[n] === run && tentative >= gScore[n]) continue;

        stamp[n] = run;
        closed[n] = 0;
        gScore[n] = tentative;
        cameFrom[n] = current;
        open.push(n, tentative + this.heuristic(nx, ny, gx, gy) * 1.02);
      }
    }

    this.lastExpanded = expanded;
    // Partial path: walking most of the way beats standing still.
    if (bestNode !== -1 && bestNode !== start && bestH < 1e9) {
      return this.reconstruct(bestNode, start);
    }
    return null;
  }

  private reconstruct(goal: number, start: number): Int32Array {
    const out: number[] = [];
    let cur = goal;
    let guard = 0;
    while (cur !== start && cur !== -1 && guard++ < 100000) {
      out.push(cur);
      cur = this.cameFrom[cur];
    }
    out.reverse();
    return Int32Array.from(out);
  }

  /** Cheap line-of-walk test used to skip A* for short, clear hops. */
  straightWalkable(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 1.4);
    if (steps === 0) return true;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(ax + dx * t);
      const y = Math.floor(ay + dy * t);
      if (!this.map.walkable(x, y)) return false;
    }
    return true;
  }
}
