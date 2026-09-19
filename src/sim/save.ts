import { computeModifiers } from './modifiers';
import { Simulation } from './simulation';
import type { ResearchId } from '../data/research';
import type { GoodId } from '../data/goods';
import type { Building, ResourceNode, Villager } from './types';
import type { WorldGenOptions } from './worldgen';
import { createPartnerRuntime } from './economy';
import { History } from './history';
import { DesirePaths } from './paths';
import { TRADE_PARTNERS } from '../data/trade';

/**
 * Bumped to 6 with the economy rework: snapshots now carry the ledger and the
 * rolling curves, and the food thresholds they were balanced against changed.
 * A version 5 village would load with a founding cohort already past working
 * age and a larder sized for the old two-minute day.
 */
export const SAVE_VERSION = 6;
export const SAVE_KEY = 'therise.save.v6';

interface NodeDiff {
  /** Ids present in the freshly generated world that no longer exist. */
  removed: number[];
  /** [id, amount, growth] for nodes that changed but still exist. */
  changed: Array<[number, number, number]>;
  /** Nodes created during play (saplings, respawned wildlife). */
  added: ResourceNode[];
}

export interface SaveData {
  version: number;
  savedAt: number;
  gen: Partial<WorldGenOptions>;
  time: { elapsed: number; day: number; dayFraction: number; season: string; year: number };
  weather: string;
  weatherTimer: number;
  treasury: number;
  history: ReturnType<History['toJSON']>;
  taxRate: number;
  comfortPool: number;
  eventCooldown: number;
  objectives: string[];
  research: {
    completed: ResearchId[];
    active: ResearchId | null;
    progress: number;
    queue: ResearchId[];
  };
  buildings: Building[];
  villagers: Villager[];
  nodes: NodeDiff;
  /** Sparse road paint: [tileIndex, level]. Level 3 is a worn trail. */
  roads: Array<[number, number]>;
  /** Accumulated footfall behind those trails: [tileIndex, wear]. */
  wear: Array<[number, number]>;
  contracts: unknown[];
  partners: Array<[string, { stock: Record<string, number>; demand: Record<string, number>; relation: number }]>;
  events: unknown[];
  nextIds: { building: number; villager: number };
}

/** Serialises a running simulation into a compact, replayable snapshot. */
export function serialize(sim: Simulation, gen: Partial<WorldGenOptions>): SaveData {
  const w = sim.world;

  // Node diff against a pristine generation of the same seed.
  const pristine = new Simulation(gen).world;
  const removed: number[] = [];
  const changed: Array<[number, number, number]> = [];
  const added: ResourceNode[] = [];
  for (const [id, n] of pristine.nodes) {
    const live = w.nodes.get(id);
    if (!live) {
      removed.push(id);
    } else if (live.amount !== n.amount || live.growth !== n.growth) {
      changed.push([id, live.amount, live.growth]);
    }
  }
  for (const [id, n] of w.nodes) {
    if (!pristine.nodes.has(id)) added.push({ ...n, claimedBy: 0 });
  }

  const roads: Array<[number, number]> = [];
  for (let i = 0; i < w.map.road.length; i++) {
    if (w.map.road[i] !== 0) roads.push([i, w.map.road[i]]);
  }

  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    gen,
    time: { ...w.time },
    weather: w.weather,
    weatherTimer: w.weatherTimer,
    treasury: w.treasury,
    history: w.history.toJSON(),
    taxRate: w.taxRate,
    comfortPool: w.comfortPool,
    eventCooldown: w.eventCooldown,
    objectives: [...w.completedObjectives],
    research: {
      completed: [...w.research.completed],
      active: w.research.active,
      progress: w.research.progress,
      queue: [...w.research.queue],
    },
    buildings: w.buildingList.map((b) => ({ ...b, workers: [...b.workers], residents: [...b.residents] })),
    villagers: w.villagers.map((v) => ({ ...v, path: null })),
    nodes: { removed, changed, added },
    roads,
    wear: w.desirePaths.toJSON(),
    contracts: w.contracts.map((c) => ({ ...c })),
    partners: [...w.partners.entries()].map(([id, rt]) => [
      id,
      {
        stock: rt.stock as Record<string, number>,
        demand: rt.demand as Record<string, number>,
        relation: rt.relation,
      },
    ]),
    events: w.activeEvents.map((e) => ({ ...e })),
    nextIds: {
      building: Math.max(1, ...w.buildingList.map((b) => b.id + 1)),
      villager: Math.max(1, ...w.villagers.map((v) => v.id + 1)),
    },
  };
}

