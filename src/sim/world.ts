import { Emitter } from '../core/emitter';
import { Rng } from '../core/rng';
import { clamp, clamp01 } from '../core/util';
import { BUILDINGS, type BuildingId, type NodeKind } from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import { generateWorld, type WorldGenOptions } from './worldgen';
import { PathFinder } from './pathfinding';
import { SpatialGrid } from './spatial';
import { computeModifiers, type Modifiers } from './modifiers';
import { createPartnerRuntime, type PartnerRuntime } from './economy';
import { TRADE_PARTNERS } from '../data/trade';
import { TileMap } from './tilemap';
import {
  SEASONS,
  TERRAIN,
  type ActiveEvent,
  type Building,
  type GameTime,
  type HaulJob,
  type Notification,
  type ResearchState,
  type ResourceNode,
  type TradeContract,
  type Villager,
  type VillageStats,
  type WeatherKind,
} from './types';

export const DAY_SECONDS = 120;
export const DAYS_PER_SEASON = 6;

export interface WorldEvents {
  notify: Notification;
  buildingPlaced: Building;
  buildingCompleted: Building;
  buildingDestroyed: Building;
  researchCompleted: { id: string };
  villagerBorn: Villager;
  villagerDied: { villager: Villager; cause: string };
  eventStarted: ActiveEvent;
  eventEnded: ActiveEvent;
  tierUp: { tier: number };
}

export interface PlacementCheck {
  ok: boolean;
  reason: string;
}

export class World {
  readonly rng: Rng;
  readonly map: TileMap;
  readonly pathfinder: PathFinder;
  readonly emitter = new Emitter<WorldEvents>();

  nodes = new Map<number, ResourceNode>();
  nodeGrid: SpatialGrid<ResourceNode>;
  animals: ResourceNode[] = [];

  buildings = new Map<number, Building>();
  buildingList: Building[] = [];

  villagers: Villager[] = [];
  villagerById = new Map<number, Villager>();

  haulJobs: HaulJob[] = [];
  /** Refreshed with the haul board; saves scanning every building per villager. */
  constructionSites: Building[] = [];

  time: GameTime = { elapsed: 0, day: 1, dayFraction: 0.35, season: 'spring', year: 1 };
  weather: WeatherKind = 'clear';
  weatherTimer = 90;
  /** 0..1 rain intensity, drives visuals and the growth bonus. */
  wetness = 0;

  research: ResearchState = {
    points: 0,
    completed: new Set(),
    active: null,
    progress: 0,
    queue: [],
  };
  modifiers: Modifiers = computeModifiers([]);

  treasury = 120;
  contracts: TradeContract[] = [];
  activeEvents: ActiveEvent[] = [];
  notifications: Notification[] = [];
  eventCooldown = 200;
  /** Ids of guided objectives the player has already ticked off. */
  completedObjectives = new Set<string>();

  /** Runtime state of every trade partner (stock, demand, relationship). */
  partners = new Map<string, PartnerRuntime>();
  /** Rolling income buckets, reset every in-game minute for the HUD. */
  tradeIncomeWindow = 0;
  taxIncomeWindow = 0;
  /** Comfort goods consumed by households, decays over time into happiness. */
  comfortPool = 0;
  /** Extra food consumption multiplier from active events. */
  foodUpkeepEvent = 1;
  /** Number of distinct foods in stock; drives the diet happiness bonus. */
  foodVariety = 1;
  /** Ticks elapsed, used to stagger expensive per-villager work. */
  tickCount = 0;

  /**
   * Coarse service coverage fields, rebuilt once a second. Evaluating every
   * building for every villager every tick was the single largest cost in the
   * simulation once a village passed a couple of hundred souls.
   */
  private serviceCell = 4;
  private serviceW = 0;
  private serviceH = 0;
  private happinessField = new Float32Array(0);
  private fireField = new Float32Array(0);
  /** Bumped whenever the layout changes, invalidating cached entrances. */
  layoutVersion = 1;
  private cachedGlobalStores: Building[] = [];
  private cachedStoresVersion = -1;

