import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import type { World } from '../sim/world';
import { HEIGHT_SCALE } from './constants';
import { MeshBuilder } from './meshBuilder';

const MAX_ANIMALS = 400;
const DEER = new Color('#9a7148').convertSRGBToLinear();
const BOAR = new Color('#5e4a3a').convertSRGBToLinear();

/** Roaming wildlife: deer and boar, drawn as one instanced mesh. */
export class FaunaRenderer {
  readonly group = new Group();
  private mesh: InstancedMesh;
  private dummy = new Object3D();
  private color = new Color();
  private material: MeshLambertMaterial;

  constructor() {
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new InstancedMesh(buildAnimalGeometry(), this.material, MAX_ANIMALS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'fauna';
    this.group.add(this.mesh);
    this.group.name = 'wildlife';
  }

  update(world: World, time: number): void {
    const animals = world.animals;
    const n = Math.min(animals.length, MAX_ANIMALS);
    for (let i = 0; i < n; i++) {
      const a = animals[i];
      const ground = world.map.sampleElevation(a.x, a.y) * HEIGHT_SCALE;
      const moving = Math.hypot(a.vx ?? 0, a.vy ?? 0) > 0.05;
      const bob = moving ? Math.abs(Math.sin(time * 7 + a.id)) * 0.035 : 0;
      const d = this.dummy;
      d.position.set(a.x, ground + bob, a.y);
      d.rotation.set(0, -Math.atan2(a.vy ?? 0, a.vx ?? 1) + Math.PI / 2, 0);
      const scale = a.variant === 0 ? 1 : 0.85;
      d.scale.setScalar(scale);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.color.copy(a.variant === 0 ? DEER : BOAR);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

function buildAnimalGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const white = new Color(1, 1, 1);
  const dark = new Color(0.45, 0.4, 0.36);
  // Body facing +X.
  b.box(0, 0.36, 0, 0.6, 0.26, 0.26, white);
  b.box(0.3, 0.46, 0, 0.2, 0.18, 0.18, white);
  b.box(0.42, 0.5, 0, 0.14, 0.1, 0.12, white);
  // Antlers on the deer variant; harmless on the boar at this scale.
  for (const sz of [-1, 1]) {
    b.box(0.34, 0.62, sz * 0.05, 0.04, 0.16, 0.04, dark, 0, 0, sz * 0.4);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.boxOn(sx * 0.2, 0, sz * 0.09, 0.06, 0.24, 0.06, dark);
    }
  }
  b.box(-0.32, 0.42, 0, 0.1, 0.1, 0.08, white);
  return b.build();
}
