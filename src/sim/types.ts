import type { BuildingId, NodeKind } from '../data/buildings';
import type { GoodId } from '../data/goods';
import type { ProfessionId } from '../data/professions';
import type { ResearchId } from '../data/research';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Printemps',
  summer: 'Été',
  autumn: 'Automne',
  winter: 'Hiver',
};

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow' | 'fog';

export interface GameTime {
  /** Total elapsed simulated seconds. */
  elapsed: number;
  /** Whole days since the founding. */
  day: number;
  /** 0..1 through the current day. */
  dayFraction: number;
  season: Season;
  year: number;
}

export type TerrainType = 0 | 1 | 2 | 3 | 4 | 5;
export const TERRAIN = {
  GRASS: 0 as TerrainType,
  FOREST: 1 as TerrainType,
  ROCK: 2 as TerrainType,
  SAND: 3 as TerrainType,
  DIRT: 4 as TerrainType,
  WATER: 5 as TerrainType,
};

export type RoadLevel = 0 | 1 | 2;

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  /** Tile coordinates (integers) for static nodes; floats for roaming animals. */
  x: number;
  y: number;
  /** Remaining harvestable amount. */
  amount: number;
  maxAmount: number;
  /** Visual variety index. */
  variant: number;
  /** Scale 0..1, used for saplings growing into trees. */
  growth: number;
  alive: boolean;
  /** Set while a worker is on the way, to avoid two workers on one tree. */
  claimedBy: number;
  /** Roaming animals only. */
  vx?: number;
  vy?: number;
  wanderTimer?: number;
}

export type BuildingState = 'planned' | 'building' | 'active' | 'paused' | 'burning' | 'ruined';

export interface Building {
  id: number;
  def: BuildingId;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Centre in world tile coordinates (float). */
  cx: number;
  cy: number;
  rotation: number;
  state: BuildingState;
  /** Construction progress in work units. */
  buildProgress: number;
  /** Materials delivered to the site so far. */
  delivered: Partial<Record<GoodId, number>>;
  /** Local inventory (inputs and outputs). */
  inv: Partial<Record<GoodId, number>>;
  /** Villager ids currently employed here. */
  workers: number[];
  /** Villager ids living here (housing). */
  residents: number[];
  /** Production progress in work units toward the current batch. */
  work: number;
  /** Selected recipe for workshops that offer several. */
  recipeIndex: number;
  /** Rolling efficiency 0..1 used by the UI. */
  efficiency: number;
  /** Seconds this building has been idle for lack of input/target. */
  idleTime: number;
  /** Fire intensity 0..1 while burning. */
  fire: number;
  /** Per-building upgrade level applied on top of the def tier. */
  active: boolean;
  /** Player toggle for pausing production. */
  enabled: boolean;
  /** Livestock head count for pastures. */
  herd: number;
  /** Last reason the building could not work, for the UI. */
  stall: string | null;
}

export type VillagerState =
  | 'idle'
  | 'walking'
  | 'working'
  | 'hauling'
  | 'eating'
  | 'sleeping'
  | 'relaxing'
  | 'fleeing';

export type TaskKind =
  | 'none'
  | 'harvest'
  | 'produce'
  | 'haul'
  | 'build'
  | 'eat'
  | 'sleep'
  | 'wander'
  | 'douse';

export interface VillagerTask {
  kind: TaskKind;
  /** Target node for harvesting. */
  nodeId?: number;
  /** Source and destination buildings for hauling. */
  fromId?: number;
  toId?: number;
  good?: GoodId;
  amount?: number;
  /** Generic building target (workplace, construction site, market). */
  targetId?: number;
  /** Phase within a multi-leg task. */
  phase?: number;
}

export interface Villager {
  id: number;
  name: string;
  surname: string;
  female: boolean;
  /** Age in game days. */
  age: number;
  skin: number;
  hair: number;
  hairStyle: number;
  bodyScale: number;
  profession: ProfessionId;
  homeId: number;
  workId: number;
  x: number;
  y: number;
  /** Facing angle in radians. */
  angle: number;
  state: VillagerState;
  task: VillagerTask;
  path: Int32Array | null;
  pathIndex: number;
  pathCooldown: number;
  targetX: number;
  targetY: number;
  carrying: GoodId | null;
  carryAmount: number;
  /** 0 (starving) .. 100 (full). */
  satiety: number;
  /** 0 (exhausted) .. 100 (rested). */
  energy: number;
  /** 0..100 */
  happiness: number;
  health: number;
  sick: number;
  /** Accumulated work toward the current action. */
  work: number;
  /** Cosmetic bob phase so the crowd does not move in lockstep. */
  phase: number;
  /** Seconds since last successful job assignment, drives idle chatter. */
  idleFor: number;
  pregnant: number;
}

export interface HaulJob {
  id: number;
  good: GoodId;
  amount: number;
  /** -1 means "any global storehouse holding the good". */
  fromId: number;
  toId: number;
  priority: number;
  claimedBy: number;
}

export interface ResearchState {
  points: number;
  completed: Set<ResearchId>;
  /** Currently studied topic. */
  active: ResearchId | null;
  progress: number;
  queue: ResearchId[];
}

export interface TradeContract {
  id: number;
  partnerId: string;
  /** Positive amount = we sell, negative = we buy. */
  direction: 'sell' | 'buy';
  good: GoodId;
  amount: number;
  unitPrice: number;
  /** Seconds remaining until the caravan arrives. */
  eta: number;
  totalTravel: number;
  state: 'outbound' | 'done' | 'cancelled';
}

export type VillageEventKind =
  | 'fire'
  | 'disease'
  | 'rain_blessing'
  | 'harsh_winter'
  | 'bumper_crop'
  | 'wandering_family'
  | 'merchant_visit'
  | 'wolves';

export interface ActiveEvent {
  id: number;
  kind: VillageEventKind;
  title: string;
  body: string;
  /** Seconds remaining. */
  remaining: number;
  duration: number;
  severity: number;
  /** Buildings involved, when relevant. */
  targets: number[];
  icon: string;
  tone: 'good' | 'bad' | 'neutral';
}

export interface Notification {
  id: number;
  text: string;
  icon: string;
  tone: 'good' | 'bad' | 'neutral';
  time: number;
  /** Optional camera focus. */
  fx?: number;
  fy?: number;
}

export interface VillageStats {
  population: number;
  adults: number;
  children: number;
  employed: number;
  idle: number;
  housingCapacity: number;
  foodStock: number;
  foodDays: number;
  happiness: number;
  health: number;
  gold: number;
  goldPerMinute: number;
  researchRate: number;
  /** 1..6, drives trade reputation and milestones. */
  tier: number;
}