  /**
   * Change queues drained by the renderer each frame. Keeping them here means
   * the simulation never has to know a renderer exists.
   */
  nodeChanges: Array<{ x: number; y: number }> = [];
  terrainChanges: Array<{ x: number; y: number; w: number; h: number }> = [];

  /** Cached totals across every global storehouse, refreshed each tick. */
  stock: Partial<Record<GoodId, number>> = {};
  stockCapacity = 0;
  stockUsed = 0;

  stats: VillageStats = {
    population: 0,
    adults: 0,
    children: 0,
    employed: 0,
    idle: 0,
    housingCapacity: 0,
    foodStock: 0,
    foodDays: 0,
    happiness: 60,
    health: 100,
    gold: 0,
    goldPerMinute: 0,
    researchRate: 0,
    tier: 1,
  };

  startX = 0;
  startY = 0;

  private nextBuildingId = 1;
  private nextVillagerId = 1;
  private nextJobId = 1;
  private nextEventId = 1;
  private nextNotificationId = 1;

  constructor(genOpts: Partial<WorldGenOptions> = {}) {
    const gen = generateWorld(genOpts);
    this.map = gen.map;
    this.rng = new Rng(typeof genOpts.seed === 'undefined' ? 'the-rise' : genOpts.seed);
    this.pathfinder = new PathFinder(this.map);
    this.startX = gen.startX;
    this.startY = gen.startY;

    this.nodeGrid = new SpatialGrid<ResourceNode>(this.map.width, this.map.height, 8);

    for (const n of gen.nodes) {
      this.nodes.set(n.id, n);
      if (n.kind === 'wild_animal') this.animals.push(n);
    }
    this.rebuildNodeGrid();

    for (const p of TRADE_PARTNERS) this.partners.set(p.id, createPartnerRuntime(p));

    this.serviceW = Math.ceil(this.map.width / this.serviceCell) + 1;
    this.serviceH = Math.ceil(this.map.height / this.serviceCell) + 1;
    this.happinessField = new Float32Array(this.serviceW * this.serviceH);
    this.fireField = new Float32Array(this.serviceW * this.serviceH);
  }

  // ── ids ──────────────────────────────────────────────────────────────────
  allocBuildingId(): number {
    return this.nextBuildingId++;
  }
  allocVillagerId(): number {
    return this.nextVillagerId++;
  }
  allocJobId(): number {
    return this.nextJobId++;
  }
  allocEventId(): number {
    return this.nextEventId++;
  }

  rebuildNodeGrid(): void {
    this.nodeGrid.rebuild(
      (function* (map: Map<number, ResourceNode>) {
        for (const n of map.values()) if (n.alive) yield n;
      })(this.nodes),
    );
  }

  // ── notifications ────────────────────────────────────────────────────────
  notify(text: string, icon = 'ℹ️', tone: Notification['tone'] = 'neutral', fx?: number, fy?: number): void {
    const n: Notification = {
      id: this.nextNotificationId++,
      text,
      icon,
      tone,
      time: this.time.elapsed,
      fx,
      fy,
    };
    this.notifications.push(n);
    if (this.notifications.length > 60) this.notifications.shift();
    this.emitter.emit('notify', n);
  }

  // ── placement ────────────────────────────────────────────────────────────
  /** Footprint of a building def, honouring 90° rotations. */
  footprint(defId: BuildingId, rotation: number): [number, number] {
    const [w, h] = BUILDINGS[defId].size;
    return rotation % 2 === 1 ? [h, w] : [w, h];
  }