/** Rebuilds a simulation from a snapshot. Throws when the save is unusable. */
export function deserialize(data: SaveData): Simulation {
  if (data.version !== SAVE_VERSION) throw new Error('Version de sauvegarde incompatible');
  const sim = new Simulation(data.gen);
  const w = sim.world;

  // ── Nodes ───────────────────────────────────────────────────────────────
  for (const id of data.nodes.removed) w.killNode(id);
  for (const [id, amount, growth] of data.nodes.changed) {
    const n = w.nodes.get(id);
    if (!n) continue;
    n.amount = amount;
    n.growth = growth;
  }
  for (const n of data.nodes.added) {
    if (w.nodes.has(n.id)) continue;
    w.nodes.set(n.id, { ...n, claimedBy: 0 });
    const x = Math.floor(n.x);
    const y = Math.floor(n.y);
    if ((n.kind === 'tree' || n.kind === 'stone_rock') && w.map.inBounds(x, y)) {
      w.map.blocker[w.map.idx(x, y)] = n.id;
    }
  }
  w.animals = [...w.nodes.values()].filter((n) => n.kind === 'wild_animal');
  w.rebuildNodeGrid();
  w.nodeChanges.length = 0;

  // ── Roads ───────────────────────────────────────────────────────────────
  w.map.road.fill(0);
  for (const [i, level] of data.roads) w.map.road[i] = level;
  w.desirePaths = DesirePaths.fromJSON(data.wear);

  // ── Buildings ───────────────────────────────────────────────────────────
  w.buildings.clear();
  w.buildingList.length = 0;
  w.map.occupancy.fill(-1);
  for (const raw of data.buildings) {
    const b: Building = {
      ...raw,
      x: Math.round(raw.x),
      y: Math.round(raw.y),
      delivered: { ...raw.delivered },
      inv: { ...raw.inv },
      workers: [...raw.workers],
      residents: [...raw.residents],
      recipeIndex: raw.recipeIndex ?? 0,
      level: raw.level ?? 1,
      upgrade: raw.upgrade ? { ...raw.upgrade } : null,
    };
    w.map.flatten(b.x, b.y, b.w, b.h);
    w.map.setOccupancy(b.x, b.y, b.w, b.h, b.id);
    w.buildings.set(b.id, b);
    w.buildingList.push(b);
  }
  w.terrainChanges.length = 0;

  // ── Villagers ───────────────────────────────────────────────────────────
  w.villagers.length = 0;
  w.villagerById.clear();
  for (const raw of data.villagers) {
    const v: Villager = {
      ...raw,
      path: null,
      pathIndex: 0,
      task: { ...raw.task },
      happinessTarget: raw.happinessTarget ?? raw.happiness,
      taskCooldown: 0,
      stuckTimer: 0,
      bestDist: Infinity,
      prevX: raw.x,
      prevY: raw.y,
      prevAngle: raw.angle,
    };
    w.villagers.push(v);
    w.villagerById.set(v.id, v);
  }

  // ── Scalar state ────────────────────────────────────────────────────────
  Object.assign(w.time, data.time);
  w.weather = data.weather as never;
  w.weatherTimer = data.weatherTimer;
  w.treasury = data.treasury;
  w.history = History.fromJSON(data.history);
  w.taxRate = data.taxRate ?? 0.5;
  w.comfortPool = data.comfortPool ?? 0;
  w.eventCooldown = data.eventCooldown ?? 200;
  w.completedObjectives = new Set(data.objectives ?? []);
  w.research.completed = new Set(data.research.completed);
  w.research.active = data.research.active;
  w.research.progress = data.research.progress;
  w.research.queue = [...data.research.queue];
  w.modifiers = computeModifiers(w.research.completed);
  w.contracts = data.contracts as never;
  w.activeEvents = data.events as never;

  w.partners.clear();
  for (const p of TRADE_PARTNERS) w.partners.set(p.id, createPartnerRuntime(p));
  for (const [id, rt] of data.partners ?? []) {
    const runtime = w.partners.get(id);
    if (!runtime) continue;
    runtime.stock = rt.stock as Partial<Record<GoodId, number>>;
    runtime.demand = rt.demand as Partial<Record<GoodId, number>>;
    runtime.relation = rt.relation;
  }

  // Restore id counters so new objects never collide with loaded ones.
  for (let i = 1; i < data.nextIds.building; i++) w.allocBuildingId();
  for (let i = 1; i < data.nextIds.villager; i++) w.allocVillagerId();

  w.refreshStockCache();
  w.rebuildServiceFields();
  sim.tick(0.0001);
  return sim;
}

// ── Storage adapter ────────────────────────────────────────────────────────

interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

let storePromise: Promise<KeyValueStore> | null = null;

/**
 * Uses Capacitor Preferences on device (survives WebView data clears better
 * than localStorage) and falls back to localStorage in the browser.
 */
async function getStore(): Promise<KeyValueStore> {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    try {
      const mod = await import('@capacitor/preferences');
      const Preferences = mod.Preferences;
      // Probe it; on the web the plugin proxies to localStorage anyway.
      await Preferences.get({ key: '__probe' });
      return {
        async get(key) {
          const { value } = await Preferences.get({ key });
          return value ?? null;
        },
        async set(key, value) {
          await Preferences.set({ key, value });
        },
        async remove(key) {
          await Preferences.remove({ key });
        },
      } satisfies KeyValueStore;
    } catch {
      return {
        async get(key) {
          try {
            return window.localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        async set(key, value) {
          window.localStorage.setItem(key, value);
        },
        async remove(key) {
          window.localStorage.removeItem(key);
        },
      } satisfies KeyValueStore;
    }
  })();
  return storePromise;
}

export async function writeSave(sim: Simulation, gen: Partial<WorldGenOptions>): Promise<void> {
  const store = await getStore();
  const data = serialize(sim, gen);
  await store.set(SAVE_KEY, JSON.stringify(data));
}

export async function readSave(): Promise<SaveData | null> {
  const store = await getStore();
  const raw = await store.get(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    return data.version === SAVE_VERSION ? data : null;
  } catch {
    return null;
  }
}

export async function clearSave(): Promise<void> {
  const store = await getStore();
  await store.remove(SAVE_KEY);
}
