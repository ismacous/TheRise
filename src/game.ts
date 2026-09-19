import { BUILDINGS, type BuildingId, type NodeKind } from './data/buildings';
import { GameRenderer, QUALITY_PRESETS, type RenderQuality } from './render/renderer';
import { SoundEngine } from './render/audio';
import { HEIGHT_SCALE } from './render/constants';
import { createNewGame, type Simulation } from './sim/simulation';
import { deserialize, readSave, writeSave } from './sim/save';
import type { World } from './sim/world';
import type { WorldGenOptions } from './sim/worldgen';
import type { GameApi, QualityLevel, SheetId } from './ui/api';
import { UiShell } from './ui/shell';

const AUTOSAVE_INTERVAL = 120;

const RESOURCE_LABELS: Partial<Record<NodeKind, string>> = {
  tree: 'arbres',
  berry_bush: 'buissons',
  stone_rock: 'rochers',
  clay_patch: "bancs d'argile",
  coal_vein: 'filons',
  iron_vein: 'filons',
  gold_vein: 'filons',
  fish_shoal: 'bancs de poissons',
  wild_animal: 'bêtes',
};

function detectQuality(): QualityLevel {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem >= 6 && cores >= 6) return 'high';
  if (mem >= 3 && cores >= 4) return 'medium';
  return 'low';
}

/** Ties the simulation, the renderer and the UI together. */
export class Game implements GameApi {
  sim: Simulation;
  renderer: GameRenderer;
  ui: UiShell;

  speed = 1;
  private lastSpeed = 1;
  placementId: BuildingId | null = null;
  placementRotation = 0;
  painting = false;
  /**
   * Where the ghost currently sits, as a footprint origin. Tapping the map
   * only moves it; nothing is built until the player confirms. Placing on the
   * first tap made it far too easy to drop a building in the wrong spot.
   */
  placementTile: { x: number; y: number } | null = null;
  selectedBuildingId: number | null = null;
  selectedVillagerId: number | null = null;
  openSheetId: SheetId | null = null;
  quality: QualityLevel;
  showDebug = false;
  readonly sound = new SoundEngine();

