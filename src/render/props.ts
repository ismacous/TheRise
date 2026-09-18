import { BufferGeometry, Color, Group, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import type { TileMap } from '../sim/tilemap';
import type { ResourceNode } from '../sim/types';
import type { World } from '../sim/world';
import { CHUNK, HEIGHT_SCALE } from './constants';
import { MeshBuilder } from './meshBuilder';
import type { SeasonPalette } from './palette';

const ROCK_COLORS = [new Color('#8e9198'), new Color('#7b7e85')].map((c) => c.convertSRGBToLinear());
const COAL = new Color('#2f3237').convertSRGBToLinear();
const IRON = new Color('#9a6b4a').convertSRGBToLinear();
const GOLD = new Color('#e0b43a').convertSRGBToLinear();
const CLAY = new Color('#b0713f').convertSRGBToLinear();
const BERRY = new Color('#8c3d6e').convertSRGBToLinear();
const SNOW = new Color('#eef3f7').convertSRGBToLinear();

/**
 * Trees, rocks, bushes and ore veins, merged into one geometry per terrain
 * chunk. Merging keeps draw calls low while chunking keeps frustum culling
 * effective on a 200x200 map holding 20 000+ props.
 */
export class PropRenderer {
  readonly group = new Group();
  private map: TileMap;
  private world: World;
  private chunksX: number;
  private chunksY: number;
  private meshes: (Mesh | null)[] = [];
  private dirty = new Set<number>();
  private palette: SeasonPalette;
  private material: MeshLambertMaterial;
  private builder = new MeshBuilder();
  private matrix = new Matrix4();

  constructor(world: World, palette: SeasonPalette) {
    this.world = world;
    this.map = world.map;
    this.palette = palette;
    this.chunksX = Math.ceil(this.map.width / CHUNK);
    this.chunksY = Math.ceil(this.map.height / CHUNK);
    this.meshes = new Array(this.chunksX * this.chunksY).fill(null);
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.group.name = 'props';
    for (let i = 0; i < this.meshes.length; i++) this.dirty.add(i);
  }

  setPalette(p: SeasonPalette): void {
    this.palette = p;
    for (let i = 0; i < this.meshes.length; i++) this.dirty.add(i);
  }

  markDirtyAt(x: number, y: number): void {
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    if (cx < 0 || cy < 0 || cx >= this.chunksX || cy >= this.chunksY) return;
    this.dirty.add(cy * this.chunksX + cx);
  }

  /** Rebuilds at most `budget` chunks, oldest first. */
  flush(budget = 2): void {
    if (this.dirty.size === 0) return;
    let done = 0;
    for (const idx of this.dirty) {
      this.rebuildChunk(idx);
      this.dirty.delete(idx);
      if (++done >= budget) break;
    }
  }

  private rebuildChunk(idx: number): void {
    const cx = idx % this.chunksX;
    const cy = Math.floor(idx / this.chunksX);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const x1 = Math.min(this.map.width, x0 + CHUNK);
    const y1 = Math.min(this.map.height, y0 + CHUNK);

    const b = this.builder.clear();
    let any = false;
    // The node grid is indexed by position, so query the chunk's bounding circle.
    const ccx = (x0 + x1) / 2;
    const ccy = (y0 + y1) / 2;
    const radius = Math.hypot(x1 - x0, y1 - y0) / 2 + 2;
    this.world.nodeGrid.query(ccx, ccy, radius, (n) => {
      if (!n.alive) return;
      if (n.x < x0 || n.x >= x1 || n.y < y0 || n.y >= y1) return;
      if (n.kind === 'fish_shoal' || n.kind === 'wild_animal') return;
      this.addNode(b, n);
      any = true;
    });

    const existing = this.meshes[idx];
    if (!any) {
      if (existing) {
        this.group.remove(existing);
        existing.geometry.dispose();
        this.meshes[idx] = null;
      }
      return;
    }
    const geo: BufferGeometry = b.build();
    if (existing) {
      existing.geometry.dispose();
      existing.geometry = geo;
    } else {
      const mesh = new Mesh(geo, this.material);
      mesh.name = `props-${cx}-${cy}`;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.meshes[idx] = mesh;
      this.group.add(mesh);
    }
  }

  private addNode(b: MeshBuilder, n: ResourceNode): void {
    const x = n.x + 0.5;
    const z = n.y + 0.5;
    const y = this.map.sampleElevation(n.x + 0.5, n.y + 0.5) * HEIGHT_SCALE;
    const p = this.palette;
    // A stable per-node hash keeps each prop looking the same between rebuilds.
    const h = (n.id * 2654435761) >>> 0;
    const r1 = ((h & 255) / 255) * 2 - 1;
    const r2 = (((h >> 8) & 255) / 255) * 2 - 1;
    const rot = ((h >> 16) & 255) / 255 * Math.PI * 2;

    switch (n.kind) {
      case 'tree':
        this.addTree(b, x, y, z, n, r1, r2, rot);
        break;
      case 'berry_bush': {
        const s = 0.5 + (n.amount / Math.max(1, n.maxAmount)) * 0.35;
        b.blob(x, y + 0.22 * s, z, 0.34 * s, 0.24 * s, 0.34 * s, p.foliage[1]);
        b.blob(x + 0.2, y + 0.16 * s, z - 0.15, 0.22 * s, 0.17 * s, 0.22 * s, p.foliage[3]);
        if (n.amount > n.maxAmount * 0.4) {
          for (let i = 0; i < 4; i++) {
            const a = rot + i * 1.6;
            b.box(x + Math.cos(a) * 0.26, y + 0.3, z + Math.sin(a) * 0.26, 0.07, 0.07, 0.07, BERRY);
          }
        }
        break;
      }
      case 'stone_rock': {
        const col = ROCK_COLORS[(h >> 3) & 1];
        const s = 0.55 + (n.amount / Math.max(1, n.maxAmount)) * 0.45;
        b.blob(x, y + 0.2 * s, z, 0.42 * s, 0.3 * s, 0.38 * s, col);
        b.blob(x + r1 * 0.3, y + 0.12 * s, z + r2 * 0.3, 0.26 * s, 0.2 * s, 0.24 * s, col);
        if (p.snow > 0.5) b.blob(x, y + 0.38 * s, z, 0.3 * s, 0.08, 0.28 * s, SNOW);
        break;
      }
      case 'clay_patch':
        b.blob(x, y + 0.06, z, 0.5, 0.1, 0.45, CLAY);
        b.blob(x + r1 * 0.3, y + 0.05, z + r2 * 0.3, 0.3, 0.08, 0.3, CLAY);
        break;
      case 'coal_vein':
      case 'iron_vein':
      case 'gold_vein': {
        const ore = n.kind === 'coal_vein' ? COAL : n.kind === 'iron_vein' ? IRON : GOLD;
        const rock = ROCK_COLORS[0];
        b.blob(x, y + 0.22, z, 0.44, 0.32, 0.42, rock);
        for (let i = 0; i < 3; i++) {
          const a = rot + (i * Math.PI * 2) / 3;
          b.blob(
            x + Math.cos(a) * 0.22,
            y + 0.34 + i * 0.05,
            z + Math.sin(a) * 0.22,
            0.14,
            0.16,
            0.14,
            ore,
          );
        }
        break;
      }
      default:
        break;
    }
  }

  private addTree(
    b: MeshBuilder,
    x: number,
    y: number,
    z: number,
    n: ResourceNode,
    r1: number,
    r2: number,
    rot: number,
  ): void {
    const p = this.palette;
    const g = Math.max(0.12, n.growth);
    const scale = (0.85 + r1 * 0.18) * g;
    const leaf = p.foliage[n.variant % p.foliage.length];
    const trunk = p.trunk;
    const lean = r2 * 0.05;

    switch (n.variant % 4) {
      case 0: {
        // Conifer: a stack of narrowing cones.
        const th = 0.85 * scale;
        b.cylinder(x, y, z, 0.075 * scale, th, 4, trunk, 0.8, rot);
        b.cone(x, y + th * 0.55, z, 0.52 * scale, 0.95 * scale, 5, leaf, rot);
        b.cone(x, y + th * 1.15, z, 0.4 * scale, 0.8 * scale, 5, leaf, rot + 0.5);
        b.cone(x, y + th * 1.8, z, 0.26 * scale, 0.62 * scale, 5, leaf, rot + 1.0);
        if (p.snow > 0.4) b.cone(x, y + th * 2.05, z, 0.17 * scale, 0.28 * scale, 5, SNOW, rot);
        break;
      }
      case 1: {
        // Broadleaf: a chunky crown on a short trunk.
        const th = 1.0 * scale;
        b.cylinder(x, y, z, 0.1 * scale, th, 5, trunk, 0.85, rot);
        b.blob(x + lean, y + th + 0.42 * scale, z, 0.66 * scale, 0.56 * scale, 0.62 * scale, leaf);
        b.blob(
          x + lean - 0.3 * scale,
          y + th + 0.2 * scale,
          z + 0.24 * scale,
          0.38 * scale,
          0.32 * scale,
          0.36 * scale,
          leaf,
        );
        break;
      }
      case 2: {
        // Low bushy tree.
        const th = 0.6 * scale;
        b.cylinder(x, y, z, 0.09 * scale, th, 4, trunk, 0.9, rot);
        b.blob(x, y + th + 0.3 * scale, z, 0.54 * scale, 0.42 * scale, 0.52 * scale, leaf);
        b.blob(x + 0.28 * scale, y + th + 0.14 * scale, z - 0.2 * scale, 0.32 * scale, 0.26 * scale, 0.3 * scale, leaf);
        break;
      }
      default: {
        // Tall slender tree.
        const th = 1.5 * scale;
        b.cylinder(x, y, z, 0.07 * scale, th, 4, trunk, 0.7, rot);
        b.cone(x + lean, y + th * 0.72, z, 0.42 * scale, 1.0 * scale, 6, leaf, rot);
        break;
      }
    }
  }

  dispose(): void {
    for (const m of this.meshes) {
      if (m) m.geometry.dispose();
    }
    this.material.dispose();
    this.matrix.identity();
  }
}
