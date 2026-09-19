import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import { GOODS } from '../data/goods';
import { HAIR_COLORS, SKIN_TONES } from '../data/names';
import { PROFESSIONS } from '../data/professions';
import type { Villager } from '../sim/types';
import type { World } from '../sim/world';
import { HEIGHT_SCALE } from './constants';
import { MeshBuilder } from './meshBuilder';

const WHITE = new Color(1, 1, 1);
const MAX_VILLAGERS = 900;

/**
 * Villagers are drawn as five instanced meshes — clothes, skin, hair/hat, the
 * carried load and the depot porters' handcart — so the whole population costs
 * five draw calls no matter how large the village grows. Per-instance colour
 * gives every villager their own skin tone, hair and profession outfit.
 */
export class VillagerRenderer {
  readonly group = new Group();
  private tunic: InstancedMesh;
  private skin: InstancedMesh;
  private hair: InstancedMesh;
  private load: InstancedMesh;
  private cart: InstancedMesh;
  private dummy = new Object3D();
  private matrix = new Matrix4();
  private color = new Color();
  private material: MeshLambertMaterial;

  constructor() {
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.tunic = this.makeInstanced(buildTunicGeometry(), 'villager-tunic');
    this.skin = this.makeInstanced(buildSkinGeometry(), 'villager-skin');
    this.hair = this.makeInstanced(buildHairGeometry(), 'villager-hair');
    this.load = this.makeInstanced(buildLoadGeometry(), 'villager-load');
    this.cart = this.makeInstanced(buildCartGeometry(), 'villager-cart');
    this.group.name = 'villagers';
    this.group.add(this.tunic, this.skin, this.hair, this.load, this.cart);
  }

  private makeInstanced(geo: BufferGeometry, name: string): InstancedMesh {
    const mesh = new InstancedMesh(geo, this.material, MAX_VILLAGERS);
    mesh.name = name;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    return mesh;
  }

