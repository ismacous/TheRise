import { TERRAIN } from '../sim/types';
import type { World } from '../sim/world';
import { BUILDINGS } from '../data/buildings';
import type { GameApi } from './api';
import { el, onTap } from './dom';

const SIZE = 132;

const TERRAIN_COLORS: Record<number, [number, number, number]> = {
  [TERRAIN.GRASS]: [104, 148, 72],
  [TERRAIN.FOREST]: [62, 102, 52],
  [TERRAIN.ROCK]: [128, 130, 136],
  [TERRAIN.SAND]: [200, 184, 142],
  [TERRAIN.DIRT]: [140, 114, 78],
  [TERRAIN.WATER]: [62, 112, 140],
};

/**
 * A downsampled top-down view of the valley with the camera frustum, the
 * player's buildings and any fire. Tapping it flies the camera there, which is
 * the only sane way to cross a 208x208 map on a phone.
 */
export class Minimap {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrainCanvas: HTMLCanvasElement;
  private api: GameApi;
  private scale: number;
  private terrainDirty = true;
  private lastSeason = '';
  private collapsed = false;

  constructor(api: GameApi) {
    this.api = api;
    const w = api.world;
    this.scale = SIZE / Math.max(w.map.width, w.map.height);

    this.canvas = el('canvas', { class: 'minimap-canvas' });
    this.canvas.width = SIZE * 2;
    this.canvas.height = SIZE * 2;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(2, 2);
    this.ctx.imageSmoothingEnabled = false;

    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = w.map.width;
    this.terrainCanvas.height = w.map.height;

    const toggle = el('button', { class: 'minimap-toggle', text: '▾', 'aria-label': 'Replier la carte' });
    onTap(toggle, () => {
      this.collapsed = !this.collapsed;
      this.root.classList.toggle('collapsed', this.collapsed);
      toggle.textContent = this.collapsed ? '▴' : '▾';
    });

    this.root = el('div', { class: 'minimap' }, [this.canvas, toggle]);

    // Tapping jumps the camera; dragging scrubs across the valley.
    let dragging = false;
    const jump = (e: PointerEvent): void => {
      const rect = this.canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * SIZE;
      const my = ((e.clientY - rect.top) / rect.height) * SIZE;
      this.api.focusOn(mx / this.scale, my / this.scale);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      jump(e);
      e.stopPropagation();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      jump(e);
      e.stopPropagation();
    });
    this.canvas.addEventListener('pointerup', (e) => {
      dragging = false;
      e.stopPropagation();
    });
  }

  markTerrainDirty(): void {
    this.terrainDirty = true;
  }

  private renderTerrain(w: World): void {
    const map = w.map;
    const ctx = this.terrainCanvas.getContext('2d')!;
    const img = ctx.createImageData(map.width, map.height);
    const winter = w.time.season === 'winter';
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = map.idx(x, y);
        const t = map.terrain[i];
        let [r, g, b] = TERRAIN_COLORS[t] ?? TERRAIN_COLORS[TERRAIN.GRASS];
        if (winter && t !== TERRAIN.WATER) {
          r = (r + 210) / 2;
          g = (g + 220) / 2;
          b = (b + 228) / 2;
        }
        if (map.road[i] !== 0) {
          r = 150;
          g = 130;
          b = 100;
        }
        // Shade by elevation so the relief reads at a glance.
        const shade = 0.82 + Math.min(0.35, Math.max(-0.2, map.elevation[i] * 0.03));
        const p = i * 4;
        img.data[p] = Math.min(255, r * shade);
        img.data[p + 1] = Math.min(255, g * shade);
        img.data[p + 2] = Math.min(255, b * shade);
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.terrainDirty = false;
  }

  update(): void {
    if (this.collapsed) return;
    const w = this.api.world;
    if (this.terrainDirty || this.lastSeason !== w.time.season) {
      this.lastSeason = w.time.season;
      this.renderTerrain(w);
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(this.terrainCanvas, 0, 0, SIZE, SIZE);

    // Buildings.
    for (const b of w.buildingList) {
      const def = BUILDINGS[b.def];
      if (b.state === 'burning') ctx.fillStyle = '#ff6a32';
      else if (b.state === 'ruined') ctx.fillStyle = '#6f675c';
      else if (b.state !== 'active') ctx.fillStyle = '#c9a56b';
      else if (def.housing) ctx.fillStyle = '#f0e2c2';
      else if (def.storage?.global) ctx.fillStyle = '#d9b45f';
      else ctx.fillStyle = '#e6d3a8';
      const x = b.x * this.scale;
      const y = b.y * this.scale;
      ctx.fillRect(x, y, Math.max(1.6, b.w * this.scale), Math.max(1.6, b.h * this.scale));
    }

    // Camera footprint.
    const target = this.cameraTarget();
    if (target) {
      const span = this.cameraSpan() * this.scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(
        target.x * this.scale - span / 2,
        target.y * this.scale - span / 2,
        span,
        span,
      );
    }

    // Fire alerts pulse so they are impossible to miss.
    const pulse = 0.5 + Math.sin(w.time.elapsed * 6) * 0.5;
    for (const b of w.buildingList) {
      if (b.state !== 'burning') continue;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,120,60,${0.35 + pulse * 0.65})`;
      ctx.lineWidth = 1.5;
      ctx.arc(b.cx * this.scale, b.cy * this.scale, 4 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Injected by the game so the minimap need not import the renderer. */
  cameraTarget: () => { x: number; y: number } | null = () => null;
  cameraSpan: () => number = () => 20;
}