  canPlace(defId: BuildingId, x: number, y: number, rotation = 0): PlacementCheck {
    const def = BUILDINGS[defId];
    const [w, h] = this.footprint(defId, rotation);

    if (def.requires && !this.research.completed.has(def.requires)) {
      return { ok: false, reason: 'Recherche manquante' };
    }
    if (def.placement.kind === 'paint') {
      if (!this.map.inBounds(x, y)) return { ok: false, reason: 'Hors carte' };
      const i = this.map.idx(x, y);
      if (this.map.terrain[i] === TERRAIN.WATER) return { ok: false, reason: "Sur l'eau" };
      if (this.map.occupancy[i] !== -1) return { ok: false, reason: 'Occupé' };
      return { ok: true, reason: '' };
    }
    if (!this.map.canPlace(x, y, w, h, def.category === 'farming' ? 1.6 : 1.15)) {
      return { ok: false, reason: 'Terrain occupé ou trop pentu' };
    }
    if (def.placement.kind === 'shore' && !this.map.touchesWater(x, y, w, h)) {
      return { ok: false, reason: "Doit toucher l'eau" };
    }
    if (def.placement.kind === 'deposit') {
      if (!this.footprintHasNode(x, y, w, h, def.placement.node)) {
        return { ok: false, reason: 'Doit couvrir un gisement' };
      }
    }
    if (def.category === 'farming' && this.averageFertility(x, y, w, h) < 0.25) {
      return { ok: false, reason: 'Terre trop pauvre' };
    }
    return { ok: true, reason: '' };
  }

  footprintHasNode(x: number, y: number, w: number, h: number, kind: NodeKind): boolean {
    let found = false;
    this.nodeGrid.query(x + w / 2, y + h / 2, Math.max(w, h) + 2, (n) => {
      if (found || !n.alive || n.kind !== kind) return;
      if (n.x >= x - 0.5 && n.x < x + w && n.y >= y - 0.5 && n.y < y + h) found = true;
    });
    return found;
  }

