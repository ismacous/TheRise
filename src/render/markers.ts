import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  type Camera,
} from 'three';
import { BUILDINGS } from '../data/buildings';
import type { Building, Villager } from '../sim/types';
import type { World } from '../sim/world';
import { HEIGHT_SCALE } from './constants';
import { MeshBuilder } from './meshBuilder';

/**
 * Status pins over buildings and villagers.
 *
 * The brief was "small icons so I know where the problem is", and the same
 * breath asked for them not to take over the screen — which is the whole
 * design problem, because a village of four hundred people has four hundred
 * opinions about its own happiness. Three rules keep it bearable:
 *
 * 1. **A pin means something is wrong.** Nothing is marked for working
 *    normally. A screen with no pins on it is a village that is fine, and
 *    that is a useful thing to be able to see at a glance.
 * 2. **One pin per thing.** A villager who is ill, hungry and miserable gets
 *    the illness, because that is what to deal with first.
 * 3. **People only up close.** Villager pins appear below `PEOPLE_ZOOM` —
 *    about the distance at which you can tell one villager from another
 *    anyway. Buildings keep theirs at every zoom: there are few of them, and
 *    an idle workshop is worth spotting from across the valley.
 *
 * They are drawn as geometry rather than sprites, like everything else here,
 * and there is one instanced mesh per kind: five draw calls for the lot.
 */

export type MarkKind = 'idle' | 'stalled' | 'sick' | 'hungry' | 'sad';

const KINDS: MarkKind[] = ['idle', 'stalled', 'sick', 'hungry', 'sad'];

/** Camera distance below which villagers get their pins. */
const PEOPLE_ZOOM = 42;

/** Nothing good comes of five hundred pins; the nearest ones win. */
const MAX_PER_KIND = 90;

/** Seconds a workshop must have been stopped before it is worth a pin. */
const STALL_GRACE = 4;

const C = {
  amber: new Color('#f0a63c').convertSRGBToLinear(),
  amberDark: new Color('#b4761f').convertSRGBToLinear(),
  red: new Color('#e2513f').convertSRGBToLinear(),
  redDark: new Color('#a3341f').convertSRGBToLinear(),
  green: new Color('#6fc07a').convertSRGBToLinear(),
  greenDark: new Color('#3f8c52').convertSRGBToLinear(),
  blue: new Color('#7fa8d8').convertSRGBToLinear(),
  blueDark: new Color('#4f77ab').convertSRGBToLinear(),
  ink: new Color('#20242c').convertSRGBToLinear(),
  light: new Color('#fdf6e8').convertSRGBToLinear(),
};

/**
 * The pin body: a disc on a short spike, built in the XY plane so a billboard
 * rotation is all it takes to face the camera. The tip sits at the origin, so
 * an instance is positioned at the point it refers to.
 */
function pin(body: Color, rim: Color): MeshBuilder {
  const b = new MeshBuilder();
  b.cone(0, 0.2, 0, 0.16, 0.22, 3, rim, Math.PI);
  b.disc(0, 0.52, -0.01, 0.34, 0.02, 14, rim);
  b.disc(0, 0.52, 0.01, 0.28, 0.02, 14, body);
  return b;
}

/** Turns a builder into a finished, centred geometry. */
function finish(b: MeshBuilder): BufferGeometry {
  return b.build();
}

/** An exclamation: the mark for a workshop that has stopped. */
function stalledGeometry(): BufferGeometry {
  const b = pin(C.red, C.redDark);
  b.box(0, 0.58, 0.03, 0.06, 0.2, 0.02, C.light);
  b.box(0, 0.42, 0.03, 0.06, 0.06, 0.02, C.light);
  return finish(b);
}

/** An empty outline of a person: nobody works here. */
function idleGeometry(): BufferGeometry {
  const b = pin(C.amber, C.amberDark);
  b.disc(0, 0.6, 0.03, 0.07, 0.02, 10, C.ink);
  b.box(0, 0.45, 0.03, 0.2, 0.14, 0.02, C.ink);
  b.box(0, 0.45, 0.04, 0.12, 0.09, 0.02, C.amber);
  return finish(b);
}

/** A cross: the villager is ill. */
function sickGeometry(): BufferGeometry {
  const b = pin(C.green, C.greenDark);
  b.box(0, 0.52, 0.03, 0.22, 0.07, 0.02, C.light);
  b.box(0, 0.52, 0.03, 0.07, 0.22, 0.02, C.light);
  return finish(b);
}

/** A bowl, as empty as the villager's stomach. */
function hungryGeometry(): BufferGeometry {
  const b = pin(C.amber, C.amberDark);
  b.box(0, 0.45, 0.03, 0.26, 0.05, 0.02, C.ink);
  b.box(-0.12, 0.52, 0.03, 0.04, 0.12, 0.02, C.ink);
  b.box(0.12, 0.52, 0.03, 0.04, 0.12, 0.02, C.ink);
  return finish(b);
}