  private canvas: HTMLCanvasElement;
  private genOptions: Partial<WorldGenOptions>;
  private running = false;
  private lastTime = 0;
  private fpsSamples: number[] = [];
  private autosaveTimer = AUTOSAVE_INTERVAL;
  private paintedThisDrag = new Set<number>();
  /** Live feedback for the placement banner: resources inside the radius. */
  placementInfo: { valid: boolean; reason: string; resources: number; label: string } | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, sim: Simulation, gen: Partial<WorldGenOptions>) {
    this.canvas = canvas;
    this.sim = sim;
    this.genOptions = gen;
    this.quality = detectQuality();
    this.renderer = new GameRenderer(canvas, sim.world, QUALITY_PRESETS[this.quality]);
    this.ui = new UiShell(uiRoot, this);
    this.wireMinimap();
    this.wireInput();
    this.wireLifecycle();
    this.wireSound();
  }

  /**
   * Browsers will not start an AudioContext until the player has touched the
   * screen, so the engine stays dormant until the first real gesture.
   */
  private wireSound(): void {
    const unlock = (): void => this.sound.unlock();
    for (const type of ['pointerdown', 'keydown'] as const) {
      window.addEventListener(type, unlock, { passive: true });
    }
    this.wireSoundEvents();
  }

  private wireSoundEvents(): void {
    const w = this.world;
    w.emitter.on('buildingCompleted', () => this.sound.play('built', 0.35));
    w.emitter.on('researchCompleted', () => this.sound.play('good', 0.4));
    w.emitter.on('tierUp', () => this.sound.play('bell', 0.55));
    w.emitter.on('eventStarted', (e) => {
      if (e.kind === 'fire') this.sound.play('alarm', 0.5);
      else if (e.tone === 'good') this.sound.play('good', 0.35);
      else if (e.tone === 'bad') this.sound.play('bad', 0.35);
    });
  }

  get world(): World {
    return this.sim.world;
  }

  private wireMinimap(): void {
    const controls = this.renderer.controls;
    this.ui.minimap.cameraTarget = () => ({ x: controls.target.x, y: controls.target.z });
    this.ui.minimap.cameraSpan = () => controls.distance * 1.1;
  }

  // ── Input ───────────────────────────────────────────────────────────────
  private wireInput(): void {
    const controls = this.renderer.controls;
    controls.onTap = (x, y) => this.handleTap(x, y);
    controls.onPaintMove = (x, y) => this.handlePaint(x, y);

    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 220));
    window.addEventListener('keydown', (e) => this.handleKey(e));
    this.canvas.addEventListener('pointerup', () => this.paintedThisDrag.clear());
  }

  private handleKey(e: KeyboardEvent): void {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.togglePause();
        break;
      case '1':
        this.setSpeed(1);
        break;
      case '2':
        this.setSpeed(2);
        break;
      case '3':
        this.setSpeed(4);
        break;
      case 'r':
        this.rotatePlacement();
        break;
      case 'Escape':
        if (this.placementId) this.cancelPlacement();
        else this.closeSheet();
        break;
      case 'b':
        this.openSheet('build');
        break;
      case 'F3':
        e.preventDefault();
        this.showDebug = !this.showDebug;
        break;
    }
  }

  private handleTap(clientX: number, clientY: number): void {
    const hit = this.renderer.pickGround(clientX, clientY);
    if (!hit) return;
    const tx = Math.floor(hit.x);
    const ty = Math.floor(hit.z);

    if (this.placementId) {
      // Aim only. The building goes down when the player presses Valider.
      this.aimPlacement(tx, ty);
      return;
    }

    // Villagers first: they are small and the player is aiming at them.
    const villager = this.world.villagers.find(
      (v) => (v.x - hit.x) ** 2 + (v.y - hit.z) ** 2 < 0.55,
    );
    if (villager) {
      this.selectVillager(villager.id);
      return;
    }

    const building = this.world.buildingAt(tx, ty);
    if (building) {
      this.selectBuilding(building.id);
    } else {
      this.selectBuilding(null);
      this.selectVillager(null);
      if (this.openSheetId === 'building') this.closeSheet();
    }
  }

  private handlePaint(clientX: number, clientY: number): void {
    if (!this.placementId) return;
    const def = BUILDINGS[this.placementId];
    if (def.placement.kind !== 'paint') return;
    const hit = this.renderer.pickGround(clientX, clientY);
    if (!hit) return;
    const tx = Math.floor(hit.x);
    const ty = Math.floor(hit.z);
    const key = ty * this.world.map.width + tx;
    if (this.paintedThisDrag.has(key)) return;
    this.paintedThisDrag.add(key);
    this.world.place(this.placementId, tx, ty);
  }

  /** Moves the ghost to the tapped tile without building anything. */
  private aimPlacement(tx: number, ty: number): void {
    const id = this.placementId!;
    const [w, h] = this.world.footprint(id, this.placementRotation);
    this.placementTile = {
      x: tx - Math.floor((w - 1) / 2),
      y: ty - Math.floor((h - 1) / 2),
    };
  }

  /** Builds at the ghost's current position, if the spot is valid. */
  confirmPlacement(): boolean {
    const id = this.placementId;
    const tile = this.placementTile;
    if (!id || !tile) return false;
    const def = BUILDINGS[id];
    const check = this.world.canPlace(id, tile.x, tile.y, this.placementRotation);
    if (!check.ok) {
      this.world.notify(check.reason, '', 'bad');
      return false;
    }
    if (this.world.treasury < def.goldCost) {
      this.world.notify("Pas assez d'or", '', 'bad');
      return false;
    }
    const b = this.world.place(id, tile.x, tile.y, this.placementRotation);
    if (!b) return false;
    this.cancelPlacement();
    this.selectBuilding(b.id);
    return true;
  }

  // ── GameApi ─────────────────────────────────────────────────────────────
  setSpeed(speed: number): void {
    if (speed > 0) this.lastSpeed = speed;
    this.speed = speed;
    this.sim.speed = speed;
  }

  togglePause(): void {
    this.setSpeed(this.speed === 0 ? this.lastSpeed : 0);
  }

  beginPlacement(id: BuildingId): void {
    this.placementId = id;
    this.placementRotation = 0;
    this.painting = BUILDINGS[id].placement.kind === 'paint';
    this.renderer.controls.paintMode = this.painting;
    this.paintedThisDrag.clear();
    // Start the ghost under the middle of the view so it is immediately visible.
    this.placementTile = null;
    this.aimAtScreenCentre();
    this.requestUiRefresh();
  }

  private aimAtScreenCentre(): void {
    if (!this.placementId) return;
    const rect = this.canvas.getBoundingClientRect();
    const hit = this.renderer.controls.screenToGround(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    if (hit) this.aimPlacement(Math.floor(hit.x), Math.floor(hit.z));
  }

  rotatePlacement(): void {
    if (!this.placementId) return;
    this.placementRotation = (this.placementRotation + 1) % 4;
    // Keep the footprint centred on the same spot after a quarter turn.
    if (this.placementTile) {
      const centre = this.placementCentre();
      const [w, h] = this.world.footprint(this.placementId, this.placementRotation);
      this.placementTile = {
        x: Math.round(centre.x - w / 2),
        y: Math.round(centre.y - h / 2),
      };
    }
    this.requestUiRefresh();
  }

  private placementCentre(): { x: number; y: number } {
    const tile = this.placementTile!;
    const [w, h] = this.world.footprint(this.placementId!, (this.placementRotation + 3) % 4);
    return { x: tile.x + w / 2, y: tile.y + h / 2 };
  }

  cancelPlacement(): void {
    this.placementId = null;
    this.placementInfo = null;
    this.placementTile = null;
    this.painting = false;
    this.renderer.controls.paintMode = false;
    this.renderer.ghost.hide();
    this.requestUiRefresh();
  }

  selectBuilding(id: number | null): void {
    this.selectedBuildingId = id;
    if (id !== null) {
      this.selectedVillagerId = null;
      this.openSheet('building');
    }
    this.requestUiRefresh();
  }

  selectVillager(id: number | null): void {
    this.selectedVillagerId = id;
    if (id !== null) {
      this.selectedBuildingId = null;
      this.openSheet('villager');
    }
    this.requestUiRefresh();
  }

  focusOn(x: number, y: number, distance?: number): void {
    this.renderer.controls.focusOn(x, y, distance);
  }

  openSheet(id: SheetId): void {
    this.openSheetId = id;
    this.ui.openSheet(id);
  }

  closeSheet(): void {
    this.openSheetId = null;
    this.ui.closeSheet();
  }

  requestUiRefresh(): void {
    this.ui.markSheetDirty();
  }

  async save(): Promise<void> {
    try {
      await writeSave(this.sim, this.genOptions);
      this.world.notify('Partie sauvegardée', 'save', 'good');
    } catch (err) {
      console.error(err);
      this.world.notify('Échec de la sauvegarde', 'warn', 'bad');
    }
  }

  async load(): Promise<boolean> {
    const data = await readSave();
    if (!data) {
      this.world.notify('Aucune sauvegarde trouvée', 'save', 'bad');
      return false;
    }
    try {
      const sim = deserialize(data);
      this.replaceSimulation(sim, data.gen);
      this.world.notify('Partie chargée', 'save', 'good');
      return true;
    } catch (err) {
      console.error(err);
      this.world.notify('Sauvegarde illisible', 'warn', 'bad');
      return false;
    }
  }

  async hasSave(): Promise<boolean> {
    return (await readSave()) !== null;
  }

  restart(seed?: string): void {
    const gen = { ...this.genOptions, seed: seed ?? `vallee-${Math.floor(Math.random() * 1e9)}` };
    const sim = createNewGame(gen);
    this.replaceSimulation(sim, gen);
  }

  private replaceSimulation(sim: Simulation, gen: Partial<WorldGenOptions>): void {
    const uiRoot = document.getElementById('ui-root')!;
    this.renderer.dispose();
    this.sim = sim;
    this.genOptions = gen;
    this.sim.speed = this.speed;
    this.selectedBuildingId = null;
    this.selectedVillagerId = null;
    this.cancelPlacement();
    this.renderer = new GameRenderer(this.canvas, sim.world, QUALITY_PRESETS[this.quality]);
    this.ui = new UiShell(uiRoot, this);
    this.wireMinimap();
    this.wireInput();
    this.wireSoundEvents();
    this.closeSheet();
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    const preset: RenderQuality = QUALITY_PRESETS[q];
    this.renderer.setQuality(preset);
  }

  // ── Loop ────────────────────────────────────────────────────────────────
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
  }

  private tick(dt: number): void {
    const terrainChanged = this.world.terrainChanges.length > 0;
    this.sim.update(dt);
    if (terrainChanged || this.world.terrainChanges.length > 0) {
      this.ui.minimap.markTerrainDirty();
    }
    this.renderer.update(dt, this.sim.alpha);
    const controls = this.renderer.controls;
    this.sound.update(this.world, dt, controls.target.x, controls.target.z, controls.distance * 0.8);
    this.updateSelectionMarkers();
    this.updateGhost();
    this.renderer.render();

    this.fpsSamples.push(1 / Math.max(0.0001, dt));
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();
    const fps = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.ui.update(dt, this.renderer.frameMs, fps);

    if (this.speed > 0) {
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = AUTOSAVE_INTERVAL;
        void writeSave(this.sim, this.genOptions).catch(() => undefined);
      }
    }
  }

  private updateSelectionMarkers(): void {
    const markers = this.renderer.markers;
    markers.hide();
    if (this.selectedBuildingId !== null) {
      const b = this.world.buildings.get(this.selectedBuildingId);
      if (b) {
        const y = this.world.map.footprintElevation(b.x, b.y, b.w, b.h) * HEIGHT_SCALE;
        markers.showSelection(b.cx, y, b.cy, Math.max(b.w, b.h) * 0.75);
        const service = BUILDINGS[b.def].service;
        const gather = BUILDINGS[b.def].gather;
        const radius = service && service.radius > 0 ? service.radius : gather?.radius;
        if (radius) markers.showRadius(b.cx, y, b.cy, radius);
      } else {
        this.selectedBuildingId = null;
      }
    } else if (this.selectedVillagerId !== null) {
      const v = this.world.villagerById.get(this.selectedVillagerId);
      if (v) {
        markers.showSelection(v.x, this.renderer.groundHeight(v.x, v.y), v.y, 0.5);
      } else {
        this.selectedVillagerId = null;
      }
    }
  }

  private updateGhost(): void {
    if (!this.placementId) return;
    if (!this.placementTile) this.aimAtScreenCentre();
    if (!this.placementTile) {
      this.renderer.ghost.hide();
      return;
    }
    const id = this.placementId;
    const [w, h] = this.world.footprint(id, this.placementRotation);
    const { x, y } = this.placementTile;
    const check = this.world.canPlace(id, x, y, this.placementRotation);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const groundY = this.world.map.footprintElevation(x, y, w, h) * HEIGHT_SCALE;
    this.renderer.ghost.show(id, cx, groundY, cy, this.placementRotation, check.ok);

    // Show the working radius while placing, and count what falls inside it:
    // siting a camp well is the single most impactful decision in the game.
    const def = BUILDINGS[id];
    const radius = def.gather?.radius ?? (def.service && def.service.radius > 0 ? def.service.radius : 0);
    if (radius > 0) this.renderer.markers.showRadius(cx, groundY, cy, radius);

    let resources = 0;
    let label = '';
    if (def.gather) {
      const kinds = def.gather.nodes;
      this.world.nodeGrid.query(cx, cy, radius, (n) => {
        if (!n.alive || !kinds.includes(n.kind)) return;
        if ((n.x - cx) ** 2 + (n.y - cy) ** 2 > radius * radius) return;
        resources++;
      });
      label = RESOURCE_LABELS[kinds[0]] ?? 'ressources';
    } else if (def.category === 'farming') {
      resources = Math.round(this.world.averageFertility(x, y, w, h) * 100);
      label = 'de fertilité';
    }
    this.placementInfo = { valid: check.ok, reason: check.reason, resources, label };
  }

  private wireLifecycle(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        void writeSave(this.sim, this.genOptions).catch(() => undefined);
      }
    });
    window.addEventListener('pagehide', () => {
      void writeSave(this.sim, this.genOptions).catch(() => undefined);
    });
  }
}
