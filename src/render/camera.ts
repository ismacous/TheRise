import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { clamp, damp } from '../core/util';
import type { TileMap } from '../sim/tilemap';
import { HEIGHT_SCALE } from './constants';

export interface CameraLimits {
  minDistance: number;
  maxDistance: number;
  minPitch: number;
  maxPitch: number;
}

const DEFAULT_LIMITS: CameraLimits = {
  minDistance: 7,
  maxDistance: 105,
  minPitch: 0.42,
  maxPitch: 1.18,
};

/**
 * Three-quarter isometric-style camera driven by touch: one finger pans, two
 * fingers pinch to zoom and twist to orbit, and a two-finger vertical drag
 * changes the pitch. Mouse and keyboard mirror the same gestures for desktop.
 */
export class CameraController {
  readonly camera: PerspectiveCamera;
  readonly target = new Vector3();
  limits: CameraLimits = { ...DEFAULT_LIMITS };

  distance = 34;
  yaw = Math.PI * 0.25;
  pitch = 0.82;

  private desiredDistance = 34;
  private desiredYaw = Math.PI * 0.25;
  private desiredPitch = 0.82;
  private desiredTarget = new Vector3();
  private velocity = new Vector3();

  private map: TileMap;
  private element: HTMLElement;
  private raycaster = new Raycaster();
  private ndc = new Vector2();

  /** Set while a gesture is in progress so the UI can ignore taps. */
  dragging = false;
  private moved = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private lastPinchDistance = 0;
  private lastPinchAngle = 0;
  private lastMid = new Vector2();
  private rotateMode = false;
  private disposers: Array<() => void> = [];

  /** Notified when the user taps without dragging. */
  onTap: ((clientX: number, clientY: number) => void) | null = null;
  /** Notified on a long press (context actions). */
  onLongPress: ((clientX: number, clientY: number) => void) | null = null;
  private pressTimer = 0;
  private pressStart = new Vector2();

  constructor(element: HTMLElement, map: TileMap, aspect: number) {
    this.element = element;
    this.map = map;
    this.camera = new PerspectiveCamera(48, aspect, 0.5, 400);
    this.camera.position.set(0, 30, 30);
    this.attach();
  }

  focusOn(x: number, z: number, distance?: number): void {
    this.desiredTarget.set(x, this.map.sampleElevation(x, z) * HEIGHT_SCALE, z);
    if (distance !== undefined) this.desiredDistance = clamp(distance, this.limits.minDistance, this.limits.maxDistance);
    this.velocity.set(0, 0, 0);
  }

  snapTo(x: number, z: number, distance?: number): void {
    this.focusOn(x, z, distance);
    this.target.copy(this.desiredTarget);
    this.distance = this.desiredDistance;
    this.update(0.016);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Converts a screen point to the ground position under it. */
  screenToGround(clientX: number, clientY: number, out = new Vector3()): Vector3 | null {
    const rect = this.element.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const origin = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;

    // March the ray against the height field: cheap, robust and it follows
    // hills correctly without a collision mesh.
    let t = 0;
    let prevAbove = origin.y - this.sampleHeight(origin.x, origin.z);
    const maxT = 400;
    const step = 1.2;
    for (t = step; t < maxT; t += step) {
      const x = origin.x + dir.x * t;
      const z = origin.z + dir.z * t;
      const y = origin.y + dir.y * t;
      const above = y - this.sampleHeight(x, z);
      if (above <= 0 && prevAbove > 0) {
        // Bisect for a smooth result.
        let lo = t - step;
        let hi = t;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          const mx = origin.x + dir.x * mid;
          const mz = origin.z + dir.z * mid;
          const my = origin.y + dir.y * mid;
          if (my - this.sampleHeight(mx, mz) > 0) lo = mid;
          else hi = mid;
        }
        const f = (lo + hi) / 2;
        return out.set(origin.x + dir.x * f, origin.y + dir.y * f, origin.z + dir.z * f);
      }
      prevAbove = above;
    }
    return null;
  }