/** A mouth turned down. Nothing else reads as "unhappy" at four pixels. */
function sadGeometry(): BufferGeometry {
  const b = pin(C.blue, C.blueDark);
  b.box(-0.09, 0.58, 0.03, 0.05, 0.05, 0.02, C.ink);
  b.box(0.09, 0.58, 0.03, 0.05, 0.05, 0.02, C.ink);
  b.box(0, 0.42, 0.03, 0.16, 0.04, 0.02, C.ink);
  b.box(-0.09, 0.45, 0.03, 0.04, 0.04, 0.02, C.ink);
  b.box(0.09, 0.45, 0.03, 0.04, 0.04, 0.02, C.ink);
  return finish(b);
}

const GEOMETRY: Record<MarkKind, () => BufferGeometry> = {
  idle: idleGeometry,
  stalled: stalledGeometry,
  sick: sickGeometry,
  hungry: hungryGeometry,
  sad: sadGeometry,
};

export class MarkerRenderer {
  readonly group = new Group();
  private meshes = new Map<MarkKind, InstancedMesh>();
  private counts = new Map<MarkKind, number>();
  private dummy = new Object3D();
  /** The camera's orientation, copied into every instance to face it. */
  private facing = new Quaternion();
  private material: MeshBasicMaterial;

  constructor() {
    // Unlit on purpose: a warning that goes dark at night is not a warning.
    // Depth testing is off for the same reason — the pin over the workshop
    // behind the hill is exactly the one the player needs to see.
    this.material = new MeshBasicMaterial({ vertexColors: true, depthTest: false, transparent: true });
    this.group.name = 'markers';
    this.group.renderOrder = 8;
    for (const kind of KINDS) {
      const mesh = new InstancedMesh(GEOMETRY[kind](), this.material, MAX_PER_KIND);
      mesh.name = `marker-${kind}`;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      mesh.count = 0;
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
  }

  update(world: World, camera: Camera, distance: number, time: number): void {
    for (const kind of KINDS) this.counts.set(kind, 0);
    this.facing.copy(camera.quaternion);

    // Constant on-screen size: a pin that shrinks with the village is a pin
    // nobody sees, and one that grows swallows the building it belongs to.
    const scale = Math.max(0.6, distance * 0.029);

    for (const b of world.buildingList) {
      const kind = buildingMark(b);
      if (!kind) continue;
      const y = world.map.footprintElevation(b.x, b.y, b.w, b.h) * HEIGHT_SCALE;
      const height = Math.max(1.6, Math.min(b.w, b.h) * 0.9 + 1.2);
      this.place(kind, b.cx, y + height, b.cy, scale, time, b.id);
    }

    if (distance <= PEOPLE_ZOOM) {
      for (const v of world.villagers) {
        const kind = villagerMark(v);
        if (!kind) continue;
        this.place(kind, v.x, groundY(world, v), v.y, scale * 0.85, time, v.id);
      }
    }

    for (const kind of KINDS) {
      const mesh = this.meshes.get(kind)!;
      const count = this.counts.get(kind)!;
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private place(
    kind: MarkKind,
    x: number,
    y: number,
    z: number,
    scale: number,
    time: number,
    seed: number,
  ): void {
    const count = this.counts.get(kind)!;
    if (count >= MAX_PER_KIND) return;
    const mesh = this.meshes.get(kind)!;
    const d = this.dummy;
    // A slow bob, out of step from one pin to the next, so a row of them does
    // not pulse in unison like a warning light.
    const bob = Math.sin(time * 2.2 + seed * 0.7) * 0.06;
    d.position.set(x, y + bob, z);
    d.quaternion.copy(this.facing);
    d.scale.setScalar(scale);
    d.updateMatrix();
    mesh.setMatrixAt(count, d.matrix);
    this.counts.set(kind, count + 1);
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.meshes.clear();
    this.material.dispose();
  }
}

function groundY(world: World, v: Villager): number {
  return world.map.sampleElevation(v.x, v.y) * HEIGHT_SCALE + 1.7;
}

function buildingMark(b: Building): MarkKind | null {
  if (b.state !== 'active' || !b.enabled) return null;
  const def = BUILDINGS[b.def];
  if (def.workers > 0 && b.workers.length === 0) return 'idle';
  // A workshop pauses constantly in normal operation — waiting a moment for a
  // delivery is not a problem, and flashing a pin every time one does would
  // teach the player to ignore pins. Only a lasting stoppage earns one.
  if (b.stall && b.idleTime > STALL_GRACE) return 'stalled';
  return null;
}

function villagerMark(v: Villager): MarkKind | null {
  if (v.profession === 'child') return null;
  if (v.sick > 0) return 'sick';
  if (v.satiety < 25) return 'hungry';
  if (v.happiness < 28) return 'sad';
  return null;
}
