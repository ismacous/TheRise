import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  MeshBasicMaterial,
} from 'three';
import { BUILDINGS } from '../data/buildings';
import type { Building } from '../sim/types';
import type { World } from '../sim/world';
import { HEIGHT_SCALE } from './constants';
import { buildingVisual, type BuildingVisual } from './buildings';

interface Entry {
  building: Building;
  group: Group;
  body: Mesh;
  rotor?: Mesh;
  rotorSpeed: number;
  visual: BuildingVisual;
  state: string;
  /** Rebuilt when the rank changes: a level II has its own silhouette. */
  level: number;
  progressBucket: number;
}

const MAX_GLOWS = 700;

/**
 * Owns one Object3D per building. Geometry is cached per (type, state), so a
 * hundred cottages share a single BufferGeometry and only their transforms
 * differ.
 */
export class BuildingRenderer {
  readonly group = new Group();
  private entries = new Map<number, Entry>();
  private material: MeshLambertMaterial;
  private glow: InstancedMesh;
  private glowDummy = new Object3D();
  private glowColor = new Color();

  constructor() {
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.group.name = 'buildings';

    const quad = new PlaneGeometry(0.42, 0.42);
    const glowMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.glow = new InstancedMesh(quad, glowMat, MAX_GLOWS);
    this.glow.instanceMatrix.setUsage(DynamicDrawUsage);
    this.glow.frustumCulled = false;
    this.glow.count = 0;
    this.glow.renderOrder = 6;
    this.glow.name = 'window-glow';
    this.group.add(this.glow);
  }

  /** Adds, removes and re-skins meshes so they match the simulation. */
  sync(world: World): void {
    const seen = new Set<number>();
    for (const b of world.buildingList) {
      seen.add(b.id);
      const existing = this.entries.get(b.id);
      const bucket = b.state === 'building' ? Math.floor((b.buildProgress / Math.max(1, BUILDINGS[b.def].buildWork)) * 3) : 0;
      if (!existing) {
        this.entries.set(b.id, this.createEntry(world, b, bucket));
      } else if (
        existing.state !== b.state ||
        existing.level !== b.level ||
        existing.progressBucket !== bucket
      ) {
        this.group.remove(existing.group);
        disposeEntry(existing);
        this.entries.set(b.id, this.createEntry(world, b, bucket));
      }
    }
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.group.remove(entry.group);
      disposeEntry(entry);
      this.entries.delete(id);
    }
  }

  private createEntry(world: World, b: Building, bucket: number): Entry {
    const visual = buildingVisual(b.def, b.state, b.level);
    const group = new Group();
    group.name = `building-${b.id}`;
    const body = new Mesh(visual.geometry, this.material);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    let rotor: Mesh | undefined;
    if (visual.rotor) {
      const holder = new Group();
      holder.position.set(visual.rotor.x, visual.rotor.y, visual.rotor.z);
      holder.rotation.set(visual.rotor.pitch, visual.rotor.yaw, 0);
      rotor = new Mesh(visual.rotor.geometry, this.material);
      rotor.castShadow = true;
      holder.add(rotor);
      group.add(holder);
    }

    const y = world.map.footprintElevation(b.x, b.y, b.w, b.h) * HEIGHT_SCALE;
    group.position.set(b.cx, y, b.cy);
    group.rotation.y = (b.rotation * Math.PI) / 2;
    this.group.add(group);

    return {
      building: b,
      group,
      body,
      rotor,
      rotorSpeed: visual.rotor?.speed ?? 0,
      visual,
      state: b.state,
      level: b.level,
      progressBucket: bucket,
    };
  }

  update(world: World, dt: number, nightFactor: number): void {
    let glowCount = 0;
    for (const entry of this.entries.values()) {
      const b = entry.building;
      const def = BUILDINGS[b.def];

      // Rotors turn only when the workshop is actually producing.
      if (entry.rotor) {
        const staffed = def.workers === 0 || b.workers.length > 0;
        const running = b.state === 'active' && b.enabled && staffed && !b.stall;
        if (running) entry.rotor.rotation.z += entry.rotorSpeed * dt;
      }

      // Burning buildings shudder and darken.
      if (b.state === 'burning') {
        const shake = Math.sin(world.time.elapsed * 22 + b.id) * 0.012 * b.fire;
        entry.group.position.x = b.cx + shake;
        entry.group.position.z = b.cy + shake * 0.7;
      }

      if (b.state !== 'active' || nightFactor <= 0.02) continue;
      const lit = def.workers === 0 ? b.residents.length > 0 : b.workers.length > 0;
      if (!lit) continue;
      for (const light of entry.visual.lights) {
        if (glowCount >= MAX_GLOWS) break;
        const d = this.glowDummy;
        // Local offset rotated into world space by the building's yaw.
        const yaw = entry.group.rotation.y;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        d.position.set(
          entry.group.position.x + light.x * cos + light.z * sin,
          entry.group.position.y + light.y,
          entry.group.position.z - light.x * sin + light.z * cos,
        );
        d.rotation.set(-Math.PI / 3, 0, 0);
        const flicker = 0.88 + Math.sin(world.time.elapsed * 6 + b.id * 1.7) * 0.12;
        d.scale.setScalar(light.intensity * nightFactor * flicker);
        d.updateMatrix();
        this.glow.setMatrixAt(glowCount, d.matrix);
        this.glowColor.copy(light.color).convertSRGBToLinear();
        this.glow.setColorAt(glowCount, this.glowColor);
        glowCount++;
      }
    }
    this.glow.count = glowCount;
    this.glow.instanceMatrix.needsUpdate = true;
    if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
  }

  /** Building under a world-space point, for tap selection. */
  pick(world: World, x: number, z: number): Building | null {
    return world.buildingAt(Math.floor(x), Math.floor(z));
  }

  entryFor(id: number): Entry | undefined {
    return this.entries.get(id);
  }

  dispose(): void {
    for (const e of this.entries.values()) disposeEntry(e);
    this.entries.clear();
    this.material.dispose();
    this.glow.geometry.dispose();
    (this.glow.material as MeshBasicMaterial).dispose();
  }
}

function disposeEntry(_e: Entry): void {
  // Geometry is shared through the building visual cache, so nothing to free
  // here. The function exists to keep the removal path explicit.
}
