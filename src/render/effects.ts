import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  RingGeometry,
  ShaderMaterial,
  Uniform,
  Vector3,
} from 'three';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { Building, WeatherKind } from '../sim/types';
import type { World } from '../sim/world';
import { buildingVisual } from './buildings';
import { HEIGHT_SCALE } from './constants';

// ── Weather ────────────────────────────────────────────────────────────────

const WEATHER_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uFall;
  uniform float uSway;
  uniform float uSize;
  uniform vec3 uOrigin;
  uniform float uSpan;
  attribute float aSeed;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    // Wrap each particle inside a column that follows the camera target.
    float t = uTime * uFall + aSeed * 37.0;
    p.y = 22.0 - mod(t, 24.0);
    p.x += sin(t * uSway + aSeed * 6.2) * 1.4;
    p.z += cos(t * uSway * 0.8 + aSeed * 4.1) * 1.4;
    p.x = mod(p.x + uOrigin.x + uSpan * 0.5, uSpan) - uSpan * 0.5 + uOrigin.x;
    p.z = mod(p.z + uOrigin.z + uSpan * 0.5, uSpan) - uSpan * 0.5 + uOrigin.z;
    vAlpha = smoothstep(0.0, 3.0, p.y) * smoothstep(24.0, 16.0, p.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (140.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const WEATHER_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uStretch;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    uv.y *= uStretch;
    float d = length(uv);
    float a = smoothstep(0.5, 0.05, d) * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/** Rain and snow, animated entirely on the GPU inside a moving column. */
export class WeatherParticles {
  readonly points: Points;
  private material: ShaderMaterial;
  private current: WeatherKind = 'clear';
  private targetOpacity = 0;

  constructor(count = 1400, span = 70) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * span;
      positions[i * 3 + 1] = Math.random() * 24;
      positions[i * 3 + 2] = (Math.random() - 0.5) * span;
      seeds[i] = Math.random() * 100;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    geo.boundingSphere = null;

    this.material = new ShaderMaterial({
      uniforms: {
        uTime: new Uniform(0),
        uFall: new Uniform(9),
        uSway: new Uniform(0.4),
        uSize: new Uniform(1.6),
        uColor: new Uniform(new Color('#cfe4f2')),
        uOpacity: new Uniform(0),
        uStretch: new Uniform(0.35),
        uOrigin: new Uniform(new Vector3()),
        uSpan: new Uniform(span),
      },
      vertexShader: WEATHER_VERT,
      fragmentShader: WEATHER_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.name = 'weather';
  }

  setWeather(kind: WeatherKind): void {
    if (kind === this.current) return;
    this.current = kind;
    const u = this.material.uniforms;
    switch (kind) {
      case 'rain':
        this.targetOpacity = 0.55;
        u.uFall.value = 16;
        u.uSway.value = 0.25;
        u.uSize.value = 1.5;
        u.uStretch.value = 0.22;
        (u.uColor.value as Color).set('#b9d8ea');
        break;
      case 'storm':
        this.targetOpacity = 0.8;
        u.uFall.value = 22;
        u.uSway.value = 0.6;
        u.uSize.value = 1.8;
        u.uStretch.value = 0.18;
        (u.uColor.value as Color).set('#a6c6da');
        break;
      case 'snow':
        this.targetOpacity = 0.7;
        u.uFall.value = 3.2;
        u.uSway.value = 0.9;
        u.uSize.value = 2.6;
        u.uStretch.value = 1;
        (u.uColor.value as Color).set('#ffffff');
        break;
      default:
        this.targetOpacity = 0;
        break;
    }
  }

  update(time: number, dt: number, focus: Vector3): void {
    const u = this.material.uniforms;
    u.uTime.value = time;
    (u.uOrigin.value as Vector3).copy(focus);
    const cur = u.uOpacity.value as number;
    u.uOpacity.value = cur + (this.targetOpacity - cur) * Math.min(1, dt * 1.2);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// ── Smoke and fire ─────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

const MAX_PARTICLES = 420;

/** CPU-driven billboards for chimney smoke, fire and dust. */
export class ParticleSystem {
  readonly mesh: InstancedMesh;
  private pool: Particle[] = [];
  private dummy = new Object3D();
  private color = new Color();
  private spawnTimers = new Map<number, number>();

  constructor() {
    const geo = new PlaneGeometry(1, 1);
    const mat = new MeshBasicMaterial({
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: DoubleSide,
      vertexColors: false,
    });
    this.mesh = new InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 8;
    this.mesh.name = 'particles';
  }

  emit(p: Particle): void {
    if (this.pool.length >= MAX_PARTICLES) return;
    this.pool.push(p);
  }

  /** Spawns smoke from chimneys and flames from burning buildings. */
  spawnFromWorld(world: World, dt: number): void {
    for (const b of world.buildingList) {
      if (b.state === 'burning') {
        this.spawnFire(world, b, dt);
        continue;
      }
      if (b.state !== 'active' || !b.enabled) continue;
      const visual = buildingVisual(b.def, 'active', b.level);
      if (!visual.smoke) continue;
      const def = BUILDINGS[b.def];
      const working = def.workers === 0 || (b.workers.length > 0 && !b.stall);
      if (!working) continue;
      let t = (this.spawnTimers.get(b.id) ?? 0) - dt;
      if (t > 0) {
        this.spawnTimers.set(b.id, t);
        continue;
      }
      t = 0.35 + Math.random() * 0.25;
      this.spawnTimers.set(b.id, t);
      const yaw = (b.rotation * Math.PI) / 2;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const base = world.map.footprintElevation(b.x, b.y, b.w, b.h) * HEIGHT_SCALE;
      this.emit({
        x: b.cx + visual.smoke.x * cos + visual.smoke.z * sin,
        y: base + visual.smoke.y,
        z: b.cy - visual.smoke.x * sin + visual.smoke.z * cos,
        vx: (Math.random() - 0.5) * 0.12,
        vy: 0.45 + Math.random() * 0.2,
        vz: (Math.random() - 0.5) * 0.12,
        life: 0,
        maxLife: 3.4,
        size: 0.22,
        r: 0.72,
        g: 0.72,
        b: 0.74,
      });
    }
  }

  private spawnFire(world: World, b: Building, dt: number): void {
    let t = (this.spawnTimers.get(b.id) ?? 0) - dt;
    if (t > 0) {
      this.spawnTimers.set(b.id, t);
      return;
    }
    this.spawnTimers.set(b.id, 0.05);
    const base = world.map.footprintElevation(b.x, b.y, b.w, b.h) * HEIGHT_SCALE;
    const count = 1 + Math.floor(b.fire * 2);
    for (let i = 0; i < count; i++) {
      const ember = Math.random() < 0.35;
      this.emit({
        x: b.cx + (Math.random() - 0.5) * b.w * 0.8,
        y: base + 0.3 + Math.random() * 0.5,
        z: b.cy + (Math.random() - 0.5) * b.h * 0.8,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0.9 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: ember ? 1.1 : 2.2,
        size: ember ? 0.1 : 0.38,
        r: ember ? 1 : 0.55,
        g: ember ? 0.72 : 0.5,
        b: ember ? 0.22 : 0.5,
      });
    }
  }

  update(dt: number, cameraQuaternion: { x: number; y: number; z: number; w: number }): void {
    let count = 0;
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.pool.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy *= 1 - dt * 0.35;
      p.vx *= 1 - dt * 0.5;
      p.vz *= 1 - dt * 0.5;
    }
    for (const p of this.pool) {
      if (count >= MAX_PARTICLES) break;
      const t = p.life / p.maxLife;
      const d = this.dummy;
      d.position.set(p.x, p.y, p.z);
      d.quaternion.set(cameraQuaternion.x, cameraQuaternion.y, cameraQuaternion.z, cameraQuaternion.w);
      d.scale.setScalar(p.size * (0.6 + t * 1.6));
      d.updateMatrix();
      this.mesh.setMatrixAt(count, d.matrix);
      const fade = (1 - t) * 0.75;
      this.color.setRGB(p.r * fade, p.g * fade, p.b * fade);
      this.mesh.setColorAt(count, this.color);
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}

// ── Ground markers ─────────────────────────────────────────────────────────

/** Selection ring plus an optional service-radius circle. */
export class GroundMarkers {
  readonly group = new Group();
  private ring: Mesh;
  private radius: Mesh;
  private ringMat: MeshBasicMaterial;
  private radiusMat: MeshBasicMaterial;

  constructor() {
    this.ringMat = new MeshBasicMaterial({
      color: 0xffdca8,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: DoubleSide,
    });
    this.radiusMat = new MeshBasicMaterial({
      color: 0x7fd4ff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: DoubleSide,
    });
    this.ring = new Mesh(new RingGeometry(0.72, 0.9, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 4;
    this.ring.visible = false;
    this.radius = new Mesh(new RingGeometry(0.97, 1, 64), this.radiusMat);
    this.radius.rotation.x = -Math.PI / 2;
    this.radius.renderOrder = 3;
    this.radius.visible = false;
    this.group.add(this.ring, this.radius);
    this.group.name = 'markers';
  }

  showSelection(x: number, y: number, z: number, size: number): void {
    this.ring.visible = true;
    this.ring.position.set(x, y + 0.06, z);
    this.ring.scale.setScalar(size);
  }

  showRadius(x: number, y: number, z: number, r: number): void {
    this.radius.visible = true;
    this.radius.position.set(x, y + 0.05, z);
    this.radius.scale.setScalar(r);
  }

  hide(): void {
    this.ring.visible = false;
    this.radius.visible = false;
  }

  pulse(time: number): void {
    if (!this.ring.visible) return;
    this.ringMat.opacity = 0.6 + Math.sin(time * 3.4) * 0.25;
  }

  dispose(): void {
    this.ring.geometry.dispose();
    this.radius.geometry.dispose();
    this.ringMat.dispose();
    this.radiusMat.dispose();
  }
}

// ── Placement ghost ────────────────────────────────────────────────────────

/** Translucent preview of the building about to be placed. */
export class PlacementGhost {
  readonly group = new Group();
  private mesh: Mesh | null = null;
  private footprint: Mesh;
  private material: MeshBasicMaterial;
  private footprintMat: MeshBasicMaterial;
  private currentDef: BuildingId | null = null;

  constructor() {
    this.material = new MeshBasicMaterial({
      color: 0x9fe6a0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.footprintMat = new MeshBasicMaterial({
      color: 0x9fe6a0,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: DoubleSide,
    });
    this.footprint = new Mesh(new PlaneGeometry(1, 1), this.footprintMat);
    this.footprint.rotation.x = -Math.PI / 2;
    this.footprint.renderOrder = 5;
    this.group.add(this.footprint);
    this.group.visible = false;
    this.group.name = 'ghost';
  }

  show(defId: BuildingId, x: number, y: number, z: number, rotation: number, valid: boolean): void {
    if (this.currentDef !== defId) {
      if (this.mesh) this.group.remove(this.mesh);
      const visual = buildingVisual(defId, 'active');
      this.mesh = new Mesh(visual.geometry, this.material);
      this.mesh.renderOrder = 5;
      this.group.add(this.mesh);
      this.currentDef = defId;
    }
    const def = BUILDINGS[defId];
    const [w, h] = rotation % 2 === 1 ? [def.size[1], def.size[0]] : def.size;
    this.footprint.scale.set(w, h, 1);
    this.footprint.position.set(0, 0.07, 0);
    this.group.position.set(x, y, z);
    if (this.mesh) this.mesh.rotation.y = (rotation * Math.PI) / 2;
    this.group.visible = true;
    const color = valid ? 0x9fe6a0 : 0xe88b7a;
    this.material.color.setHex(color);
    this.footprintMat.color.setHex(color);
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.footprint.geometry.dispose();
    this.material.dispose();
    this.footprintMat.dispose();
  }
}
