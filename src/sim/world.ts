import { Emitter } from '../core/emitter';
import { Rng } from '../core/rng';
import { clamp, clamp01, smoothstep } from '../core/util';
import { BUILDINGS, type BuildingId, type NodeKind } from '../data/buildings';
import { ALL_GOOD_IDS, GOODS, type GoodId } from '../data/goods';
import { generateWorld, type WorldGenOptions } from './worldgen';
import { PathFinder } from './pathfinding';
import { SpatialGrid } from './spatial';
import { computeModifiers, type Modifiers } from './modifiers';
import { demolishWork, repairGoldCost } from './build';
import { emptyMeter } from './output';
import {
  gatherRadius,
  housingCapacity,
  MAX_IN_PLACE_LEVEL,
  maxLevelOf,
  serviceRadius,
  storageCapacity,
  upgradeTargetOf,
  workerSlots,
} from './levels';
import { createPartnerRuntime, type PartnerRuntime } from './economy';
import { randomVillageName } from '../data/names';
import { TRADE_PARTNERS } from '../data/trade';
import { DAWN, DUSK } from './clock';
import { History, type LedgerSource } from './history';
import { DesirePaths } from './paths';
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

// Re-exported so every existing `from './world'` import keeps working.
export { DAWN, DAY_SECONDS, DAYS_PER_SEASON, DUSK } from './clock';

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

