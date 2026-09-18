import type { GoodId } from './goods';
import type { ProfessionId } from './professions';
import type { ResearchId } from './research';

export type NodeKind =
  | 'tree'
  | 'berry_bush'
  | 'stone_rock'
  | 'clay_patch'
  | 'coal_vein'
  | 'iron_vein'
  | 'gold_vein'
  | 'fish_shoal'
  | 'wild_animal';

export type BuildingCategory =
  | 'civic'
  | 'housing'
  | 'storage'
  | 'gathering'
  | 'farming'
  | 'industry'
  | 'crafting'
  | 'service'
  | 'infrastructure';

export type PlacementRule =
  /** Flat, dry, unoccupied ground. */
  | { kind: 'land' }
  /** Footprint must touch water (rivers, lake). */
  | { kind: 'shore' }
  /** Footprint must cover at least one node of the given kind. */
  | { kind: 'deposit'; node: NodeKind }
  /** Free-form tile painting (roads, fields). */
  | { kind: 'paint' };

export interface Recipe {
  inputs: Partial<Record<GoodId, number>>;
  outputs: Partial<Record<GoodId, number>>;
  /** Work units required for one batch. A worker supplies ~1 unit/second. */
  work: number;
  /** Shown in the building panel when a workshop offers several recipes. */
  label?: string;
}

export interface GatherSpec {
  nodes: NodeKind[];
  /** Search radius in tiles around the building. */
  radius: number;
  /** Work units to harvest one yield batch. */
  work: number;
  outputs: Partial<Record<GoodId, number>>;
  /** Optional consumable spent per harvest (e.g. arrows for hunters). */
  consumes?: Partial<Record<GoodId, number>>;
  /** If true the node is consumed (tree felled); otherwise it only depletes. */
  fells?: boolean;
}

export interface HousingSpec {
  capacity: number;
  /** Base comfort contribution, before goods consumed by the household. */
  comfort: number;
}

export type ServiceKind = 'market' | 'faith' | 'tavern' | 'water' | 'fire' | 'health' | 'research';

export interface ServiceSpec {
  kind: ServiceKind;
  radius: number;
  strength: number;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  category: BuildingCategory;
  /** Footprint in tiles, [width, depth]. */
  size: [number, number];
  cost: Partial<Record<GoodId, number>>;
  goldCost: number;
  /** Work units a builder must pour in before the building opens. */
  buildWork: number;
  workers: number;
  profession: ProfessionId;
  placement: PlacementRule;
  requires?: ResearchId;
  gather?: GatherSpec;
  recipe?: Recipe;
  /**
   * Workshops that can switch what they make. When present the player picks
   * one; `recipe` acts as the default (index 0).
   */
  recipes?: Recipe[];
  housing?: HousingSpec;
  service?: ServiceSpec;
  /** General or filtered storage. */
  storage?: { capacity: number; accepts?: GoodId[]; global?: boolean };
  /** Pasture animals raised on site. */
  livestock?: { animal: 'chicken' | 'sheep' | 'cattle'; capacity: number };
  upgradesTo?: BuildingId;
  tier: number;
  /** Fire risk multiplier; workshops with furnaces burn more easily. */
  fireRisk: number;
  desc: string;
}

export type BuildingId =
  | 'town_hall'
  | 'shack'
  | 'cottage'
  | 'house'
  | 'manor'
  | 'storehouse'
  | 'warehouse'
  | 'granary'
  | 'woodcutter_camp'
  | 'lumber_camp'
  | 'forester_hut'
  | 'gatherer_hut'
  | 'hunter_camp'
  | 'hunting_lodge'
  | 'fisher_hut'
  | 'fishing_pier'
  | 'fishing_dock'
  | 'fishing_harbour'
  | 'quarry'
  | 'great_quarry'
  | 'clay_pit'
  | 'coal_mine'
  | 'iron_mine'
  | 'gold_mine'
  | 'deep_mine'
  | 'wheat_field'
  | 'flax_field'
  | 'chicken_coop'
  | 'sheep_pasture'
  | 'cattle_pasture'
  | 'sawmill'
  | 'water_sawmill'
  | 'charcoal_burner'
  | 'brick_kiln'
  | 'smelter'
  | 'blacksmith'
  | 'goldsmith'
  | 'butcher'
  | 'smokehouse'
  | 'windmill'
  | 'bakery'
  | 'brewery'
  | 'weaver'
  | 'tailor'
  | 'tannery'
  | 'cobbler'
  | 'carpenter'
  | 'fletcher'
  | 'chandlery'
  | 'market'
  | 'grand_market'
  | 'trade_post'
  | 'chapel'
  | 'tavern'
  | 'scholars_hall'
  | 'well'
  | 'firewatch'
  | 'healer_hut'
  | 'dirt_path'
  | 'cobbled_road';

