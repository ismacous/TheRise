import type { Villager } from './types';
import type { World } from './world';

/**
 * Desire paths.
 *
 * Nobody draws the track between the woodcutters' camp and the storehouse —
 * it appears because two hundred trips a day wear the grass away. Every
 * villager leaves a little wear on the tile they are standing on; once a tile
 * has taken enough traffic it turns into a trail, and once the traffic stops
 * the grass takes it back.
 *
 * The whole thing is one number per *walked* tile, not per map tile: a village
 * only ever wears a few hundred of the forty thousand tiles on the map.
 */

/**
 * Wear a single villager lays down per second of walking. A villager crosses a
 * tile in about four tenths of a second, so one crossing is worth ~0.16.
 *
 * This is deliberately generous. Villagers do not walk in single file: each
 * takes a slightly different line, so the traffic between two buildings is
 * spread over a corridor several tiles wide rather than concentrated on one.
 * At a stricter rate a quarter of an hour of a working village produced ten
 * worn tiles in total — technically a desire path, visually nothing.
 */
const WEAR_PER_SECOND = 0.4;
/**
 * Wear lost per second. It has to stay well under what one crossing brings in,
 * or a tile can only hold a trail while somebody is permanently standing on
 * it. At this rate a tile keeps its trail while it sees traffic every half
 * minute, and a route abandoned for a couple of minutes grasses over.
 */
const WEAR_DECAY = 0.005;
/** Wear at which bare ground becomes a trail: roughly five crossings. */
const PROMOTE_AT = 0.7;
/** Wear below which a trail grasses over again. */
const DEMOTE_AT = 0.3;
/** Wear is capped so a high street does not take ten minutes to disappear. */
const WEAR_CAP = 2.5;
/** Seconds between decay sweeps. */
const SWEEP_INTERVAL = 4;

/** Wear handed to each neighbour when a tile becomes a trail. */
const SPREAD = 0.22;

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Road level used for a trail worn by feet rather than laid by hand. */
export const WORN_TRAIL = 3;

export class DesirePaths {
  /** Tile index → accumulated wear. Only tiles somebody has walked on. */
  private wear = new Map<number, number>();
  private sweepTimer = SWEEP_INTERVAL;

  /** Records one villager's footfall. Called once per villager per tick. */
  record(world: World, v: Villager, dt: number): void {
    // Standing still does not wear a path, and neither does walking on one
    // that is already paved. `hauling` is included because a carrier on the
    // last leg of a delivery is still very much walking.
    if (v.state !== 'walking' && v.state !== 'hauling') return;
    const x = Math.floor(v.x);
    const y = Math.floor(v.y);
    if (!world.map.inBounds(x, y)) return;
    const i = world.map.idx(x, y);
    const road = world.map.road[i];
    if (road === 1 || road === 2) return;
    if (world.map.occupancy[i] !== -1) return;
    const next = Math.min(WEAR_CAP, (this.wear.get(i) ?? 0) + WEAR_PER_SECOND * dt);
    this.wear.set(i, next);
    if (next >= PROMOTE_AT && road === 0) this.promote(world, i, x, y);
  }

  update(world: World, dt: number): void {
    this.sweepTimer -= dt;
    if (this.sweepTimer > 0) return;
    const elapsed = SWEEP_INTERVAL - this.sweepTimer;
    this.sweepTimer = SWEEP_INTERVAL;
    const loss = WEAR_DECAY * elapsed;
    for (const [i, value] of this.wear) {
      const next = value - loss;
      if (next <= 0.01) {
        this.wear.delete(i);
        if (world.map.road[i] === WORN_TRAIL) this.demote(world, i);
        continue;
      }
      this.wear.set(i, next);
      if (next < DEMOTE_AT && world.map.road[i] === WORN_TRAIL) this.demote(world, i);
    }
  }

  private promote(world: World, i: number, x: number, y: number): void {
    if (!world.map.walkable(x, y)) return;
    world.map.road[i] = WORN_TRAIL;
    world.terrainChanges.push({ x, y, w: 1, h: 1 });
    // Feet spread out either side of a track. Seeding a little wear into the
    // neighbours lets a path thicken to two or three tiles where it is busy,
    // instead of staying a one-tile line nobody can see from play distance.
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!world.map.inBounds(nx, ny) || !world.map.walkable(nx, ny)) continue;
      const ni = world.map.idx(nx, ny);
      if (world.map.road[ni] !== 0 || world.map.occupancy[ni] !== -1) continue;
      const seeded = (this.wear.get(ni) ?? 0) + SPREAD;
      this.wear.set(ni, Math.min(WEAR_CAP, seeded));
    }
  }

  private demote(world: World, i: number): void {
    world.map.road[i] = 0;
    const x = i % world.map.width;
    const y = Math.floor(i / world.map.width);
    world.terrainChanges.push({ x, y, w: 1, h: 1 });
  }

  /** How worn a tile is, 0..1 past the promotion point. For the renderer. */
  wearAt(i: number): number {
    return this.wear.get(i) ?? 0;
  }

  toJSON(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const [i, value] of this.wear) out.push([i, Math.round(value * 100) / 100]);
    return out;
  }

  static fromJSON(data: Array<[number, number]> | undefined): DesirePaths {
    const p = new DesirePaths();
    for (const [i, value] of data ?? []) p.wear.set(i, value);
    return p;
  }
}