  update(world: World, time: number, alpha: number): void {
    const villagers = world.villagers;
    const n = Math.min(villagers.length, MAX_VILLAGERS);
    let loadCount = 0;
    let cartCount = 0;

    for (let i = 0; i < n; i++) {
      const v = villagers[i];
      // Interpolate between the last two simulation ticks so movement reads as
      // smooth at 60 fps even though the world only steps ten times a second.
      const x = v.prevX + (v.x - v.prevX) * alpha;
      const y = v.prevY + (v.y - v.prevY) * alpha;
      let dAngle = v.angle - v.prevAngle;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      const angle = v.prevAngle + dAngle * alpha;
      const ground = world.map.sampleElevation(x, y) * HEIGHT_SCALE;
      const scale = (v.profession === 'child' ? 0.62 : 1) * v.bodyScale;

      const moving = v.state === 'walking' || v.state === 'hauling';
      const working = v.state === 'working';
      // A small vertical bob plus a lean is enough to read as a walk cycle
      // at this camera distance, and it costs nothing per frame.
      const gait = moving ? Math.abs(Math.sin(time * 9 + v.phase)) * 0.045 : 0;
      const breathe = Math.sin(time * 1.7 + v.phase) * 0.008;
      const swing = working ? Math.sin(time * 6 + v.phase) * 0.22 : moving ? Math.sin(time * 9 + v.phase) * 0.07 : 0;

      const d = this.dummy;
      d.position.set(x, ground + gait + breathe, y);
      d.rotation.set(swing * 0.35, -angle + Math.PI / 2, 0);
      d.scale.setScalar(scale);
      if (v.state === 'sleeping') {
        d.scale.set(scale, scale * 0.25, scale);
        d.position.y = ground;
      }
      d.updateMatrix();
      this.matrix.copy(d.matrix);

      this.tunic.setMatrixAt(i, this.matrix);
      this.skin.setMatrixAt(i, this.matrix);
      this.hair.setMatrixAt(i, this.matrix);

      const prof = PROFESSIONS[v.profession] ?? PROFESSIONS.idle;
      this.color.set(prof.tunic).convertSRGBToLinear();
      this.tunic.setColorAt(i, this.color);
      this.color.set(SKIN_TONES[v.skin % SKIN_TONES.length]).convertSRGBToLinear();
      this.skin.setColorAt(i, this.color);
      this.color.set(HAIR_COLORS[v.hair % HAIR_COLORS.length]).convertSRGBToLinear();
      this.hair.setColorAt(i, this.color);

      if (v.carrying) {
        // A depot's own porter pulls a handcart — which is also exactly who
        // carries the extra load the cart is worth in the simulation.
        const carted = v.profession === 'carrier';
        d.position.set(x, ground + (carted ? 0.02 : gait + breathe + 0.62 * scale), y);
        d.rotation.set(0, -angle + Math.PI / 2, 0);
        d.scale.setScalar(scale);
        d.updateMatrix();
        if (carted) {
          this.cart.setMatrixAt(cartCount, d.matrix);
          this.color.set(GOODS[v.carrying].color).convertSRGBToLinear();
          this.cart.setColorAt(cartCount, this.color);
          cartCount++;
        } else {
          this.load.setMatrixAt(loadCount, d.matrix);
          this.color.set(GOODS[v.carrying].color).convertSRGBToLinear();
          this.load.setColorAt(loadCount, this.color);
          loadCount++;
        }
      }
    }

    this.tunic.count = n;
    this.skin.count = n;
    this.hair.count = n;
    this.load.count = loadCount;
    this.cart.count = cartCount;

    for (const mesh of [this.tunic, this.skin, this.hair, this.load, this.cart]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Screen-space picking support: returns the villager under a world point. */
  static pick(world: World, x: number, z: number, radius = 0.6): Villager | null {
    let best: Villager | null = null;
    let bestD = radius * radius;
    for (const v of world.villagers) {
      const d = (v.x - x) ** 2 + (v.y - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  dispose(): void {
    for (const mesh of [this.tunic, this.skin, this.hair, this.load, this.cart]) {
      mesh.geometry.dispose();
    }
    this.material.dispose();
  }
}

// ── Geometry ───────────────────────────────────────────────────────────────
// Authored facing +X so a yaw of -angle + 90° points them along their heading.

function buildTunicGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  // Legs.
  for (const sz of [-1, 1]) {
    b.boxOn(0, 0, sz * 0.055, 0.11, 0.26, 0.1, WHITE);
  }
  // Belted tunic.
  b.boxOn(0, 0.24, 0, 0.17, 0.3, 0.24, WHITE);
  b.boxOn(0, 0.5, 0, 0.19, 0.06, 0.26, WHITE);
  return b.build();
}

function buildSkinGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  // Arms.
  for (const sz of [-1, 1]) {
    b.boxOn(0, 0.28, sz * 0.14, 0.09, 0.24, 0.08, WHITE);
  }
  // Head and neck.
  b.boxOn(0, 0.55, 0, 0.09, 0.05, 0.1, WHITE);
  b.box(0.005, 0.69, 0, 0.16, 0.18, 0.17, WHITE);
  return b.build();
}

function buildHairGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  // Hair cap sitting on the skull, slightly back-weighted.
  b.box(-0.01, 0.755, 0, 0.165, 0.07, 0.178, WHITE);
  b.box(-0.07, 0.69, 0, 0.045, 0.14, 0.175, WHITE);
  return b.build();
}

function buildLoadGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  // A crate held at chest height in front of the villager.
  b.box(0.16, 0, 0, 0.18, 0.16, 0.22, WHITE);
  return b.build();
}

/**
 * The depot porter's handcart, dragged behind them. Only the load takes the
 * instance colour; the frame and wheels are baked in, which keeps the whole
 * thing to one draw call.
 */
function buildCartGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const wood = new Color('#8a6034').convertSRGBToLinear();
  const beam = new Color('#6b4a2c').convertSRGBToLinear();
  const iron = new Color('#6f7378').convertSRGBToLinear();
  // Shafts running forward to the porter's hands.
  for (const sz of [-1, 1]) {
    b.box(0.02, 0.28, sz * 0.1, 0.42, 0.035, 0.035, beam);
  }
  // Bed and sides.
  b.box(-0.28, 0.24, 0, 0.38, 0.045, 0.3, wood);
  for (const sz of [-1, 1]) b.box(-0.28, 0.31, sz * 0.15, 0.38, 0.13, 0.035, wood);
  b.box(-0.47, 0.31, 0, 0.035, 0.13, 0.3, wood);
  // Wheels, and the axle between them.
  for (const sz of [-1, 1]) {
    b.disc(-0.28, 0.16, sz * 0.19, 0.16, 0.045, 9, beam);
    b.disc(-0.28, 0.16, sz * 0.19, 0.05, 0.06, 6, iron);
  }
  b.bar(-0.28, 0.16, 0, 0.022, 0.4, 5, iron, 'z');
  // The load itself, which takes the instance colour.
  b.box(-0.28, 0.33, 0, 0.3, 0.14, 0.22, WHITE);
  return b.build();
}