const b = (d: BuildingDef): BuildingDef => d;

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  // ── Civic ───────────────────────────────────────────────────────────────
  town_hall: b({
    id: 'town_hall',
    name: 'Hôtel de ville',
    category: 'civic',
    size: [4, 4],
    cost: {},
    goldCost: 0,
    buildWork: 0,
    workers: 3,
    profession: 'carrier',
    placement: { kind: 'land' },
    storage: { capacity: 400, global: true },
    service: { kind: 'research', radius: 0, strength: 1 },
    tier: 1,
    fireRisk: 0.3,
    desc: "Le cœur du village. Abrite les premières réserves et attire les nouveaux venus.",
  }),

  // ── Housing ─────────────────────────────────────────────────────────────
  shack: b({
    id: 'shack',
    name: 'Cabane',
    category: 'housing',
    size: [2, 2],
    cost: { logs: 12 },
    goldCost: 0,
    buildWork: 45,
    workers: 0,
    profession: 'idle',
    placement: { kind: 'land' },
    housing: { capacity: 3, comfort: 0.2 },
    upgradesTo: 'cottage',
    tier: 1,
    fireRisk: 1.4,
    desc: "Quatre planches et un toit de chaume. On y survit, on n'y vit pas.",
  }),
  cottage: b({
    id: 'cottage',
    name: 'Chaumière',
    category: 'housing',
    size: [2, 2],
    cost: { planks: 14, stone: 6 },
    goldCost: 20,
    buildWork: 90,
    workers: 0,
    profession: 'idle',
    placement: { kind: 'land' },
    requires: 'r_cottages',
    housing: { capacity: 5, comfort: 0.5 },
    upgradesTo: 'house',
    tier: 2,
    fireRisk: 1.0,
    desc: "Un vrai foyer : plancher, cheminée, place pour une famille.",
  }),
  house: b({
    id: 'house',
    name: 'Maison',
    category: 'housing',
    size: [3, 3],
    cost: { planks: 26, stone: 18, bricks: 8 },
    goldCost: 70,
    buildWork: 170,
    workers: 0,
    profession: 'idle',
    placement: { kind: 'land' },
    requires: 'r_masonry_homes',
    housing: { capacity: 8, comfort: 0.9 },
    upgradesTo: 'manor',
    tier: 3,
    fireRisk: 0.7,
    desc: "Murs de pierre, étage de bois. Le signe qu'un village devient une ville.",
  }),
  manor: b({
    id: 'manor',
    name: 'Demeure',
    category: 'housing',
    size: [3, 3],
    cost: { planks: 40, stone: 30, bricks: 22, furniture: 6 },
    goldCost: 220,
    buildWork: 300,
    workers: 0,
    profession: 'idle',
    placement: { kind: 'land' },
    requires: 'r_burgher_manors',
    housing: { capacity: 12, comfort: 1.5 },
    tier: 4,
    fireRisk: 0.5,
    desc: "La fierté des bourgeois. Douze âmes logées dans le confort.",
  }),

  // ── Storage ─────────────────────────────────────────────────────────────
  storehouse: b({
    id: 'storehouse',
    name: 'Entrepôt',
    category: 'storage',
    size: [3, 3],
    cost: { logs: 20 },
    goldCost: 0,
    buildWork: 70,
    workers: 2,
    profession: 'carrier',
    placement: { kind: 'land' },
    storage: { capacity: 500, global: true },
    upgradesTo: 'warehouse',
    tier: 1,
    fireRisk: 1.2,
    desc: "Toutes les ressources y convergent. Placez-en près des chantiers lointains.",
  }),
  warehouse: b({
    id: 'warehouse',
    name: 'Grand entrepôt',
    category: 'storage',
    size: [4, 4],
    cost: { planks: 32, stone: 20 },
    goldCost: 60,
    buildWork: 150,
    workers: 4,
    profession: 'carrier',
    placement: { kind: 'land' },
    requires: 'r_logistics',
    storage: { capacity: 1400, global: true },
    tier: 2,
    fireRisk: 0.9,
    desc: "Quais de déchargement et porteurs supplémentaires.",
  }),
  granary: b({
    id: 'granary',
    name: 'Grenier',
    category: 'storage',
    size: [3, 3],
    cost: { planks: 18, stone: 10 },
    goldCost: 25,
    buildWork: 100,
    workers: 2,
    profession: 'carrier',
    placement: { kind: 'land' },
    requires: 'r_food_preservation',
    storage: {
      capacity: 900,
      global: true,
      accepts: ['bread', 'meat', 'fish', 'smoked_fish', 'berries', 'eggs', 'wheat', 'flour', 'ale'],
    },
    tier: 1,
    fireRisk: 1.1,
    desc: "Conserve les vivres au frais et ralentit la famine hivernale.",
  }),

  // ── Gathering ───────────────────────────────────────────────────────────
  woodcutter_camp: b({
    id: 'woodcutter_camp',
    name: 'Camp de bûcherons',
    category: 'gathering',
    size: [2, 2],
    cost: { logs: 8 },
    goldCost: 0,
    buildWork: 35,
    workers: 2,
    profession: 'woodcutter',
    placement: { kind: 'land' },
    gather: { nodes: ['tree'], radius: 14, work: 9, outputs: { logs: 4 }, fells: true },
    storage: { capacity: 40, accepts: ['logs'] },
    upgradesTo: 'lumber_camp',
    tier: 1,
    fireRisk: 1.0,
    desc: "Abat les arbres alentour. Sans forestier, la forêt finit par disparaître.",
  }),
  lumber_camp: b({
    id: 'lumber_camp',
    name: 'Exploitation forestière',
    category: 'gathering',
    size: [3, 3],
    cost: { planks: 16, tools: 2 },
    goldCost: 40,
    buildWork: 90,
    workers: 4,
    profession: 'woodcutter',
    placement: { kind: 'land' },
    requires: 'r_lumber_camp',
    gather: { nodes: ['tree'], radius: 20, work: 7, outputs: { logs: 6 }, fells: true },
    storage: { capacity: 90, accepts: ['logs'] },
    tier: 2,
    fireRisk: 1.0,
    desc: "Scies longues et chevaux de débardage : deux fois plus de bras, des coupes plus larges.",
  }),
  forester_hut: b({
    id: 'forester_hut',
    name: 'Hutte du forestier',
    category: 'gathering',
    size: [2, 2],
    cost: { logs: 10, planks: 4 },
    goldCost: 10,
    buildWork: 50,
    workers: 2,
    profession: 'forester',
    placement: { kind: 'land' },
    requires: 'r_forestry',
    tier: 1,
    fireRisk: 0.8,
    desc: "Replante les arbres dans son rayon. La clé d'une forêt qui ne s'épuise jamais.",
  }),
  gatherer_hut: b({
    id: 'gatherer_hut',
    name: 'Hutte du cueilleur',
    category: 'gathering',
    size: [2, 2],
    cost: { logs: 6 },
    goldCost: 0,
    buildWork: 30,
    workers: 2,
    profession: 'gatherer',
    placement: { kind: 'land' },
    gather: { nodes: ['berry_bush'], radius: 13, work: 8, outputs: { berries: 5 } },
    storage: { capacity: 40, accepts: ['berries'] },
    tier: 1,
    fireRisk: 0.9,
    desc: "Baies et racines de sous-bois. La première nourriture du village.",
  }),
  hunter_camp: b({
    id: 'hunter_camp',
    name: 'Camp de chasse',
    category: 'gathering',
    size: [2, 2],
    cost: { logs: 12, planks: 4 },
    goldCost: 15,
    buildWork: 55,
    workers: 2,
    profession: 'hunter',
    placement: { kind: 'land' },
    requires: 'r_hunting',
    gather: { nodes: ['wild_animal'], radius: 22, work: 14, outputs: { game: 2 } },
    storage: { capacity: 30, accepts: ['game', 'arrows'] },
    upgradesTo: 'hunting_lodge',
    tier: 1,
    fireRisk: 0.9,
    desc: "Traque biches et sangliers. Le gibier brut doit passer par la boucherie.",
  }),
  hunting_lodge: b({
    id: 'hunting_lodge',
    name: 'Pavillon de chasse',
    category: 'gathering',
    size: [3, 3],
    cost: { planks: 20, leather: 6 },
    goldCost: 60,
    buildWork: 120,
    workers: 4,
    profession: 'hunter',
    placement: { kind: 'land' },
    requires: 'r_fletching',
    gather: {
      nodes: ['wild_animal'],
      radius: 30,
      work: 10,
      outputs: { game: 3, hide: 1 },
      consumes: { arrows: 2 },
    },
    storage: { capacity: 60, accepts: ['game', 'hide', 'arrows'] },
    tier: 2,
    fireRisk: 0.8,
    desc: "Arcs longs et flèches empennées : bien plus de gibier, mais il faut des flèches.",
  }),
  fisher_hut: b({
    id: 'fisher_hut',
    name: 'Cabane de pêche',
    category: 'gathering',
    size: [2, 2],
    cost: { logs: 10 },
    goldCost: 0,
    buildWork: 40,
    workers: 2,
    profession: 'fisher',
    placement: { kind: 'shore' },
    requires: 'r_fishing',
    gather: { nodes: ['fish_shoal'], radius: 12, work: 11, outputs: { fish: 3 } },
    storage: { capacity: 40, accepts: ['fish'] },
    upgradesTo: 'fishing_pier',
    tier: 1,
    fireRisk: 0.7,
    desc: "Une canne, un seau, beaucoup de patience.",
  }),
  fishing_pier: b({
    id: 'fishing_pier',
    name: 'Ponton de pêche',
    category: 'gathering',
    size: [3, 3],
    cost: { planks: 16 },
    goldCost: 30,
    buildWork: 85,
    workers: 3,
    profession: 'fisher',
    placement: { kind: 'shore' },
    requires: 'r_nets',
    gather: { nodes: ['fish_shoal'], radius: 17, work: 9, outputs: { fish: 5 } },
    storage: { capacity: 60, accepts: ['fish'] },
    upgradesTo: 'fishing_dock',
    tier: 2,
    fireRisk: 0.7,
    desc: "Filets tendus depuis le ponton. Le rendement double.",
  }),
  fishing_dock: b({
    id: 'fishing_dock',
    name: 'Appontement',
    category: 'gathering',
    size: [4, 4],
    cost: { planks: 30, cloth: 8, iron_ingot: 4 },
    goldCost: 110,
    buildWork: 160,
    workers: 5,
    profession: 'fisher',
    placement: { kind: 'shore' },
    requires: 'r_fishing_boats',
    gather: { nodes: ['fish_shoal'], radius: 26, work: 7, outputs: { fish: 8 } },
    storage: { capacity: 110, accepts: ['fish'] },
    upgradesTo: 'fishing_harbour',
    tier: 3,
    fireRisk: 0.7,
    desc: "Barques de pêche : les bancs les plus lointains deviennent accessibles.",
  }),
  fishing_harbour: b({
    id: 'fishing_harbour',
    name: 'Port de pêche',
    category: 'gathering',
    size: [5, 5],
    cost: { planks: 55, stone: 40, cloth: 18, iron_ingot: 12 },
    goldCost: 320,
    buildWork: 280,
    workers: 8,
    profession: 'fisher',
    placement: { kind: 'shore' },
    requires: 'r_harbour',
    gather: { nodes: ['fish_shoal'], radius: 38, work: 5.5, outputs: { fish: 12 } },
    storage: { capacity: 220, accepts: ['fish'] },
    tier: 4,
    fireRisk: 0.6,
    desc: "Chalutiers à voile, cales pleines. De quoi nourrir une cité entière.",
  }),

  // ── Extraction ──────────────────────────────────────────────────────────
  quarry: b({
    id: 'quarry',
    name: 'Carrière',
    category: 'gathering',
    size: [3, 3],
    cost: { logs: 16 },
    goldCost: 10,
    buildWork: 70,
    workers: 3,
    profession: 'quarrier',
    placement: { kind: 'deposit', node: 'stone_rock' },
    requires: 'r_quarrying',
    gather: { nodes: ['stone_rock'], radius: 9, work: 12, outputs: { stone: 4 } },
    storage: { capacity: 60, accepts: ['stone'] },
    upgradesTo: 'great_quarry',
    tier: 1,
    fireRisk: 0.2,
    desc: "À bâtir directement sur un affleurement rocheux.",
  }),
  great_quarry: b({
    id: 'great_quarry',
    name: 'Grande carrière',
    category: 'gathering',
    size: [4, 4],
    cost: { planks: 24, tools: 6 },
    goldCost: 90,
    buildWork: 150,
    workers: 6,
    profession: 'quarrier',
    placement: { kind: 'deposit', node: 'stone_rock' },
    requires: 'r_heavy_quarrying',
    gather: { nodes: ['stone_rock'], radius: 14, work: 8, outputs: { stone: 7 } },
    storage: { capacity: 140, accepts: ['stone'] },
    tier: 2,
    fireRisk: 0.2,
    desc: "Treuils et coins d'acier : la roche cède bien plus vite.",
  }),
  clay_pit: b({
    id: 'clay_pit',
    name: "Fosse d'argile",
    category: 'gathering',
    size: [3, 3],
    cost: { logs: 12 },
    goldCost: 5,
    buildWork: 55,
    workers: 2,
    profession: 'quarrier',
    placement: { kind: 'deposit', node: 'clay_patch' },
    requires: 'r_clay_working',
    gather: { nodes: ['clay_patch'], radius: 9, work: 9, outputs: { clay: 5 } },
    storage: { capacity: 60, accepts: ['clay'] },
    tier: 1,
    fireRisk: 0.2,
    desc: "Les berges regorgent d'argile grasse.",
  }),
  coal_mine: b({
    id: 'coal_mine',
    name: 'Mine de charbon',
    category: 'gathering',
    size: [3, 3],
    cost: { planks: 20, logs: 10 },
    goldCost: 40,
    buildWork: 110,
    workers: 4,
    profession: 'miner',
    placement: { kind: 'deposit', node: 'coal_vein' },
    requires: 'r_mining',
    gather: { nodes: ['coal_vein'], radius: 7, work: 13, outputs: { coal: 4 } },
    storage: { capacity: 70, accepts: ['coal'] },
    upgradesTo: 'deep_mine',
    tier: 1,
    fireRisk: 1.5,
    desc: "Galeries étayées. Le charbon alimente fours et forges.",
  }),
  iron_mine: b({
    id: 'iron_mine',
    name: 'Mine de fer',
    category: 'gathering',
    size: [3, 3],
    cost: { planks: 24, tools: 3 },
    goldCost: 70,
    buildWork: 130,
    workers: 4,
    profession: 'miner',
    placement: { kind: 'deposit', node: 'iron_vein' },
    requires: 'r_iron_working',
    gather: { nodes: ['iron_vein'], radius: 7, work: 15, outputs: { iron_ore: 3 } },
    storage: { capacity: 70, accepts: ['iron_ore'] },
    upgradesTo: 'deep_mine',
    tier: 1,
    fireRisk: 1.0,
    desc: "Le fer change tout : outils, clous, socs de charrue.",
  }),
  gold_mine: b({
    id: 'gold_mine',
    name: "Mine d'or",
    category: 'gathering',
    size: [3, 3],
    cost: { planks: 30, iron_ingot: 8, tools: 5 },
    goldCost: 180,
    buildWork: 180,
    workers: 4,
    profession: 'miner',
    placement: { kind: 'deposit', node: 'gold_vein' },
    requires: 'r_gold_prospecting',
    gather: { nodes: ['gold_vein'], radius: 6, work: 20, outputs: { gold_ore: 2 } },
    storage: { capacity: 50, accepts: ['gold_ore'] },
    upgradesTo: 'deep_mine',
    tier: 1,
    fireRisk: 1.0,
    desc: "Filon rare et jalousé. La fortune du village.",
  }),
  deep_mine: b({
    id: 'deep_mine',
    name: 'Mine profonde',
    category: 'gathering',
    size: [4, 4],
    cost: { planks: 40, iron_ingot: 14, tools: 10 },
    goldCost: 260,
    buildWork: 230,
    workers: 7,
    profession: 'miner',
    placement: { kind: 'deposit', node: 'coal_vein' },
    requires: 'r_deep_mining',
    gather: {
      nodes: ['coal_vein', 'iron_vein', 'gold_vein'],
      radius: 12,
      work: 10,
      outputs: {},
    },
    storage: { capacity: 160, accepts: ['coal', 'iron_ore', 'gold_ore'] },
    tier: 2,
    fireRisk: 1.2,
    desc: "Puits profond, pompes et monte-charges. Exploite n'importe quel filon, deux fois plus vite.",
  }),

  // ── Farming & livestock ────────────────────────────────────────────────
  wheat_field: b({
    id: 'wheat_field',
    name: 'Champ de blé',
    category: 'farming',
    size: [4, 4],
    cost: { logs: 6 },
    goldCost: 5,
    buildWork: 40,
    workers: 3,
    profession: 'farmer',
    placement: { kind: 'land' },
    requires: 'r_agriculture',
    recipe: { inputs: {}, outputs: { wheat: 10 }, work: 22 },
    storage: { capacity: 60, accepts: ['wheat'] },
    tier: 1,
    fireRisk: 1.6,
    desc: "Semé au printemps, moissonné à l'automne. Le rendement suit les saisons.",
  }),
  flax_field: b({
    id: 'flax_field',
    name: 'Champ de lin',
    category: 'farming',
    size: [4, 4],
    cost: { logs: 6 },
    goldCost: 10,
    buildWork: 40,
    workers: 3,
    profession: 'farmer',
    placement: { kind: 'land' },
    requires: 'r_flax',
    recipe: { inputs: {}, outputs: { flax: 8 }, work: 22 },
    storage: { capacity: 60, accepts: ['flax'] },
    tier: 1,
    fireRisk: 1.5,
    desc: "Fibre textile qui ne dépend pas des troupeaux.",
  }),
  chicken_coop: b({
    id: 'chicken_coop',
    name: 'Poulailler',
    category: 'farming',
    size: [3, 3],
    cost: { planks: 10, logs: 8 },
    goldCost: 30,
    buildWork: 60,
    workers: 2,
    profession: 'shepherd',
    placement: { kind: 'land' },
    requires: 'r_husbandry_fowl',
    livestock: { animal: 'chicken', capacity: 12 },
    recipe: { inputs: { wheat: 1 }, outputs: { eggs: 4, feathers: 2 }, work: 14 },
    storage: { capacity: 50, accepts: ['eggs', 'feathers', 'wheat'] },
    tier: 1,
    fireRisk: 1.1,
    desc: "Œufs frais et plumes pour les flèches. Un peu de blé suffit à les nourrir.",
  }),
  sheep_pasture: b({
    id: 'sheep_pasture',
    name: 'Bergerie',
    category: 'farming',
    size: [5, 5],
    cost: { planks: 18, logs: 12 },
    goldCost: 70,
    buildWork: 95,
    workers: 3,
    profession: 'shepherd',
    placement: { kind: 'land' },
    requires: 'r_husbandry_sheep',
    livestock: { animal: 'sheep', capacity: 10 },
    recipe: { inputs: { wheat: 2 }, outputs: { wool: 4, game: 1 }, work: 20 },
    storage: { capacity: 60, accepts: ['wool', 'game', 'wheat'] },
    tier: 1,
    fireRisk: 1.0,
    desc: "Laine tondue chaque saison, et de la viande quand il faut.",
  }),
  cattle_pasture: b({
    id: 'cattle_pasture',
    name: 'Pâturage à bovins',
    category: 'farming',
    size: [6, 6],
    cost: { planks: 28, stone: 12 },
    goldCost: 140,
    buildWork: 140,
    workers: 4,
    profession: 'shepherd',
    placement: { kind: 'land' },
    requires: 'r_husbandry_cattle',
    livestock: { animal: 'cattle', capacity: 8 },
    recipe: { inputs: { wheat: 4 }, outputs: { game: 3, hide: 2 }, work: 26 },
    storage: { capacity: 80, accepts: ['game', 'hide', 'wheat'] },
    tier: 1,
    fireRisk: 0.9,
    desc: "Viande en quantité et peaux épaisses pour les tanneurs.",
  }),

  // ── Industry ────────────────────────────────────────────────────────────
  sawmill: b({
    id: 'sawmill',
    name: 'Scierie',
    category: 'industry',
    size: [3, 3],
    cost: { logs: 22 },
    goldCost: 0,
    buildWork: 75,
    workers: 3,
    profession: 'sawyer',
    placement: { kind: 'land' },
    recipe: { inputs: { logs: 2 }, outputs: { planks: 3 }, work: 8 },
    storage: { capacity: 80, accepts: ['logs', 'planks'] },
    upgradesTo: 'water_sawmill',
    tier: 1,
    fireRisk: 1.3,
    desc: "Transforme les rondins en planches. Sans elle, rien ne se construit vraiment.",
  }),
  water_sawmill: b({
    id: 'water_sawmill',
    name: 'Scierie hydraulique',
    category: 'industry',
    size: [4, 4],
    cost: { planks: 30, stone: 18, iron_ingot: 6 },
    goldCost: 120,
    buildWork: 160,
    workers: 4,
    profession: 'sawyer',
    placement: { kind: 'shore' },
    requires: 'r_water_power',
    recipe: { inputs: { logs: 3 }, outputs: { planks: 6 }, work: 7 },
    storage: { capacity: 160, accepts: ['logs', 'planks'] },
    tier: 2,
    fireRisk: 1.0,
    desc: "La roue à aubes travaille jour et nuit : deux fois plus de planches par rondin.",
  }),
  charcoal_burner: b({
    id: 'charcoal_burner',
    name: 'Charbonnière',
    category: 'industry',
    size: [2, 2],
    cost: { logs: 10, stone: 6 },
    goldCost: 10,
    buildWork: 45,
    workers: 2,
    profession: 'smelter',
    placement: { kind: 'land' },
    requires: 'r_charcoal',
    recipe: { inputs: { logs: 3 }, outputs: { charcoal: 2 }, work: 12 },
    storage: { capacity: 50, accepts: ['logs', 'charcoal'] },
    tier: 1,
    fireRisk: 2.4,
    desc: "Du combustible sans creuser une seule mine — mais quel risque d'incendie.",
  }),
  brick_kiln: b({
    id: 'brick_kiln',
    name: 'Four à briques',
    category: 'industry',
    size: [3, 3],
    cost: { stone: 18, planks: 10 },
    goldCost: 40,
    buildWork: 90,
    workers: 3,
    profession: 'mason',
    placement: { kind: 'land' },
    requires: 'r_clay_working',
    recipe: { inputs: { clay: 3, charcoal: 1 }, outputs: { bricks: 4 }, work: 12 },
    storage: { capacity: 70, accepts: ['clay', 'charcoal', 'coal', 'bricks'] },
    tier: 1,
    fireRisk: 2.0,
    desc: "Argile cuite en briques rouges, matériau des bâtiments de prestige.",
  }),
  smelter: b({
    id: 'smelter',
    name: 'Fonderie',
    category: 'industry',
    size: [3, 3],
    cost: { stone: 26, planks: 14 },
    goldCost: 80,
    buildWork: 120,
    workers: 3,
    profession: 'smelter',
    placement: { kind: 'land' },
    requires: 'r_iron_working',
    recipe: { inputs: { iron_ore: 2, charcoal: 1 }, outputs: { iron_ingot: 1 }, work: 14, label: 'Fer' },
    recipes: [
      { inputs: { iron_ore: 2, charcoal: 1 }, outputs: { iron_ingot: 1 }, work: 14, label: 'Fer' },
      { inputs: { gold_ore: 2, charcoal: 1 }, outputs: { gold_ingot: 1 }, work: 20, label: 'Or' },
    ],
    storage: { capacity: 80, accepts: ['iron_ore', 'gold_ore', 'charcoal', 'coal', 'iron_ingot', 'gold_ingot'] },
    tier: 1,
    fireRisk: 2.6,
    desc: "Haut fourneau. Minerai + combustible = lingots.",
  }),
  blacksmith: b({
    id: 'blacksmith',
    name: 'Forge',
    category: 'crafting',
    size: [3, 3],
    cost: { stone: 20, planks: 16 },
    goldCost: 90,
    buildWork: 120,
    workers: 2,
    profession: 'blacksmith',
    placement: { kind: 'land' },
    requires: 'r_blacksmithing',
    recipe: { inputs: { iron_ingot: 1, planks: 1, coal: 1 }, outputs: { tools: 2 }, work: 18 },
    storage: { capacity: 60, accepts: ['iron_ingot', 'planks', 'coal', 'charcoal', 'tools'] },
    tier: 1,
    fireRisk: 2.2,
    desc: "Les outils accélèrent tous vos récolteurs. Un investissement qui se rembourse vite.",
  }),
  goldsmith: b({
    id: 'goldsmith',
    name: "Atelier d'orfèvre",
    category: 'crafting',
    size: [2, 2],
    cost: { bricks: 16, planks: 12, iron_ingot: 4 },
    goldCost: 200,
    buildWork: 140,
    workers: 2,
    profession: 'goldsmith',
    placement: { kind: 'land' },
    requires: 'r_goldsmithing',
    recipe: { inputs: { gold_ingot: 1, coal: 1 }, outputs: { jewellery: 1 }, work: 26 },
    storage: { capacity: 40, accepts: ['gold_ingot', 'gold_ore', 'coal', 'jewellery'] },
    tier: 1,
    fireRisk: 1.6,
    desc: "Bagues et reliquaires. L'objet le plus cher que votre village puisse vendre.",
  }),
  butcher: b({
    id: 'butcher',
    name: 'Boucherie',
    category: 'crafting',
    size: [2, 2],
    cost: { logs: 14, planks: 6 },
    goldCost: 20,
    buildWork: 60,
    workers: 2,
    profession: 'butcher',
    placement: { kind: 'land' },
    requires: 'r_butchery',
    recipe: { inputs: { game: 1 }, outputs: { meat: 3, hide: 1 }, work: 9 },
    storage: { capacity: 60, accepts: ['game', 'meat', 'hide'] },
    tier: 1,
    fireRisk: 1.1,
    desc: "Le gibier n'est pas mangeable tel quel : il passe d'abord par l'étal du boucher.",
  }),
  smokehouse: b({
    id: 'smokehouse',
    name: 'Fumoir',
    category: 'crafting',
    size: [2, 2],
    cost: { logs: 12, stone: 8 },
    goldCost: 25,
    buildWork: 60,
    workers: 2,
    profession: 'butcher',
    placement: { kind: 'land' },
    requires: 'r_food_preservation',
    recipe: { inputs: { fish: 2, charcoal: 1 }, outputs: { smoked_fish: 2 }, work: 10 },
    storage: { capacity: 60, accepts: ['fish', 'charcoal', 'coal', 'smoked_fish'] },
    tier: 1,
    fireRisk: 2.0,
    desc: "Le poisson fumé se garde tout l'hiver et nourrit deux fois mieux.",
  }),
  windmill: b({
    id: 'windmill',
    name: 'Moulin à vent',
    category: 'industry',
    size: [3, 3],
    cost: { planks: 22, stone: 14, cloth: 4 },
    goldCost: 60,
    buildWork: 120,
    workers: 2,
    profession: 'miller',
    placement: { kind: 'land' },
    requires: 'r_milling',
    recipe: { inputs: { wheat: 3 }, outputs: { flour: 2 }, work: 10 },
    storage: { capacity: 80, accepts: ['wheat', 'flour'] },
    tier: 1,
    fireRisk: 1.4,
    desc: "Ses ailes tournent au-dessus des toits. Le blé devient farine.",
  }),
  bakery: b({
    id: 'bakery',
    name: 'Boulangerie',
    category: 'crafting',
    size: [2, 2],
    cost: { stone: 16, planks: 10 },
    goldCost: 45,
    buildWork: 85,
    workers: 2,
    profession: 'baker',
    placement: { kind: 'land' },
    requires: 'r_baking',
    recipe: { inputs: { flour: 2, charcoal: 1 }, outputs: { bread: 5 }, work: 11 },
    storage: { capacity: 70, accepts: ['flour', 'charcoal', 'coal', 'bread'] },
    tier: 1,
    fireRisk: 2.2,
    desc: "La chaîne blé → farine → pain nourrit trois fois plus de monde que les baies.",
  }),
  brewery: b({
    id: 'brewery',
    name: 'Brasserie',
    category: 'crafting',
    size: [3, 3],
    cost: { planks: 20, stone: 12 },
    goldCost: 70,
    buildWork: 100,
    workers: 2,
    profession: 'brewer',
    placement: { kind: 'land' },
    requires: 'r_brewing',
    recipe: { inputs: { wheat: 3 }, outputs: { ale: 3 }, work: 14 },
    storage: { capacity: 70, accepts: ['wheat', 'ale'] },
    tier: 1,
    fireRisk: 1.5,
    desc: "Rien ne remonte le moral d'un village comme une bonne cervoise.",
  }),
  weaver: b({
    id: 'weaver',
    name: 'Atelier de tissage',
    category: 'crafting',
    size: [2, 2],
    cost: { planks: 14, logs: 8 },
    goldCost: 40,
    buildWork: 75,
    workers: 2,
    profession: 'weaver',
    placement: { kind: 'land' },
    requires: 'r_weaving',
    recipe: { inputs: { wool: 2 }, outputs: { cloth: 2 }, work: 12, label: 'Laine' },
    recipes: [
      { inputs: { wool: 2 }, outputs: { cloth: 2 }, work: 12, label: 'Laine' },
      { inputs: { flax: 3 }, outputs: { cloth: 2 }, work: 13, label: 'Lin' },
    ],
    storage: { capacity: 60, accepts: ['wool', 'flax', 'cloth'] },
    tier: 1,
    fireRisk: 1.3,
    desc: "Laine ou lin : le métier à tisser accepte les deux.",
  }),
  tailor: b({
    id: 'tailor',
    name: 'Atelier de couture',
    category: 'crafting',
    size: [2, 2],
    cost: { planks: 16, cloth: 4 },
    goldCost: 60,
    buildWork: 80,
    workers: 2,
    profession: 'tailor',
    placement: { kind: 'land' },
    requires: 'r_tailoring',
    recipe: { inputs: { cloth: 2, feathers: 1 }, outputs: { clothes: 2 }, work: 15 },
    storage: { capacity: 50, accepts: ['cloth', 'feathers', 'clothes'] },
    tier: 1,
    fireRisk: 1.2,
    desc: "Des vêtements chauds font des villageois heureux, surtout en hiver.",
  }),
  tannery: b({
    id: 'tannery',
    name: 'Tannerie',
    category: 'crafting',
    size: [3, 3],
    cost: { planks: 18, stone: 10 },
    goldCost: 55,
    buildWork: 85,
    workers: 2,
    profession: 'tanner',
    placement: { kind: 'shore' },
    requires: 'r_tanning',
    recipe: { inputs: { hide: 2 }, outputs: { leather: 2 }, work: 13 },
    storage: { capacity: 60, accepts: ['hide', 'leather'] },
    tier: 1,
    fireRisk: 1.0,
    desc: "À construire au bord de l'eau — et loin des maisons, l'odeur est terrible.",
  }),
  cobbler: b({
    id: 'cobbler',
    name: 'Cordonnerie',
    category: 'crafting',
    size: [2, 2],
    cost: { planks: 14, leather: 4 },
    goldCost: 60,
    buildWork: 75,
    workers: 2,
    profession: 'cobbler',
    placement: { kind: 'land' },
    requires: 'r_cobbling',
    recipe: { inputs: { leather: 2 }, outputs: { boots: 2 }, work: 14 },
    storage: { capacity: 50, accepts: ['leather', 'boots'] },
    tier: 1,
    fireRisk: 1.1,
    desc: "Des bottes solides : villageois plus rapides et plus heureux.",
  }),
  carpenter: b({
    id: 'carpenter',
    name: 'Menuiserie',
    category: 'crafting',
    size: [3, 3],
    cost: { planks: 20, logs: 10 },
    goldCost: 50,
    buildWork: 90,
    workers: 2,
    profession: 'carpenter',
    placement: { kind: 'land' },
    requires: 'r_carpentry',
    recipe: { inputs: { planks: 3 }, outputs: { furniture: 1 }, work: 16 },
    storage: { capacity: 60, accepts: ['planks', 'furniture'] },
    tier: 1,
    fireRisk: 1.4,
    desc: "Meubles pour les foyers. Une maison meublée vaut deux maisons vides.",
  }),
  fletcher: b({
    id: 'fletcher',
    name: 'Atelier du fléchier',
    category: 'crafting',
    size: [2, 2],
    cost: { planks: 14, logs: 6 },
    goldCost: 45,
    buildWork: 70,
    workers: 2,
    profession: 'fletcher',
    placement: { kind: 'land' },
    requires: 'r_fletching',
    recipe: { inputs: { planks: 1, feathers: 2 }, outputs: { arrows: 6 }, work: 11 },
    storage: { capacity: 60, accepts: ['planks', 'feathers', 'arrows'] },
    tier: 1,
    fireRisk: 1.2,
    desc: "Sans flèches, vos pavillons de chasse restent à l'arrêt.",
  }),
  chandlery: b({
    id: 'chandlery',
    name: 'Cirerie',
    category: 'crafting',
    size: [2, 2],
    cost: { planks: 14, stone: 8 },
    goldCost: 60,
    buildWork: 75,
    workers: 2,
    profession: 'chandler',
    placement: { kind: 'land' },
    requires: 'r_chandlery',
    recipe: { inputs: { cloth: 1, charcoal: 1 }, outputs: { candles: 4 }, work: 12 },
    storage: { capacity: 50, accepts: ['cloth', 'charcoal', 'coal', 'candles'] },
    tier: 1,
    fireRisk: 1.9,
    desc: "Mèche de toile et suif fondu : les soirées d'hiver deviennent vivables.",
  }),

  // ── Services ────────────────────────────────────────────────────────────
  market: b({
    id: 'market',
    name: 'Marché',
    category: 'service',
    size: [4, 4],
    cost: { planks: 16, cloth: 4 },
    goldCost: 40,
    buildWork: 85,
    workers: 3,
    profession: 'merchant',
    placement: { kind: 'land' },
    requires: 'r_marketplace',
    service: { kind: 'market', radius: 22, strength: 1 },
    storage: { capacity: 260, global: false },
    upgradesTo: 'grand_market',
    tier: 1,
    fireRisk: 1.1,
    desc: "Les foyers dans son rayon viennent y chercher vivres et confort. Sans marché, on ne mange que ce qui traîne.",
  }),
  grand_market: b({
    id: 'grand_market',
    name: 'Grand marché',
    category: 'service',
    size: [5, 5],
    cost: { planks: 34, stone: 20, cloth: 14 },
    goldCost: 160,
    buildWork: 170,
    workers: 6,
    profession: 'merchant',
    placement: { kind: 'land' },
    requires: 'r_grand_market',
    service: { kind: 'market', radius: 34, strength: 1.5 },
    storage: { capacity: 600, global: false },
    tier: 2,
    fireRisk: 1.0,
    desc: "Halles couvertes, étals permanents. Le ventre de la cité.",
  }),
  trade_post: b({
    id: 'trade_post',
    name: 'Comptoir de commerce',
    category: 'service',
    size: [3, 3],
    cost: { planks: 24, stone: 12 },
    goldCost: 120,
    buildWork: 120,
    workers: 3,
    profession: 'merchant',
    placement: { kind: 'land' },
    requires: 'r_trade_post',
    storage: { capacity: 400, global: true },
    tier: 1,
    fireRisk: 0.9,
    desc: "Ouvre les routes commerciales. Achetez ce qui vous manque, vendez vos surplus.",
  }),
  chapel: b({
    id: 'chapel',
    name: 'Chapelle',
    category: 'service',
    size: [3, 3],
    cost: { stone: 30, planks: 14 },
    goldCost: 90,
    buildWork: 140,
    workers: 1,
    profession: 'priest',
    placement: { kind: 'land' },
    requires: 'r_faith',
    service: { kind: 'faith', radius: 26, strength: 1 },
    storage: { capacity: 40, accepts: ['candles'] },
    tier: 1,
    fireRisk: 0.6,
    desc: "Un clocher rassure. Les chandelles allumées renforcent son effet.",
  }),
  tavern: b({
    id: 'tavern',
    name: 'Taverne',
    category: 'service',
    size: [3, 3],
    cost: { planks: 24, stone: 10 },
    goldCost: 100,
    buildWork: 120,
    workers: 2,
    profession: 'innkeeper',
    placement: { kind: 'land' },
    requires: 'r_tavern',
    service: { kind: 'tavern', radius: 24, strength: 1 },
    storage: { capacity: 80, accepts: ['ale', 'bread', 'meat'] },
    tier: 1,
    fireRisk: 1.6,
    desc: "Consomme de la bière et rend le bonheur. Elle rapporte aussi un peu d'or.",
  }),
  scholars_hall: b({
    id: 'scholars_hall',
    name: 'Maison des érudits',
    category: 'civic',
    size: [3, 3],
    cost: { planks: 26, stone: 20 },
    goldCost: 130,
    buildWork: 150,
    workers: 3,
    profession: 'scholar',
    placement: { kind: 'land' },
    requires: 'r_scholarship',
    service: { kind: 'research', radius: 0, strength: 3 },
    storage: { capacity: 40, accepts: ['candles'] },
    tier: 1,
    fireRisk: 1.0,
    desc: "Accélère fortement la recherche. C'est ici qu'on décide de l'avenir du village.",
  }),
  well: b({
    id: 'well',
    name: 'Puits',
    category: 'infrastructure',
    size: [1, 1],
    cost: { stone: 8 },
    goldCost: 5,
    buildWork: 30,
    workers: 0,
    profession: 'idle',
    placement: { kind: 'land' },
    service: { kind: 'water', radius: 16, strength: 1 },
    tier: 1,
    fireRisk: 0,
    desc: "Les villageois s'en servent pour éteindre les départs de feu. Indispensable.",
  }),
  firewatch: b({
    id: 'firewatch',
    name: 'Tour de guet',
    category: 'service',
    size: [2, 2],
    cost: { planks: 20, stone: 14 },
    goldCost: 80,
    buildWork: 110,
    workers: 3,
    profession: 'firewarden',
    placement: { kind: 'land' },
    requires: 'r_firewatch',
    service: { kind: 'fire', radius: 40, strength: 3 },
    tier: 1,
    fireRisk: 0.3,
    desc: "Une équipe de guetteurs intervient sur tout incendie dans un large rayon.",
  }),
  healer_hut: b({
    id: 'healer_hut',
    name: "Maison de l'herboriste",
    category: 'service',
    size: [2, 2],
    cost: { planks: 16, cloth: 6 },
    goldCost: 70,
    buildWork: 90,
    workers: 2,
    profession: 'healer',
    placement: { kind: 'land' },
    requires: 'r_herbalism',
    service: { kind: 'health', radius: 30, strength: 1 },
    storage: { capacity: 40, accepts: ['berries', 'cloth'] },
    tier: 1,
    fireRisk: 0.8,
    desc: "Soigne les malades et raccourcit les épidémies.",
  }),

  // ── Infrastructure ──────────────────────────────────────────────────────
  dirt_path: b({
    id: 'dirt_path',
    name: 'Sentier',
    category: 'infrastructure',
    size: [1, 1],
    cost: {},
    goldCost: 1,
    buildWork: 3,
    workers: 0,
    profession: 'idle',
    placement: { kind: 'paint' },
    requires: 'r_paths',
    tier: 1,
    fireRisk: 0,
    desc: "+35 % de vitesse de déplacement. Le plus rentable des aménagements.",
  }),
  cobbled_road: b({
    id: 'cobbled_road',
    name: 'Route pavée',
    category: 'infrastructure',
    size: [1, 1],
    cost: { stone: 1 },
    goldCost: 2,
    buildWork: 6,
    workers: 0,
    profession: 'idle',
    placement: { kind: 'paint' },
    requires: 'r_cobbled_roads',
    tier: 2,
    fireRisk: 0,
    desc: "+80 % de vitesse. Les porteurs traversent la cité en un rien de temps.",
  }),
};

export const ALL_BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export const BUILDINGS_BY_CATEGORY = (() => {
  const map = new Map<BuildingCategory, BuildingDef[]>();
  for (const id of ALL_BUILDING_IDS) {
    const d = BUILDINGS[id];
    if (!map.has(d.category)) map.set(d.category, []);
    map.get(d.category)!.push(d);
  }
  return map;
})();

export const CATEGORY_LABELS: Record<BuildingCategory, { name: string; icon: string }> = {
  civic: { name: 'Civique', icon: '🏛️' },
  housing: { name: 'Habitations', icon: '🏠' },
  storage: { name: 'Stockage', icon: '📦' },
  gathering: { name: 'Récolte', icon: '🪓' },
  farming: { name: 'Agriculture', icon: '🌾' },
  industry: { name: 'Industrie', icon: '⚙️' },
  crafting: { name: 'Artisanat', icon: '🔨' },
  service: { name: 'Services', icon: '⛪' },
  infrastructure: { name: 'Voirie', icon: '🛤️' },
};

/** Buildings available with no research at all. */
export const STARTER_BUILDINGS: BuildingId[] = ALL_BUILDING_IDS.filter(
  (id) => !BUILDINGS[id].requires && BUILDINGS[id].id !== 'town_hall',
);
