import { TERRAIN } from '../sim/types';
import type { World } from '../sim/world';
import { BUILDINGS } from '../data/buildings';
import type { GameApi } from './api';
import { el, onTap } from './dom';
import { icon } from './icons';

/**
 * Drawing units for the map. The canvas is backed at twice this and stretched
 * to whatever the window allows, so the map is as big as the phone can show
 * without any of the arithmetic below caring.
 */
const SIZE = 256;

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
 *
 * It used to live in the corner of the screen, permanently. That was wrong
 * three times over: it covered the valley whether or not anyone wanted it, it
 * overflowed the little plinth it sat on, and folding it away only slid it
 * down far enough to still be in the way. So it is a button now, and the
 * button opens a map — one thing, in the middle of the screen, as big as the
 * screen allows, and gone again when you are done with it.
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
  private overlay: HTMLElement;
  private open_ = false;

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

    this.root = el('button', { class: 'map-button', 'aria-label': 'Carte de la vallée' }, [
      icon('map', 'ic'),
    ]);
    onTap(this.root, () => this.open());

    const close = el('button', { class: 'sheet-close', 'aria-label': 'Fermer' }, [icon('close')]);
    onTap(close, () => this.close());

    this.overlay = el('div', { class: 'map-overlay' }, [
      el('div', { class: 'map-panel' }, [
        el('div', { class: 'map-head' }, [el('h2', { text: 'La vallée' }), close]),
        this.canvas,
        el('div', { class: 'map-legend' }, [
          legendItem('#f0e2c2', 'Foyers'),
          legendItem('#d9b45f', 'Dépôts'),
          legendItem('#e6d3a8', 'Ateliers'),
          legendItem('#c9a56b', 'Chantiers'),
          legendItem('#ff6a32', 'Incendie'),
        ]),
        el('div', { class: 'card-desc', text: 'Touchez la carte pour y emmener la caméra.' }),
      ]),
    ]);
    // Tapping the backdrop closes, the panel itself does not.
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });

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

  /** Is the map on screen? The renderer skips its work when it is not. */
  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    if (this.open_) return;
    this.open_ = true;
    document.body.append(this.overlay);
    // One frame late, so the transition has something to animate from.
    requestAnimationFrame(() => this.overlay.classList.add('shown'));
    this.update();
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.overlay.classList.remove('shown');
    setTimeout(() => this.overlay.remove(), 180);
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
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
    if (!this.open_) return;
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

function legendItem(color: string, label: string): HTMLElement {
  const dot = el('span', { class: 'dot' });
  dot.style.background = color;
  return el('span', { class: 'map-legend-item' }, [dot, el('span', { text: label })]);
}