  averageFertility(x: number, y: number, w: number, h: number): number {
    let sum = 0;
    let n = 0;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (!this.map.inBounds(i, j)) continue;
        sum += this.map.fertility[this.map.idx(i, j)];
        n++;
      }
    }
    return n === 0 ? 0 : sum / n / 255;
  }

  /** Costs are consumed up-front for gold, and hauled in for materials. */
  place(defId: BuildingId, x: number, y: number, rotation = 0, instant = false): Building | null {
    const check = this.canPlace(defId, x, y, rotation);
    if (!check.ok) return null;
    const def = BUILDINGS[defId];
    if (this.treasury < def.goldCost) return null;
    this.treasury -= def.goldCost;

    const [w, h] = this.footprint(defId, rotation);

    if (def.placement.kind === 'paint') {
      const i = this.map.idx(x, y);
      this.map.road[i] = def.id === 'cobbled_road' ? 2 : 1;
      if (def.id === 'cobbled_road') this.takeFromStock('stone', 1);
      this.terrainChanges.push({ x, y, w: 1, h: 1 });
      this.layoutVersion++;
      return null;
    }

    // Clear trees and bushes under the footprint; the logs are a nice refund.
    let salvage = 0;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const k = this.map.idx(i, j);
        const blockerId = this.map.blocker[k];
        if (blockerId !== -1) {
          const node = this.nodes.get(blockerId);
          if (node && node.kind === 'tree') salvage += 1;
          if (node && node.kind !== 'stone_rock') this.killNode(blockerId);
        }
      }
    }
    if (salvage > 0) this.addToStock('logs', salvage);

    this.map.flatten(x, y, w, h);
    this.terrainChanges.push({ x, y, w, h });
    const b: Building = {
      id: this.allocBuildingId(),
      def: defId,
      x,
      y,
      w,
      h,
      cx: x + w / 2,
      cy: y + h / 2,
      rotation,
      state: instant || def.buildWork <= 0 ? 'active' : 'planned',
      buildProgress: 0,
      delivered: {},
      inv: {},
      workers: [],
      residents: [],
      work: 0,
      recipeIndex: 0,
      efficiency: 0,
      idleTime: 0,
      fire: 0,
      active: true,
      enabled: true,
      herd: def.livestock ? Math.ceil(def.livestock.capacity / 3) : 0,
      stall: null,
    };
    if (instant) {
      for (const [g, amt] of Object.entries(def.cost)) b.delivered[g as GoodId] = amt as number;
      b.buildProgress = def.buildWork;
    }
    this.map.setOccupancy(x, y, w, h, b.id);
    this.buildings.set(b.id, b);
    this.buildingList.push(b);
    this.layoutVersion++;
    this.emitter.emit('buildingPlaced', b);
    if (b.state === 'active') this.emitter.emit('buildingCompleted', b);
    return b;
  }

  removeBuilding(id: number, refund = true): void {
    const b = this.buildings.get(id);
    if (!b) return;
    const def = BUILDINGS[b.def];
    for (const vid of [...b.workers]) {
      const v = this.villagerById.get(vid);
      if (v) {
        v.workId = 0;
        v.profession = 'idle';
        v.task = { kind: 'none' };
      }
    }
    for (const vid of [...b.residents]) {
      const v = this.villagerById.get(vid);
      if (v) v.homeId = 0;
    }
    if (refund) {
      for (const [g, amt] of Object.entries(b.delivered)) {
        this.addToStock(g as GoodId, Math.floor((amt as number) * 0.5));
      }
      for (const [g, amt] of Object.entries(b.inv)) {
        this.addToStock(g as GoodId, amt as number);
      }
      this.treasury += Math.floor(def.goldCost * 0.4);
    }
    this.map.setOccupancy(b.x, b.y, b.w, b.h, -1);
    this.terrainChanges.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    this.buildings.delete(id);
    const i = this.buildingList.indexOf(b);
    if (i !== -1) this.buildingList.splice(i, 1);
    this.haulJobs = this.haulJobs.filter((j) => j.fromId !== id && j.toId !== id);
    this.layoutVersion++;
    this.emitter.emit('buildingDestroyed', b);
  }

  /** Can this building be replaced by its next tier right now? */
  canUpgrade(b: Building): PlacementCheck {
    const def = BUILDINGS[b.def];
    const nextId = def.upgradesTo;
    if (!nextId) return { ok: false, reason: 'Amélioration maximale' };
    const next = BUILDINGS[nextId];
    if (next.requires && !this.research.completed.has(next.requires)) {
      return { ok: false, reason: 'Recherche manquante' };
    }
    if (b.state !== 'active') return { ok: false, reason: 'Bâtiment non actif' };
    if (this.treasury < next.goldCost) return { ok: false, reason: "Pas assez d'or" };
    for (const [g, amt] of Object.entries(next.cost)) {
      if (this.stockOf(g as GoodId) < (amt as number)) {
        return { ok: false, reason: `Manque ${GOODS[g as GoodId].name}` };
      }
    }
    const [nw, nh] = this.footprint(nextId, b.rotation);
    const nx = b.x - Math.floor((nw - b.w) / 2);
    const ny = b.y - Math.floor((nh - b.h) / 2);
    // Free our own tiles so the footprint test only sees genuine obstacles.
    this.map.setOccupancy(b.x, b.y, b.w, b.h, -1);
    const check = this.canPlace(nextId, nx, ny, b.rotation);
    this.map.setOccupancy(b.x, b.y, b.w, b.h, b.id);
    if (!check.ok) return { ok: false, reason: `Pas assez de place (${check.reason.toLowerCase()})` };
    return { ok: true, reason: '' };
  }

  /**
   * Replaces a building by its next tier, carrying over staff, residents and
   * stock. Materials are consumed immediately: an upgrade is instant, which
   * keeps the loop satisfying rather than fiddly.
   */
  upgrade(id: number): Building | null {
    const b = this.buildings.get(id);
    if (!b) return null;
    const check = this.canUpgrade(b);
    if (!check.ok) return null;
    const nextId = BUILDINGS[b.def].upgradesTo!;
    const next = BUILDINGS[nextId];
    for (const [g, amt] of Object.entries(next.cost)) this.takeFromStock(g as GoodId, amt as number);

    const [nw, nh] = this.footprint(nextId, b.rotation);
    const nx = b.x - Math.floor((nw - b.w) / 2);
    const ny = b.y - Math.floor((nh - b.h) / 2);
    const workers = [...b.workers];
    const residents = [...b.residents];
    const inv = { ...b.inv };
    const rotation = b.rotation;

    this.removeBuilding(id, false);
    const created = this.place(nextId, nx, ny, rotation, true);
    if (!created) {
      // Should not happen after canUpgrade, but never silently lose a building.
      const restored = this.place(b.def, b.x, b.y, rotation, true);
      if (restored) restored.inv = inv;
      return null;
    }
    created.inv = inv;
    for (const vid of workers) {
      const v = this.villagerById.get(vid);
      if (!v || created.workers.length >= next.workers) break;
      created.workers.push(vid);
      v.workId = created.id;
      v.profession = next.profession;
      v.task = { kind: 'none' };
    }
    for (const vid of residents) {
      const v = this.villagerById.get(vid);
      if (!v || !next.housing || created.residents.length >= next.housing.capacity) break;
      created.residents.push(vid);
      v.homeId = created.id;
    }
    this.notify(`${next.name} : amélioration terminée`, '⬆️', 'good', created.cx, created.cy);
    return created;
  }

  killNode(id: number): void {
    const n = this.nodes.get(id);
    if (!n) return;
    this.nodeChanges.push({ x: n.x, y: n.y });
    n.alive = false;
    const k = this.map.idx(Math.floor(n.x), Math.floor(n.y));
    if (this.map.inBounds(Math.floor(n.x), Math.floor(n.y)) && this.map.blocker[k] === id) {
      this.map.blocker[k] = -1;
    }
    this.nodes.delete(id);
    // Drop it from the spatial index too, or searches keep tripping over
    // felled trees and workers report "nothing in range" beside a full forest.
    this.nodeGrid.remove(n);
  }

  addNode(node: ResourceNode): void {
    this.nodes.set(node.id, node);
    this.nodeChanges.push({ x: node.x, y: node.y });
    if (node.kind === 'tree' || node.kind === 'stone_rock') {
      const x = Math.floor(node.x);
      const y = Math.floor(node.y);
      if (this.map.inBounds(x, y)) this.map.blocker[this.map.idx(x, y)] = node.id;
    }
    this.nodeGrid.insert(node);
  }

  // ── storage ──────────────────────────────────────────────────────────────
  globalStores(): Building[] {
    if (this.cachedStoresVersion === this.layoutVersion) return this.cachedGlobalStores;
    const out: Building[] = [];
    for (const b of this.buildingList) {
      const def = BUILDINGS[b.def];
      if (def.storage?.global && b.state === 'active') out.push(b);
    }
    this.cachedGlobalStores = out;
    this.cachedStoresVersion = this.layoutVersion;
    return out;
  }

  capacityOf(b: Building): number {
    const def = BUILDINGS[b.def];
    if (!def.storage) return 0;
    return Math.floor(def.storage.capacity * (def.storage.global ? this.modifiers.storage : 1));
  }

  usedOf(b: Building): number {
    let sum = 0;
    for (const v of Object.values(b.inv)) sum += v as number;
    return sum;
  }

  accepts(b: Building, good: GoodId): boolean {
    const def = BUILDINGS[b.def];
    if (!def.storage) return false;
    if (def.storage.accepts && !def.storage.accepts.includes(good)) return false;
    return true;
  }

  /** Total of a good across every global storehouse. */
  stockOf(good: GoodId): number {
    return this.stock[good] ?? 0;
  }

  refreshStockCache(): void {
    const s: Partial<Record<GoodId, number>> = {};
    let cap = 0;
    let used = 0;
    for (const b of this.buildingList) {
      const def = BUILDINGS[b.def];
      if (!def.storage?.global || b.state !== 'active') continue;
      cap += this.capacityOf(b);
      for (const [g, amt] of Object.entries(b.inv)) {
        s[g as GoodId] = (s[g as GoodId] ?? 0) + (amt as number);
        used += amt as number;
      }
    }
    this.stock = s;
    this.stockCapacity = cap;
    this.stockUsed = used;
  }

  /** Deposits into global storage, respecting per-store capacity. Returns leftovers. */
  addToStock(good: GoodId, amount: number, nearX?: number, nearY?: number): number {
    let left = Math.floor(amount);
    if (left <= 0) return 0;
    const stores = this.globalStores().filter((b) => this.accepts(b, good));
    if (nearX !== undefined && nearY !== undefined) {
      stores.sort(
        (a, b) =>
          (a.cx - nearX) ** 2 + (a.cy - nearY) ** 2 - ((b.cx - nearX) ** 2 + (b.cy - nearY) ** 2),
      );
    }
    for (const b of stores) {
      const free = this.capacityOf(b) - this.usedOf(b);
      if (free <= 0) continue;
      const put = Math.min(free, left);
      b.inv[good] = (b.inv[good] ?? 0) + put;
      left -= put;
      this.stock[good] = (this.stock[good] ?? 0) + put;
      if (left <= 0) break;
    }
    return left;
  }

  /** Removes from global storage. Returns how much was actually taken. */
  takeFromStock(good: GoodId, amount: number, nearX?: number, nearY?: number): number {
    let need = Math.floor(amount);
    if (need <= 0) return 0;
    const stores = this.globalStores().filter((b) => (b.inv[good] ?? 0) > 0);
    if (nearX !== undefined && nearY !== undefined) {
      stores.sort(
        (a, b) =>
          (a.cx - nearX) ** 2 + (a.cy - nearY) ** 2 - ((b.cx - nearX) ** 2 + (b.cy - nearY) ** 2),
      );
    }
    let taken = 0;
    for (const b of stores) {
      const have = b.inv[good] ?? 0;
      const t = Math.min(have, need);
      if (t <= 0) continue;
      b.inv[good] = have - t;
      if (b.inv[good]! <= 0) delete b.inv[good];
      taken += t;
      need -= t;
      this.stock[good] = Math.max(0, (this.stock[good] ?? 0) - t);
      if (need <= 0) break;
    }
    return taken;
  }

  /** Nearest global store actually holding `good`. */
  findStoreWith(good: GoodId, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildingList) {
      const def = BUILDINGS[b.def];
      if (!def.storage?.global || b.state !== 'active') continue;
      if ((b.inv[good] ?? 0) <= 0) continue;
      const d = (b.cx - x) ** 2 + (b.cy - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Nearest global store with free space for `good`. */
  findStoreForDeposit(good: GoodId, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildingList) {
      const def = BUILDINGS[b.def];
      if (!def.storage?.global || b.state !== 'active') continue;
      if (!this.accepts(b, good)) continue;
      if (this.capacityOf(b) - this.usedOf(b) <= 0) continue;
      const d = (b.cx - x) ** 2 + (b.cy - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /**
   * Nutrition held anywhere villagers can reach it. Markets deliberately pull
   * food out of the storehouses, so counting global stock alone would report a
   * famine every time a market filled its stalls.
   */
  totalFood(): number {
    let n = 0;
    for (const b of this.buildingList) {
      if (b.state !== 'active') continue;
      const def = BUILDINGS[b.def];
      const reachable = def.storage?.global || def.service?.kind === 'market';
      if (!reachable) continue;
      for (const [g, amount] of Object.entries(b.inv)) {
        const nutrition = GOODS[g as GoodId].nutrition;
        if (nutrition > 0) n += (amount as number) * nutrition;
      }
    }
    return n;
  }

  // ── misc helpers ─────────────────────────────────────────────────────────
  buildingAt(x: number, y: number): Building | null {
    if (!this.map.inBounds(x, y)) return null;
    const id = this.map.occupancy[this.map.idx(x, y)];
    return id === -1 ? null : (this.buildings.get(id) ?? null);
  }

  /** Free walkable tile adjacent to a building, used as its "door". */
  entranceOf(b: Building): { x: number; y: number } {
    if (b.entrance && b.entranceVersion === this.layoutVersion) return b.entrance;
    const found = this.computeEntrance(b);
    b.entrance = found;
    b.entranceVersion = this.layoutVersion;
    return found;
  }

  private computeEntrance(b: Building): { x: number; y: number } {
    const candidates: Array<[number, number]> = [];
    for (let i = b.x - 1; i <= b.x + b.w; i++) {
      candidates.push([i, b.y - 1], [i, b.y + b.h]);
    }
    for (let j = b.y - 1; j <= b.y + b.h; j++) {
      candidates.push([b.x - 1, j], [b.x + b.w, j]);
    }
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (const [x, y] of candidates) {
      if (!this.map.walkable(x, y)) continue;
      // Prefer roads, then tiles closest to the village centre of mass.
      const score = this.map.road[this.map.idx(x, y)] * 4 - Math.abs(x - b.cx) - Math.abs(y - b.cy);
      if (score > bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
    if (best) return { x: best[0] + 0.5, y: best[1] + 0.5 };
    return { x: b.cx, y: b.cy };
  }

  seasonIndex(): number {
    return SEASONS.indexOf(this.time.season);
  }

  /** Growth multiplier for crops and trees, driven by season and rain. */
  growthFactor(): number {
    const base =
      this.time.season === 'summer'
        ? 1.15
        : this.time.season === 'spring'
          ? 1.0
          : this.time.season === 'autumn'
            ? 0.85
            : 0.25;
    const rain = this.weather === 'rain' ? 1.25 : this.weather === 'storm' ? 1.1 : 1;
    return clamp(base * rain, 0.1, 2);
  }

  /** Daylight 0..1 used by the renderer and by work efficiency at night. */
  daylight(): number {
    const f = this.time.dayFraction;
    // Sunrise ~0.22, sunset ~0.85.
    return clamp01(Math.sin((f - 0.16) * Math.PI / 0.74) * 1.15);
  }

  /**
   * Splats every service building into the coarse coverage fields. Called once
   * a second by the simulation rather than per villager.
   */
  rebuildServiceFields(): void {
    this.happinessField.fill(0);
    this.fireField.fill(0);
    const cell = this.serviceCell;
    for (const b of this.buildingList) {
      if (b.state !== 'active' || !b.enabled) continue;
      const def = BUILDINGS[b.def];
      const s = def.service;
      if (!s || s.radius <= 0) continue;
      const staffed = def.workers > 0 ? clamp01(b.workers.length / def.workers) : 1;
      const strength = s.strength * (0.35 + staffed * 0.65);
      if (strength <= 0) continue;

      const minX = Math.max(0, Math.floor((b.cx - s.radius) / cell));
      const maxX = Math.min(this.serviceW - 1, Math.ceil((b.cx + s.radius) / cell));
      const minY = Math.max(0, Math.floor((b.cy - s.radius) / cell));
      const maxY = Math.min(this.serviceH - 1, Math.ceil((b.cy + s.radius) / cell));
      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const dx = gx * cell - b.cx;
          const dy = gy * cell - b.cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > s.radius * s.radius) continue;
          const falloff = 1 - Math.sqrt(d2) / s.radius;
          const value = strength * (0.45 + falloff * 0.55);
          const i = gy * this.serviceW + gx;
          switch (s.kind) {
            case 'market':
              this.happinessField[i] += Math.min(12, value * 9);
              break;
            case 'faith':
              this.happinessField[i] += Math.min(9, value * 7);
              break;
            case 'tavern':
              this.happinessField[i] += Math.min(12, value * 10);
              break;
            case 'health':
              this.happinessField[i] += Math.min(5, value * 4);
              break;
            case 'water':
              this.happinessField[i] += Math.min(4, value * 3);
              this.fireField[i] += value * 0.5;
              break;
            case 'fire':
              this.fireField[i] += value * 0.8;
              break;
            default:
              break;
          }
        }
      }
    }
  }

  private sampleField(field: Float32Array, x: number, y: number): number {
    const gx = Math.round(x / this.serviceCell);
    const gy = Math.round(y / this.serviceCell);
    if (gx < 0 || gy < 0 || gx >= this.serviceW || gy >= this.serviceH) return 0;
    return field[gy * this.serviceW + gx];
  }

  /** Happiness contribution of nearby services, sampled from the coarse field. */
  serviceBonusAt(x: number, y: number): number {
    return this.sampleField(this.happinessField, x, y);
  }

  /** Registers a village event and surfaces it to the UI. */
  pushEvent(e: Omit<ActiveEvent, 'id' | 'remaining'>): ActiveEvent {
    const ev: ActiveEvent = { ...e, id: this.allocEventId(), remaining: e.duration };
    this.activeEvents.push(ev);
    this.emitter.emit('eventStarted', ev);
    this.notify(ev.title, ev.icon, ev.tone);
    return ev;
  }

  /** How well a point is protected from fire (0..1+). */
  fireProtectionAt(x: number, y: number): number {
    return this.sampleField(this.fireField, x, y);
  }
}
