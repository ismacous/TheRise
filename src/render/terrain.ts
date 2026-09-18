import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  Vector3,
} from 'three';
import { Rng, ValueNoise2D } from '../core/rng';
import type { TileMap } from '../sim/tilemap';
import { TERRAIN } from '../sim/types';
import { CHUNK, HEIGHT_SCALE } from './constants';
import type { SeasonPalette } from './palette';

/**
 * Chunked low-poly terrain. Each tile is two flat-shaded triangles carrying a
 * per-tile colour, which is exactly the faceted look we want and lets us
 * rebuild only the chunks a player actually changed.
 */
export class TerrainRenderer {
  readonly group = new Group();
  private map: TileMap;
  private chunksX: number;
  private chunksY: number;
  private meshes: Mesh[] = [];
  private dirty = new Set<number>();
  private palette: SeasonPalette;
  private material: MeshLambertMaterial;
  /** Corner heights, (w+1) x (h+1), averaged from tile elevations. */
  private corners: Float32Array;
  /** Low-frequency tint noise so meadows never look like graph paper. */
  private tint: ValueNoise2D;

  constructor(map: TileMap, palette: SeasonPalette) {
    this.map = map;
    this.palette = palette;
    this.chunksX = Math.ceil(map.width / CHUNK);
    this.chunksY = Math.ceil(map.height / CHUNK);
    this.corners = new Float32Array((map.width + 1) * (map.height + 1));
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.tint = new ValueNoise2D(new Rng('terrain-tint'));
    this.group.name = 'terrain';
    this.recomputeCorners();
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const mesh = new Mesh(this.buildChunk(cx, cy), this.material);
        mesh.name = `terrain-chunk-${cx}-${cy}`;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.meshes.push(mesh);
        this.group.add(mesh);
      }
    }
  }

  private cornerIdx(x: number, y: number): number {
    return y * (this.map.width + 1) + x;
  }

  /** Corner height = average of the up-to-four tiles touching it. */
  private recomputeCorners(minX = 0, minY = 0, maxX = this.map.width, maxY = this.map.height): void {
    const m = this.map;
    for (let y = Math.max(0, minY); y <= Math.min(m.height, maxY); y++) {
      for (let x = Math.max(0, minX); x <= Math.min(m.width, maxX); x++) {
        let sum = 0;
        let n = 0;
        for (const [ox, oy] of [
          [-1, -1],
          [0, -1],
          [-1, 0],
          [0, 0],
        ] as const) {
          const tx = x + ox;
          const ty = y + oy;
          if (tx < 0 || ty < 0 || tx >= m.width || ty >= m.height) continue;
          sum += m.elevation[m.idx(tx, ty)];
          n++;
        }
        this.corners[this.cornerIdx(x, y)] = n === 0 ? 0 : sum / n;
      }
    }
  }

  private tileColor(x: number, y: number, out: Vector3): void {
    const m = this.map;
    const i = m.idx(x, y);
    const p = this.palette;
    const t = m.terrain[i];
    const road = m.road[i];

    // Two octaves of smooth noise: broad patches of colour plus a gentle
    // per-tile break-up. Both are subtle on purpose — a strong per-tile tint
    // turns the meadow into a chessboard at this camera angle.
    const broad = this.tint.sample(x * 0.055, y * 0.055);
    const fine = this.tint.sample(x * 0.34 + 31, y * 0.34 + 17);
    const mix = broad * 0.7 + fine * 0.3;

    let col;
    if (road === 2) col = p.rock;
    else if (road === 1) col = p.dirt;
    else if (t === TERRAIN.WATER) col = p.waterDeep;
    else if (t === TERRAIN.SAND) col = p.sand;
    else if (t === TERRAIN.ROCK) col = mix > 0.55 ? p.rockAlt : p.rock;
    else if (t === TERRAIN.FOREST) col = p.forestFloor;
    else if (t === TERRAIN.DIRT) col = p.dirt;
    else col = p.grass;

    let r = col.r;
    let g = col.g;
    let b = col.b;

    // Blend meadow tones instead of switching between them.
    if (t === TERRAIN.GRASS && road === 0) {
      const k = mix * 0.85;
      r += (p.grassAlt.r - r) * k;
      g += (p.grassAlt.g - g) * k;
      b += (p.grassAlt.b - b) * k;
    }

    // Slopes catch less light in reality; darkening them adds relief that
    // flat shading alone cannot convey on gentle hills.
    const slope = Math.min(
      1,
      Math.max(
        Math.abs(m.elevation[i] - m.elevationAt(x + 1, y)),
        Math.abs(m.elevation[i] - m.elevationAt(x, y + 1)),
      ) * 0.55,
    );
    const shade = (0.965 + mix * 0.07) * (1 - slope * 0.18);
    out.set(r * shade, g * shade, b * shade);
  }

  private buildChunk(cx: number, cy: number, existing?: BufferGeometry): BufferGeometry {
    const m = this.map;
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const x1 = Math.min(m.width, x0 + CHUNK);
    const y1 = Math.min(m.height, y0 + CHUNK);
    const tiles = (x1 - x0) * (y1 - y0);
    const verts = tiles * 6;

    const positions = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const tmp = new Vector3();
    let vi = 0;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const h00 = this.corners[this.cornerIdx(x, y)] * HEIGHT_SCALE;
        const h10 = this.corners[this.cornerIdx(x + 1, y)] * HEIGHT_SCALE;
        const h01 = this.corners[this.cornerIdx(x, y + 1)] * HEIGHT_SCALE;
        const h11 = this.corners[this.cornerIdx(x + 1, y + 1)] * HEIGHT_SCALE;
        this.tileColor(x, y, tmp);

        // Two triangles, wound so the shorter diagonal is used. This keeps
        // ridges crisp instead of smearing them across a long diagonal.
        const flip = Math.abs(h00 - h11) > Math.abs(h10 - h01);
        const quad: Array<[number, number, number]> = flip
          ? [
              [x, h00, y],
              [x, h01, y + 1],
              [x + 1, h10, y],
              [x + 1, h10, y],
              [x, h01, y + 1],
              [x + 1, h11, y + 1],
            ]
          : [
              [x, h00, y],
              [x, h01, y + 1],
              [x + 1, h11, y + 1],
              [x, h00, y],
              [x + 1, h11, y + 1],
              [x + 1, h10, y],
            ];
        for (const [px, py, pz] of quad) {
          positions[vi * 3] = px;
          positions[vi * 3 + 1] = py;
          positions[vi * 3 + 2] = pz;
          colors[vi * 3] = tmp.x;
          colors[vi * 3 + 1] = tmp.y;
          colors[vi * 3 + 2] = tmp.z;
          vi++;
        }
      }
    }

    const geo = existing ?? new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /** Marks the chunks covering a tile rectangle for rebuild on the next frame. */
  markDirty(x: number, y: number, w = 1, h = 1): void {
    this.recomputeCorners(x - 2, y - 2, x + w + 2, y + h + 2);
    const cx0 = Math.max(0, Math.floor((x - 1) / CHUNK));
    const cy0 = Math.max(0, Math.floor((y - 1) / CHUNK));
    const cx1 = Math.min(this.chunksX - 1, Math.floor((x + w) / CHUNK));
    const cy1 = Math.min(this.chunksY - 1, Math.floor((y + h) / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) this.dirty.add(cy * this.chunksX + cx);
    }
  }

  markAllDirty(): void {
    for (let i = 0; i < this.meshes.length; i++) this.dirty.add(i);
  }

  setPalette(p: SeasonPalette): void {
    this.palette = p;
    this.markAllDirty();
  }

  /** Rebuilds a bounded number of chunks so a big change never stalls a frame. */
  flush(budget = 3): void {
    if (this.dirty.size === 0) return;
    let done = 0;
    for (const idx of this.dirty) {
      const cx = idx % this.chunksX;
      const cy = Math.floor(idx / this.chunksX);
      this.buildChunk(cx, cy, this.meshes[idx].geometry as BufferGeometry);
      this.dirty.delete(idx);
      if (++done >= budget) break;
    }
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
  }
}