  private sampleHeight(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.map.width || z >= this.map.height) return 0;
    return this.map.sampleElevation(x, z) * HEIGHT_SCALE;
  }

  private pan(dxPixels: number, dyPixels: number): void {
    // Scale the pan by distance so the world moves under the finger at any zoom.
    const rect = this.element.getBoundingClientRect();
    const worldPerPixel = (this.distance * 1.6) / Math.max(1, rect.height);
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const dx = -dxPixels * worldPerPixel;
    const dy = -dyPixels * worldPerPixel;
    this.desiredTarget.x += rightX * dx + forwardX * dy;
    this.desiredTarget.z += rightZ * dx + forwardZ * dy;
    this.velocity.set(rightX * dx + forwardX * dy, 0, rightZ * dx + forwardZ * dy).multiplyScalar(6);
    this.clampTarget();
  }

  private clampTarget(): void {
    const pad = 4;
    this.desiredTarget.x = clamp(this.desiredTarget.x, pad, this.map.width - pad);
    this.desiredTarget.z = clamp(this.desiredTarget.z, pad, this.map.height - pad);
  }

  zoomBy(factor: number): void {
    this.desiredDistance = clamp(
      this.desiredDistance * factor,
      this.limits.minDistance,
      this.limits.maxDistance,
    );
  }

  private attach(): void {
    const el = this.element;
    const onPointerDown = (e: PointerEvent): void => {
      el.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.moved = 0;
      this.dragging = true;
      this.rotateMode = e.button === 2 || e.shiftKey;
      this.pressStart.set(e.clientX, e.clientY);
      this.pressTimer = 0.55;
      if (this.pointers.size === 2) this.beginPinch();
    };

    const onPointerMove = (e: PointerEvent): void => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.moved > 8) this.pressTimer = 0;

      if (this.pointers.size >= 2) {
        this.updatePinch();
      } else if (this.rotateMode) {
        this.desiredYaw -= dx * 0.006;
        this.desiredPitch = clamp(this.desiredPitch + dy * 0.004, this.limits.minPitch, this.limits.maxPitch);
      } else {
        this.pan(dx, dy);
      }
    };

    const onPointerUp = (e: PointerEvent): void => {
      const wasSingle = this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.lastPinchDistance = 0;
      if (this.pointers.size === 0) {
        this.dragging = false;
        if (wasSingle && this.moved < 10 && this.pressTimer > 0) {
          this.onTap?.(e.clientX, e.clientY);
        }
        this.pressTimer = 0;
      }
    };

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      this.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
    };

    const onContext = (e: Event): void => e.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContext);
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContext);
    });
  }

  private beginPinch(): void {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return;
    this.lastPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    this.lastPinchAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    this.lastMid.set((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
  }

  private updatePinch(): void {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;

    if (this.lastPinchDistance > 0) {
      const scale = this.lastPinchDistance / Math.max(1, dist);
      this.zoomBy(scale);

      let dAngle = angle - this.lastPinchAngle;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      this.desiredYaw -= dAngle;

      // Vertical movement of the midpoint tilts the camera.
      const dMidY = midY - this.lastMid.y;
      const dMidX = midX - this.lastMid.x;
      if (Math.abs(dMidY) > Math.abs(dMidX)) {
        this.desiredPitch = clamp(
          this.desiredPitch + dMidY * 0.0035,
          this.limits.minPitch,
          this.limits.maxPitch,
        );
      }
    }
    this.lastPinchDistance = dist;
    this.lastPinchAngle = angle;
    this.lastMid.set(midX, midY);
  }

  update(dt: number): void {
    if (this.pressTimer > 0) {
      this.pressTimer -= dt;
      if (this.pressTimer <= 0 && this.pointers.size === 1 && this.moved < 10) {
        this.onLongPress?.(this.pressStart.x, this.pressStart.y);
      }
    }

    // Inertia after a flick.
    if (!this.dragging && this.velocity.lengthSq() > 0.0001) {
      this.desiredTarget.addScaledVector(this.velocity, dt * 0.25);
      this.velocity.multiplyScalar(Math.max(0, 1 - dt * 4.5));
      this.clampTarget();
    }

    // Keep the target glued to the ground so zooming feels anchored.
    this.desiredTarget.y = this.sampleHeight(this.desiredTarget.x, this.desiredTarget.z);

    const lambda = 12;
    this.target.x = damp(this.target.x, this.desiredTarget.x, lambda, dt);
    this.target.y = damp(this.target.y, this.desiredTarget.y, lambda * 0.6, dt);
    this.target.z = damp(this.target.z, this.desiredTarget.z, lambda, dt);
    this.distance = damp(this.distance, this.desiredDistance, 9, dt);
    this.yaw = damp(this.yaw, this.desiredYaw, 11, dt);
    this.pitch = damp(this.pitch, this.desiredPitch, 11, dt);

    // Zooming out also lifts the pitch a little; it reads much better on a
    // phone than a fixed angle at every distance.
    const zoomT = (this.distance - this.limits.minDistance) / (this.limits.maxDistance - this.limits.minDistance);
    const pitch = clamp(this.pitch + zoomT * 0.22, this.limits.minPitch, this.limits.maxPitch + 0.2);

    const horizontal = Math.cos(pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.sin(pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }
}