/** How much a doorway prefers each road level: bare, dirt, cobble, worn. */
const ROAD_PREFERENCE = [0, 2, 3, 1];

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
  /**
   * Every active global store, refreshed with the stock cache. Builders and
   * deposits ask for "the nearest depot" constantly, and a depot list is a
   * couple of dozen entries where the building list is hundreds.
   */
  depotList: Building[] = [];
  /**
   * What each workshop is short of and where to get it, worked out once a
   * second rather than once per worker per task. Not saved: it is rebuilt
   * within a second of loading.
   */
  supplyPlan = new Map<number, { fromId: number; good: GoodId; amount: number } | null>();

  time: GameTime = { elapsed: 0, day: 1, dayFraction: 0.35, season: 'spring', year: 1 };
  weather: WeatherKind = 'clear';
  weatherTimer = 90;
  /** 0..1 rain intensity, drives visuals and the growth bonus. */
  wetness = 0;

  research: ResearchState = {
    completed: new Set(),
    active: null,
    progress: 0,
    queue: [],
  };
  modifiers: Modifiers = computeModifiers([]);

  /** What the player calls this place. Chosen at the founding, renamable. */
  villageName = 'Le Hameau';

  // The founding purse. It has to cover a university and the tax register,
  // because until that study lands nothing else brings a coin in.
  treasury = 150;
  /** Every coin in and out, tagged by source, plus the rolling curves. */
  history = new History();
  /** Tracks footfall and turns well-trodden ground into trails. */
  desirePaths = new DesirePaths();
  contracts: TradeContract[] = [];
  activeEvents: ActiveEvent[] = [];
  notifications: Notification[] = [];
  /**
   * The first village event fires early on purpose — but it can only be a
   * kind one. See `updateVillageEvents`: nothing harmful is drawn until the
   * village is settled. Pushing the first event back instead turned out to
   * starve the opening village, which had quietly come to depend on an early
   * windfall to get through its first day.
   */
  eventCooldown = 200;
  /** Ids of guided objectives the player has already ticked off. */
  completedObjectives = new Set<string>();

  /** Runtime state of every trade partner (stock, demand, relationship). */
  partners = new Map<string, PartnerRuntime>();
  /** Rolling income buckets, reset every in-game minute for the HUD. */
  tradeIncomeWindow = 0;
  taxIncomeWindow = 0;
  /**
   * Share of a villager's earnings the village takes, 0..1. Half is the
   * neutral setting: above it people grumble, below it they are cheerful and
   * the treasury empty.
   */
  /**
   * Tax rate. Zero until `r_taxation` is studied — see `taxIncome`. The
   * study sets it to a sensible middle when it lands.
   */
  taxRate = 0;
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

    this.villageName = randomVillageName((list) => this.rng.pick(list));

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

  /** Credits the treasury and books the coins against a source. */
  earn(amount: number, source: LedgerSource): void {
    if (!(amount > 0)) return;
    this.treasury += amount;
    this.history.record(source, amount);
  }

  /** Debits the treasury and books the coins against a source. */
  spend(amount: number, source: LedgerSource): void {
    if (!(amount > 0)) return;
    this.treasury -= amount;
    this.history.record(source, amount);
  }

  rebuildNodeGrid(): void {
    this.nodeGrid.rebuild(
      (function* (map: Map<number, ResourceNode>) {
        for (const n of map.values()) if (n.alive) yield n;
      })(this.nodes),
    );
  }

  // ── notifications ────────────────────────────────────────────────────────
  notify(text: string, icon = 'info', tone: Notification['tone'] = 'neutral', fx?: number, fy?: number): void {
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
    if (def.placement.kind === 'within' && !this.hostFor(defId, x, y, w, h)) {
      const names = def.placement.hosts.map((id) => BUILDINGS[id].name).join(' ou ');
      return { ok: false, reason: `À poser dans la zone d'un ${names}` };
    }
    if (def.category === 'farming' && this.averageFertility(x, y, w, h) < 0.25) {
      return { ok: false, reason: 'Terre trop pauvre' };
    }
    if (!this.hasAccess(x, y, w, h)) {
      return { ok: false, reason: 'Aucun accès : laissez un passage' };
    }
    return { ok: true, reason: '' };
  }

  /**
   * The building whose working ground covers this footprint, or null.
   *
   * A gathering host claims a circle — its own harvesting radius, so the
   * forester plants exactly where the woodcutters cut. Anything else claims
   * its footprint grown by `margin`, which is what turns a wheat field into a
   * rectangular estate the mill can stand in.
   */
  hostFor(defId: BuildingId, x: number, y: number, w: number, h: number): Building | null {
    const rule = BUILDINGS[defId].placement;
    if (rule.kind !== 'within') return null;
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (const b of this.buildingList) {
      if (!rule.hosts.includes(b.def)) continue;
      if (b.state !== 'active' && b.state !== 'building' && b.state !== 'planned') continue;
      if (BUILDINGS[b.def].gather) {
        const radius = gatherRadius(b);
        if ((b.cx - cx) ** 2 + (b.cy - cy) ** 2 <= radius * radius) return b;
        continue;
      }
      const margin = rule.margin ?? 3;
      if (
        x + w > b.x - margin &&
        x < b.x + b.w + margin &&
        y + h > b.y - margin &&
        y < b.y + b.h + margin
      ) {
        return b;
      }
    }
    return null;
  }

  /**
   * Buildings whose rank is tied to this one's, in both directions: a
   * forester's hut and the camp it stands in improve together, and so do a
   * mill and its field. Improving one and not the other leaves the pair
   * unbalanced — a camp that outcuts its forester empties the wood.
   */
  linkedBuildings(b: Building): Building[] {
    const out: Building[] = [];
    const rule = BUILDINGS[b.def].placement;
    if (rule.kind === 'within') {
      const host = this.hostFor(b.def, b.x, b.y, b.w, b.h);
      if (host) out.push(host);
    }
    for (const other of this.buildingList) {
      if (other.id === b.id) continue;
      const otherRule = BUILDINGS[other.def].placement;
      if (otherRule.kind !== 'within' || !otherRule.hosts.includes(b.def)) continue;
      if (this.hostFor(other.def, other.x, other.y, other.w, other.h)?.id === b.id) out.push(other);
    }
    return out;
  }

  /** Brings every linked building up to `level`, free of charge. */
  raiseLinked(b: Building, level: number): void {
    for (const other of this.linkedBuildings(b)) {
      const capped = Math.min(maxLevelOf(other.def, this.modifiers.buildingLevel), level);
      if (other.level >= capped) continue;
      other.level = capped;
      this.notify(
        `${BUILDINGS[other.def].name} suit : niveau ${other.level}`,
        'build',
        'good',
        other.cx,
        other.cy,
      );
    }
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
    this.spend(def.goldCost, 'build');

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
      level: 1,
      upgrade: null,
      delivered: {},
      inv: {},
      workers: [],
      residents: [],
      work: 0,
      recipeIndex: 0,
      efficiency: 0,
      sorting: null,
      repairing: false,
      demolish: null,
      output: emptyMeter(),
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
      this.earn(Math.floor(def.goldCost * 0.4), 'gift');
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

  // ── Ruins: repair or clear, both of which take hands and time ───────────

  /** Can this ruin be put back on its feet? */
  canRepair(b: Building): PlacementCheck {
    if (b.state !== 'ruined') return { ok: false, reason: "Ce n'est pas une ruine" };
    if (b.demolish) return { ok: false, reason: 'Démolition en cours' };
    const def = BUILDINGS[b.def];
    if (def.requires && !this.research.completed.has(def.requires)) {
      return { ok: false, reason: 'Étude manquante' };
    }
    const gold = repairGoldCost(b);
    if (this.treasury < gold) return { ok: false, reason: "Pas assez d'or" };
    return { ok: true, reason: '' };
  }

  /**
   * Turns a ruin back into a building site.
   *
   * The salvage already lying on the plot stays where it is and counts
   * towards the bill, which is most of why repairing beats building new: the
   * stones are already there.
   */
  startRepair(id: number): boolean {
    const b = this.buildings.get(id);
    if (!b || !this.canRepair(b).ok) return false;
    this.spend(repairGoldCost(b), 'build');
    b.repairing = true;
    b.state = 'planned';
    b.enabled = true;
    b.buildProgress = 0;
    b.stall = null;
    this.layoutVersion++;
    return true;
  }

  /** Puts a building on the demolition list. Builders do the rest. */
  startDemolish(id: number): boolean {
    const b = this.buildings.get(id);
    if (!b || b.demolish) return false;
    // A site nobody has built yet is just a plan: cancelling it is immediate.
    if (b.state === 'planned' && b.buildProgress <= 0 && !b.repairing) {
      this.removeBuilding(id, true);
      return true;
    }
    b.demolish = { progress: 0, total: demolishWork(b) };
    b.stall = null;
    // Workers leave straight away; there is nothing left for them to do here.
    for (const vid of [...b.workers]) {
      const v = this.villagerById.get(vid);
      if (v) {
        v.workId = 0;
        v.profession = 'idle';
        v.task = { kind: 'none' };
      }
    }
    b.workers.length = 0;
    return true;
  }

  cancelDemolish(id: number): void {
    const b = this.buildings.get(id);
    if (b) b.demolish = null;
  }

  /** Called by the builders once the last beam is down. */
  finishDemolish(id: number): void {
    const b = this.buildings.get(id);
    if (!b) return;
    b.demolish = null;
    this.removeBuilding(id, true);
  }

  /** Can the player start improving this building right now? */
  canUpgrade(b: Building): PlacementCheck {
    const target = upgradeTargetOf(b, this.modifiers.buildingLevel);
    if (!target) {
      // Being stopped by the tree and being finished are different answers,
      // and the player deserves to be told which one they are looking at.
      const ceiling = maxLevelOf(b.def, this.modifiers.buildingLevel);
      if (b.level >= ceiling && ceiling < MAX_IN_PLACE_LEVEL && !BUILDINGS[b.def].upgradesTo) {
        return { ok: false, reason: 'Étude manquante' };
      }
      return { ok: false, reason: 'Niveau maximal atteint' };
    }
    if (b.state !== 'active') return { ok: false, reason: 'Bâtiment non actif' };
    if (b.upgrade) return { ok: false, reason: 'Travaux déjà en cours' };
    if (target.toDef) {
      const next = BUILDINGS[target.toDef];
      if (next.requires && !this.research.completed.has(next.requires)) {
        return { ok: false, reason: 'Recherche manquante' };
      }
      const [nw, nh] = this.footprint(target.toDef, b.rotation);
      const nx = b.x - Math.floor((nw - b.w) / 2);
      const ny = b.y - Math.floor((nh - b.h) / 2);
      this.map.setOccupancy(b.x, b.y, b.w, b.h, -1);
      const check = this.canPlace(target.toDef, nx, ny, b.rotation);
      this.map.setOccupancy(b.x, b.y, b.w, b.h, b.id);
      if (!check.ok) return { ok: false, reason: `Pas assez de place (${check.reason.toLowerCase()})` };
    }
    if (this.treasury < target.goldCost) return { ok: false, reason: "Pas assez d'or" };
    for (const [g, amount] of Object.entries(target.cost)) {
      if (this.stockOf(g as GoodId) < (amount as number)) {
        return { ok: false, reason: `Manque ${GOODS[g as GoodId].name}` };
      }
    }
    return { ok: true, reason: '' };
  }

  /**
   * Starts an improvement. Materials and coin are taken up front, then the
   * builders put in the work: an upgrade is something you watch happen, not a
   * button that swaps one model for another.
   */
  startUpgrade(id: number): boolean {
    const b = this.buildings.get(id);
    if (!b) return false;
    if (!this.canUpgrade(b).ok) return false;
    const target = upgradeTargetOf(b, this.modifiers.buildingLevel)!;
    this.spend(target.goldCost, 'upgrade');
    for (const [g, amount] of Object.entries(target.cost)) {
      this.takeFromStock(g as GoodId, amount as number);
    }
    b.upgrade = { toDef: target.toDef, toLevel: target.toLevel, progress: 0, total: target.work };
    return true;
  }

  cancelUpgrade(id: number): void {
    const b = this.buildings.get(id);
    if (!b || !b.upgrade) return;
    b.upgrade = null;
  }

  /** Called by the construction system once the builders finish. */
  finishUpgrade(id: number): void {
    const b = this.buildings.get(id);
    if (!b || !b.upgrade) return;
    const { toDef, toLevel } = b.upgrade;
    b.upgrade = null;

    if (!toDef) {
      b.level = toLevel;
      this.layoutVersion++;
      this.notify(`${BUILDINGS[b.def].name} amélioré au niveau ${toLevel}`, 'build', 'good', b.cx, b.cy);
      // A camp and its forester, a field and its mill: they rise together, at
      // no extra cost. A camp that outgrows its forester strips the wood.
      this.raiseLinked(b, toLevel);
      return;
    }

    // Swapping definition: carry over the staff, the residents and the stock.
    const next = BUILDINGS[toDef];
    const [nw, nh] = this.footprint(toDef, b.rotation);
    const nx = b.x - Math.floor((nw - b.w) / 2);
    const ny = b.y - Math.floor((nh - b.h) / 2);
    const workers = [...b.workers];
    const residents = [...b.residents];
    const inv = { ...b.inv };
    const rotation = b.rotation;

    this.removeBuilding(b.id, false);
    const created = this.place(toDef, nx, ny, rotation, true);
    if (!created) {
      const restored = this.place(b.def, b.x, b.y, rotation, true);
      if (restored) restored.inv = inv;
      return;
    }
    created.inv = inv;
    for (const vid of workers) {
      const v = this.villagerById.get(vid);
      if (!v || created.workers.length >= workerSlots(created)) break;
      created.workers.push(vid);
      v.workId = created.id;
      v.profession = next.profession;
      v.task = { kind: 'none' };
    }
    for (const vid of residents) {
      const v = this.villagerById.get(vid);
      if (!v || created.residents.length >= housingCapacity(created)) break;
      created.residents.push(vid);
      v.homeId = created.id;
    }
    this.notify(`${next.name} : travaux terminés`, 'build', 'good', created.cx, created.cy);
    // Moving up a tier is an improvement too, so the pair keeps pace.
    this.raiseLinked(created, Math.max(created.level, b.level) + 1);
  }

  // ── Manual staffing ──────────────────────────────────────────────────────
  /** Free adults, nearest first, who could take a job at this building. */
  availableWorkers(b: Building): Villager[] {
    const out: Villager[] = [];
    for (const v of this.villagers) {
      if (v.workId !== 0) continue;
      if (v.profession === 'child') continue;
      out.push(v);
    }
    out.sort(
      (a, z) => (a.x - b.cx) ** 2 + (a.y - b.cy) ** 2 - ((z.x - b.cx) ** 2 + (z.y - b.cy) ** 2),
    );
    return out;
  }

  /** Fills one slot with the nearest free adult. Returns them, or null. */
  assignWorker(id: number): Villager | null {
    const b = this.buildings.get(id);
    if (!b || b.state !== 'active') return null;
    if (b.workers.length >= workerSlots(b)) return null;
    const [v] = this.availableWorkers(b);
    if (!v) return null;
    b.workers.push(v.id);
    v.workId = b.id;
    v.profession = BUILDINGS[b.def].profession;
    v.task = { kind: 'none' };
    return v;
  }

  /** Sends a worker back to the pool of general labourers. */
  unassignWorker(id: number, villagerId: number): void {
    const b = this.buildings.get(id);
    if (!b) return;
    const i = b.workers.indexOf(villagerId);
    if (i === -1) return;
    b.workers.splice(i, 1);
    const v = this.villagerById.get(villagerId);
    if (!v) return;
    v.workId = 0;
    v.profession = 'idle';
    v.task = { kind: 'none' };
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
    return Math.floor(storageCapacity(b) * (def.storage.global ? this.modifiers.storage : 1));
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
    // The player's own sorting, on top of what the building can physically
    // hold. This is what lets a village have quarters: a depot by the forges
    // that takes only ore and ingots, a granary that takes only food.
    if (b.sorting && !b.sorting.includes(good)) return false;
    return true;
  }

  /** Every good this depot could hold if the player let it. */
  sortableGoods(b: Building): GoodId[] {
    const def = BUILDINGS[b.def];
    if (!def.storage) return [];
    if (def.storage.accepts) return [...def.storage.accepts];
    return ALL_GOOD_IDS;
  }

  /**
   * Narrows or widens a depot's sorting. Passing every good back sets it to
   * null again, so "everything" stays "everything" as the catalogue grows.
   */
  setSorting(b: Building, goods: GoodId[] | null): void {
    if (!goods || goods.length >= this.sortableGoods(b).length) {
      b.sorting = null;
      return;
    }
    b.sorting = [...goods];
  }

  /** Total of a good across every global storehouse. */
  stockOf(good: GoodId): number {
    return this.stock[good] ?? 0;
  }

  refreshStockCache(): void {
    const s: Partial<Record<GoodId, number>> = {};
    let cap = 0;
    let used = 0;
    this.depotList.length = 0;
    for (const b of this.buildingList) {
      const def = BUILDINGS[b.def];
      if (!def.storage?.global || b.state !== 'active') continue;
      this.depotList.push(b);
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
      // Prefer the best-made road, then tiles closest to the centre of mass.
      // A worn trail (level 3) is the *weakest* surface, not the strongest, so
      // the raw level cannot be used as a score.
      const surface = ROAD_PREFERENCE[this.map.road[this.map.idx(x, y)]] ?? 0;
      const score = surface * 4 - Math.abs(x - b.cx) - Math.abs(y - b.cy);
      if (score > bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
    if (best) return { x: best[0] + 0.5, y: best[1] + 0.5 };
    // Ringed in by other buildings: widen the search rather than returning the
    // building's own centre, which is never walkable and left carriers
    // walking into a wall forever.
    for (let r = 2; r <= 6; r++) {
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          if (Math.abs(i) !== r && Math.abs(j) !== r) continue;
          const x = Math.round(b.cx) + i;
          const y = Math.round(b.cy) + j;
          if (this.map.walkable(x, y)) return { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    return { x: b.cx, y: b.cy };
  }

  /** True when at least one walkable tile touches the footprint. */
  hasAccess(x: number, y: number, w: number, h: number): boolean {
    for (let i = x - 1; i <= x + w; i++) {
      if (this.map.walkable(i, y - 1) || this.map.walkable(i, y + h)) return true;
    }
    for (let j = y - 1; j <= y + h; j++) {
      if (this.map.walkable(x - 1, j) || this.map.walkable(x + w, j)) return true;
    }
    return false;
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

  /**
   * Daylight 0..1. Seventy per cent of the day is lit, with a soft ramp at each
   * end, and the summer sun rises earlier and sets later than the winter one.
   */
  daylight(): number {
    const f = this.time.dayFraction;
    const shift =
      this.time.season === 'summer' ? 0.05 : this.time.season === 'winter' ? -0.05 : 0;
    const dawn = DAWN - shift;
    const dusk = DUSK + shift;
    const ramp = 0.07;
    const rising = clamp01((f - (dawn - ramp)) / (ramp * 2));
    const falling = clamp01((dusk + ramp - f) / (ramp * 2));
    return smoothstep(Math.min(rising, falling));
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
      const slots = workerSlots(b);
      const staffed = slots > 0 ? clamp01(b.workers.length / slots) : 1;
      const strength = s.strength * (0.35 + staffed * 0.65);
      if (strength <= 0) continue;

      const radius = serviceRadius(b);
      const minX = Math.max(0, Math.floor((b.cx - radius) / cell));
      const maxX = Math.min(this.serviceW - 1, Math.ceil((b.cx + radius) / cell));
      const minY = Math.max(0, Math.floor((b.cy - radius) / cell));
      const maxY = Math.min(this.serviceH - 1, Math.ceil((b.cy + radius) / cell));
      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const dx = gx * cell - b.cx;
          const dy = gy * cell - b.cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > radius * radius) continue;
          const falloff = 1 - Math.sqrt(d2) / radius;
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
            case 'decor':
              // Small, cheap and stackable: the player decorates a quarter and
              // watches the morale of everyone living there climb.
              this.happinessField[i] += Math.min(7, value * 6);
              // A fountain is a water source as much as an ornament.
              if (def.id === 'fountain') this.fireField[i] += value * 0.4;
              break;
            case 'leisure':
              this.happinessField[i] += Math.min(14, value * 11);
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
