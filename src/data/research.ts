import type { BuildingId } from './buildings';
import type { ProfessionId } from './professions';

export type ResearchBranch = 'survival' | 'forest' | 'stone' | 'farm' | 'craft' | 'city';

export type ResearchEffect =
  | { kind: 'work_speed'; profession?: ProfessionId; mul: number }
  | { kind: 'gather_yield'; profession?: ProfessionId; mul: number }
  | { kind: 'craft_yield'; mul: number }
  | { kind: 'move_speed'; mul: number }
  | { kind: 'carry_capacity'; mul: number }
  | { kind: 'happiness'; add: number }
  | { kind: 'food_upkeep'; mul: number }
  | { kind: 'trade_tier'; value: number }
  | { kind: 'deposit_richness'; mul: number }
  | { kind: 'research_rate'; mul: number }
  | { kind: 'fire_risk'; mul: number }
  | { kind: 'disease_resist'; mul: number }
  | { kind: 'build_speed'; mul: number }
  | { kind: 'storage'; mul: number };

export interface ResearchDef {
  id: ResearchId;
  name: string;
  branch: ResearchBranch;
  /**
   * Era, 1 upward. An era opens only once every study in the previous one is
   * finished, which keeps the tree readable and guarantees that a chain is
   * never half-unlocked — no hunting without a butcher to make the meat
   * edible.
   */
  tier: number;
  icon: string;
  /** Cost in coin. Research is funded by taxes, not by an abstract currency. */
  cost: number;
  /** Seconds of study, before the scholars' speed bonus. */
  duration: number;
  unlocks: BuildingId[];
  effects: ResearchEffect[];
  desc: string;
}

export type ResearchId =
  // ── Era 1 : premiers feux ──────────────────────────────────────────────
  | 'r_forestry'
  | 'r_hunting'
  | 'r_fishing'
  | 'r_quarrying'
  | 'r_paths'
  | 'r_cottages'
  | 'r_marketplace'
  // ── Era 2 : le pain quotidien ─────────────────────────────────────────
  | 'r_agriculture'
  | 'r_milling'
  | 'r_charcoal'
  | 'r_food_preservation'
  | 'r_carpentry'
  | 'r_husbandry_fowl'
  | 'r_lumber_camp'
  // ── Era 3 : métiers et échanges ───────────────────────────────────────
  | 'r_weaving'
  | 'r_tanning'
  | 'r_husbandry_sheep'
  | 'r_mining'
  | 'r_trade_post'
  | 'r_nets'
  | 'r_faith'
  | 'r_cobbled_roads'
  // ── Era 4 : l'âge du fer ──────────────────────────────────────────────
  | 'r_iron_working'
  | 'r_blacksmithing'
  | 'r_clay_working'
  | 'r_masonry_homes'
  | 'r_fletching'
  | 'r_brewing'
  | 'r_husbandry_cattle'
  | 'r_logistics'
  | 'r_trade_routes'
  | 'r_firewatch'
  | 'r_herbalism'
  // ── Era 5 : la cité ───────────────────────────────────────────────────
  | 'r_gold_prospecting'
  | 'r_goldsmithing'
  | 'r_deep_mining'
  | 'r_water_power'
  | 'r_grand_market'
  | 'r_burgher_manors'
  | 'r_fishing_boats'
  | 'r_harbour'
  | 'r_guild_charter'
  | 'r_chandlery'
  | 'r_crop_rotation'
  | 'r_heavy_quarrying'
  | 'r_flax';

const r = (d: ResearchDef): ResearchDef => d;

export const RESEARCH: Record<ResearchId, ResearchDef> = {
  // ══ Era 1 ═══════════════════════════════════════════════════════════════
  r_forestry: r({
    id: 'r_forestry',
    name: 'Sylviculture',
    branch: 'forest',
    tier: 1,
    icon: 'sapling',
    cost: 45,
    duration: 60,
    unlocks: ['forester_hut'],
    effects: [],
    desc: "Replanter ce qu'on abat. Sans forestier, vos bûcherons finiront par annoncer qu'il n'y a plus rien à couper.",
  }),
  r_hunting: r({
    id: 'r_hunting',
    name: 'Chasse et boucherie',
    branch: 'survival',
    tier: 1,
    icon: 'bow',
    cost: 60,
    duration: 75,
    unlocks: ['hunter_camp', 'butcher'],
    effects: [],
    desc: 'Traquer le gibier et le débiter en viande. Les deux vont ensemble : une carcasse ne se mange pas telle quelle.',
  }),
  r_fishing: r({
    id: 'r_fishing',
    name: 'Pêche à la ligne',
    branch: 'survival',
    tier: 1,
    icon: 'fish',
    cost: 40,
    duration: 55,
    unlocks: ['fisher_hut'],
    effects: [],
    desc: 'La rivière nourrit ceux qui savent attendre. Une source de vivres qui ne dépend ni des saisons ni des troupeaux.',
  }),
  r_quarrying: r({
    id: 'r_quarrying',
    name: 'Extraction de pierre',
    branch: 'stone',
    tier: 1,
    icon: 'stone',
    cost: 70,
    duration: 80,
    unlocks: ['quarry'],
    effects: [],
    desc: "Coins, masses et leviers. La pierre devient exploitable, et avec elle tout ce qui doit durer.",
  }),
  r_paths: r({
    id: 'r_paths',
    name: 'Sentiers battus',
    branch: 'city',
    tier: 1,
    icon: 'path',
    cost: 35,
    duration: 45,
    unlocks: ['dirt_path'],
    effects: [],
    desc: 'Tracez des chemins : un tiers de vitesse en plus pour tous ceux qui les empruntent.',
  }),
  r_cottages: r({
    id: 'r_cottages',
    name: 'Chaumières',
    branch: 'survival',
    tier: 1,
    icon: 'house',
    cost: 80,
    duration: 90,
    unlocks: ['cottage'],
    effects: [{ kind: 'happiness', add: 2 }],
    desc: 'Un vrai foyer plutôt qu’un abri : plancher, cheminée, et de la place pour une famille.',
  }),
  r_marketplace: r({
    id: 'r_marketplace',
    name: 'Place de marché',
    branch: 'city',
    tier: 1,
    icon: 'market',
    cost: 65,
    duration: 70,
    unlocks: ['market'],
    effects: [],
    desc: "Sans marché, les foyers se nourrissent de ce qui traîne. C'est le bâtiment qui fait monter le bonheur.",
  }),

  // ══ Era 2 ═══════════════════════════════════════════════════════════════
  r_agriculture: r({
    id: 'r_agriculture',
    name: 'Agriculture',
    branch: 'farm',
    tier: 2,
    icon: 'wheat',
    cost: 140,
    duration: 110,
    unlocks: ['wheat_field'],
    effects: [],
    desc: 'Labourer, semer, attendre. La base de toute cité qui dépasse le hameau.',
  }),
  r_milling: r({
    id: 'r_milling',
    name: 'Moulin et four',
    branch: 'farm',
    tier: 2,
    icon: 'bread',
    cost: 190,
    duration: 140,
    unlocks: ['windmill', 'bakery'],
    effects: [{ kind: 'happiness', add: 2 }],
    desc: 'Blé, farine, pain. La chaîne alimentaire la plus rentable du jeu, et elle arrive complète.',
  }),
  r_charcoal: r({
    id: 'r_charcoal',
    name: 'Charbonnage',
    branch: 'forest',
    tier: 2,
    icon: 'fire',
    cost: 120,
    duration: 100,
    unlocks: ['charcoal_burner'],
    effects: [],
    desc: 'Du combustible sans creuser une seule galerie. Fours, forges et fumoirs en dépendent.',
  }),
  r_food_preservation: r({
    id: 'r_food_preservation',
    name: 'Conservation des vivres',
    branch: 'survival',
    tier: 2,
    icon: 'granary',
    cost: 160,
    duration: 130,
    unlocks: ['granary', 'smokehouse'],
    effects: [{ kind: 'food_upkeep', mul: 0.9 }],
    desc: "Greniers ventilés et fumoirs. C'est ce qui vous fera passer l'hiver.",
  }),
  r_carpentry: r({
    id: 'r_carpentry',
    name: 'Menuiserie',
    branch: 'forest',
    tier: 2,
    icon: 'furniture',
    cost: 150,
    duration: 120,
    unlocks: ['carpenter'],
    effects: [],
    desc: 'Le mobilier transforme une maison en foyer, et le foyer en bonheur.',
  }),
  r_husbandry_fowl: r({
    id: 'r_husbandry_fowl',
    name: 'Élevage : volaille',
    branch: 'farm',
    tier: 2,
    icon: 'egg',
    cost: 170,
    duration: 130,
    unlocks: ['chicken_coop'],
    effects: [],
    desc: 'Premier palier d’élevage : des œufs, et surtout des plumes pour la suite.',
  }),
  r_lumber_camp: r({
    id: 'r_lumber_camp',
    name: 'Exploitation forestière',
    branch: 'forest',
    tier: 2,
    icon: 'axe',
    cost: 200,
    duration: 150,
    unlocks: ['lumber_camp'],
    effects: [
      { kind: 'work_speed', profession: 'woodcutter', mul: 1.25 },
      { kind: 'gather_yield', profession: 'woodcutter', mul: 1.15 },
    ],
    desc: 'Scies longues et chevaux de débardage. Vos camps de bûcherons peuvent devenir de vraies exploitations.',
  }),

  // ══ Era 3 ═══════════════════════════════════════════════════════════════
  r_weaving: r({
    id: 'r_weaving',
    name: 'Tissage et couture',
    branch: 'craft',
    tier: 3,
    icon: 'cloth',
    cost: 340,
    duration: 180,
    unlocks: ['weaver', 'tailor'],
    effects: [{ kind: 'happiness', add: 2 }],
    desc: 'De la laine au vêtement. Des villageois bien couverts travaillent mieux et se plaignent moins.',
  }),
  r_tanning: r({
    id: 'r_tanning',
    name: 'Tannage et cordonnerie',
    branch: 'craft',
    tier: 3,
    icon: 'leather',
    cost: 360,
    duration: 190,
    unlocks: ['tannery', 'cobbler'],
    effects: [{ kind: 'move_speed', mul: 1.12 }],
    desc: 'Les peaux deviennent du cuir, le cuir devient des bottes, et tout le village marche plus vite.',
  }),
  r_husbandry_sheep: r({
    id: 'r_husbandry_sheep',
    name: 'Élevage : ovins',
    branch: 'farm',
    tier: 3,
    icon: 'sheep',
    cost: 380,
    duration: 200,
    unlocks: ['sheep_pasture'],
    effects: [],
    desc: 'Deuxième palier : la laine ouvre toute la filière textile.',
  }),
  r_mining: r({
    id: 'r_mining',
    name: 'Mines de charbon',
    branch: 'stone',
    tier: 3,
    icon: 'coal',
    cost: 420,
    duration: 210,
    unlocks: ['coal_mine'],
    effects: [],
    desc: 'Galeries étayées et lampes à huile. Le charbon en quantité, enfin.',
  }),
  r_trade_post: r({
    id: 'r_trade_post',
    name: 'Comptoir de commerce',
    branch: 'city',
    tier: 3,
    icon: 'scales',
    cost: 450,
    duration: 220,
    unlocks: ['trade_post'],
    effects: [{ kind: 'trade_tier', value: 1 }],
    desc: 'Les hameaux voisins acceptent enfin de commercer. Vos surplus deviennent de l’or.',
  }),
  r_nets: r({
    id: 'r_nets',
    name: 'Filets de pêche',
    branch: 'survival',
    tier: 3,
    icon: 'net',
    cost: 300,
    duration: 170,
    unlocks: ['fishing_pier'],
    effects: [],
    desc: 'Un ponton et des filets tressés : le rendement de vos pêcheurs fait plus que doubler.',
  }),
  r_faith: r({
    id: 'r_faith',
    name: 'Chapelle',
    branch: 'city',
    tier: 3,
    icon: 'chapel',
    cost: 320,
    duration: 180,
    unlocks: ['chapel'],
    effects: [],
    desc: 'Un clocher au centre du village apaise bien des angoisses.',
  }),
  r_cobbled_roads: r({
    id: 'r_cobbled_roads',
    name: 'Routes pavées',
    branch: 'city',
    tier: 3,
    icon: 'road',
    cost: 280,
    duration: 160,
    unlocks: ['cobbled_road'],
    effects: [],
    desc: 'Pavés taillés : 80 % de vitesse en plus. Le nerf de la logistique urbaine.',
  }),

  // ══ Era 4 ═══════════════════════════════════════════════════════════════
  r_iron_working: r({
    id: 'r_iron_working',
    name: 'Métallurgie du fer',
    branch: 'stone',
    tier: 4,
    icon: 'ingot',
    cost: 900,
    duration: 280,
    unlocks: ['iron_mine', 'smelter'],
    effects: [],
    desc: 'Le seuil décisif : le fer ouvre les outils, les grands bâtiments et la haute mer.',
  }),
  r_blacksmithing: r({
    id: 'r_blacksmithing',
    name: 'Forge',
    branch: 'stone',
    tier: 4,
    icon: 'hammer',
    cost: 950,
    duration: 290,
    unlocks: ['blacksmith'],
    effects: [{ kind: 'work_speed', mul: 1.1 }],
    desc: 'Les outils de fer accélèrent tout le monde, partout. Un investissement qui se rembourse vite.',
  }),
  r_clay_working: r({
    id: 'r_clay_working',
    name: 'Argile et briques',
    branch: 'stone',
    tier: 4,
    icon: 'brick',
    cost: 800,
    duration: 260,
    unlocks: ['clay_pit', 'brick_kiln'],
    effects: [],
    desc: 'Fosses d’argile et fours à briques, le matériau des bâtiments de prestige.',
  }),
  r_masonry_homes: r({
    id: 'r_masonry_homes',
    name: 'Maçonnerie civile',
    branch: 'stone',
    tier: 4,
    icon: 'house',
    cost: 1000,
    duration: 300,
    unlocks: ['house'],
    effects: [{ kind: 'fire_risk', mul: 0.85 }],
    desc: 'Murs de pierre : des maisons plus grandes, et bien moins d’incendies.',
  }),
  r_fletching: r({
    id: 'r_fletching',
    name: 'Empennage',
    branch: 'forest',
    tier: 4,
    icon: 'feather',
    cost: 850,
    duration: 270,
    unlocks: ['fletcher', 'hunting_lodge'],
    effects: [],
    desc: 'Flèches empennées et pavillons de chasse. La chasse change d’échelle — mais il faudra des flèches.',
  }),
  r_brewing: r({
    id: 'r_brewing',
    name: 'Brasserie et taverne',
    branch: 'farm',
    tier: 4,
    icon: 'ale',
    cost: 880,
    duration: 275,
    unlocks: ['brewery', 'tavern'],
    effects: [],
    desc: 'Rien ne remonte le moral d’un village comme une bonne cervoise servie au chaud.',
  }),
  r_husbandry_cattle: r({
    id: 'r_husbandry_cattle',
    name: 'Élevage : bovins',
    branch: 'farm',
    tier: 4,
    icon: 'cow',
    cost: 950,
    duration: 290,
    unlocks: ['cattle_pasture'],
    effects: [],
    desc: 'Troisième palier : viande en masse et cuir épais.',
  }),
  r_logistics: r({
    id: 'r_logistics',
    name: 'Logistique',
    branch: 'city',
    tier: 4,
    icon: 'crate',
    cost: 820,
    duration: 260,
    unlocks: ['warehouse'],
    effects: [
      { kind: 'carry_capacity', mul: 1.4 },
      { kind: 'storage', mul: 1.25 },
    ],
    desc: 'Hottes, brouettes et registres. Vos porteurs transportent bien plus à chaque voyage.',
  }),
  r_trade_routes: r({
    id: 'r_trade_routes',
    name: 'Routes marchandes',
    branch: 'city',
    tier: 4,
    icon: 'horse',
    cost: 1100,
    duration: 310,
    unlocks: [],
    effects: [{ kind: 'trade_tier', value: 2 }],
    desc: 'Les bourgs marchands ouvrent leurs portes : plus de volume, de meilleurs prix.',
  }),
  r_firewatch: r({
    id: 'r_firewatch',
    name: 'Guet du feu',
    branch: 'survival',
    tier: 4,
    icon: 'bucket',
    cost: 780,
    duration: 250,
    unlocks: ['firewatch'],
    effects: [{ kind: 'fire_risk', mul: 0.75 }],
    desc: 'Une équipe organisée et des seaux prêts. Les incendies cessent d’être des catastrophes.',
  }),
  r_herbalism: r({
    id: 'r_herbalism',
    name: 'Herboristerie',
    branch: 'survival',
    tier: 4,
    icon: 'herb',
    cost: 760,
    duration: 245,
    unlocks: ['healer_hut'],
    effects: [{ kind: 'disease_resist', mul: 0.6 }],
    desc: 'Décoctions et cataplasmes : les épidémies deviennent une contrariété, plus un drame.',
  }),

  // ══ Era 5 ═══════════════════════════════════════════════════════════════
  r_gold_prospecting: r({
    id: 'r_gold_prospecting',
    name: "Prospection de l'or",
    branch: 'stone',
    tier: 5,
    icon: 'nugget',
    cost: 2000,
    duration: 380,
    unlocks: ['gold_mine'],
    effects: [],
    desc: 'Les filons aurifères se cachent dans les hauteurs rocheuses.',
  }),
  r_goldsmithing: r({
    id: 'r_goldsmithing',
    name: 'Orfèvrerie',
    branch: 'craft',
    tier: 5,
    icon: 'ring',
    cost: 2600,
    duration: 420,
    unlocks: ['goldsmith'],
    effects: [{ kind: 'happiness', add: 2 }],
    desc: 'La joaillerie est l’objet le plus cher du jeu. Les grandes cités s’arrachent la vôtre.',
  }),
  r_deep_mining: r({
    id: 'r_deep_mining',
    name: 'Mines profondes',
    branch: 'stone',
    tier: 5,
    icon: 'shaft',
    cost: 2400,
    duration: 400,
    unlocks: ['deep_mine'],
    effects: [{ kind: 'deposit_richness', mul: 2.2 }],
    desc: 'On descend sous la couche stérile : tous vos filons s’enrichissent d’un coup.',
  }),
  r_water_power: r({
    id: 'r_water_power',
    name: 'Force hydraulique',
    branch: 'forest',
    tier: 5,
    icon: 'wheel',
    cost: 2200,
    duration: 390,
    unlocks: ['water_sawmill'],
    effects: [],
    desc: 'La roue à aubes ne dort jamais : deux fois plus de planches par rondin.',
  }),
  r_grand_market: r({
    id: 'r_grand_market',
    name: 'Halles couvertes',
    branch: 'city',
    tier: 5,
    icon: 'hall',
    cost: 2300,
    duration: 395,
    unlocks: ['grand_market'],
    effects: [{ kind: 'happiness', add: 3 }],
    desc: 'Un marché qui dessert un tiers de la cité.',
  }),
  r_burgher_manors: r({
    id: 'r_burgher_manors',
    name: 'Demeures bourgeoises',
    branch: 'city',
    tier: 5,
    icon: 'manor',
    cost: 3000,
    duration: 450,
    unlocks: ['manor'],
    effects: [{ kind: 'happiness', add: 4 }],
    desc: 'Douze habitants par bâtisse, et le prestige qui va avec.',
  }),
  r_fishing_boats: r({
    id: 'r_fishing_boats',
    name: 'Barques de pêche',
    branch: 'survival',
    tier: 5,
    icon: 'boat',
    cost: 1900,
    duration: 370,
    unlocks: ['fishing_dock'],
    effects: [],
    desc: 'On quitte la berge pour aller chercher les bancs du large.',
  }),
  r_harbour: r({
    id: 'r_harbour',
    name: 'Port de pêche',
    branch: 'survival',
    tier: 5,
    icon: 'anchor',
    cost: 3200,
    duration: 470,
    unlocks: ['fishing_harbour'],
    effects: [{ kind: 'food_upkeep', mul: 0.95 }],
    desc: 'Chalutiers à voile et cales pleines. De quoi nourrir une cité entière.',
  }),
  r_guild_charter: r({
    id: 'r_guild_charter',
    name: 'Charte de guilde',
    branch: 'city',
    tier: 5,
    icon: 'seal',
    cost: 3400,
    duration: 480,
    unlocks: [],
    effects: [{ kind: 'trade_tier', value: 3 }],
    desc: 'Les grandes cités vous reconnaissent : marchandises rares et contrats lucratifs.',
  }),
  r_chandlery: r({
    id: 'r_chandlery',
    name: 'Fabrique de chandelles',
    branch: 'craft',
    tier: 5,
    icon: 'candle',
    cost: 1700,
    duration: 350,
    unlocks: ['chandlery'],
    effects: [],
    desc: 'De la lumière pour les chapelles, les érudits et les longues nuits d’hiver.',
  }),
  r_crop_rotation: r({
    id: 'r_crop_rotation',
    name: 'Assolement triennal',
    branch: 'farm',
    tier: 5,
    icon: 'rotation',
    cost: 2100,
    duration: 385,
    unlocks: [],
    effects: [{ kind: 'gather_yield', profession: 'farmer', mul: 1.45 }],
    desc: 'Alterner céréales, légumineuses et jachère : 45 % de récolte en plus sur tous vos champs.',
  }),
  r_heavy_quarrying: r({
    id: 'r_heavy_quarrying',
    name: 'Carrières lourdes',
    branch: 'stone',
    tier: 5,
    icon: 'pick',
    cost: 1800,
    duration: 360,
    unlocks: ['great_quarry'],
    effects: [{ kind: 'gather_yield', profession: 'quarrier', mul: 1.2 }],
    desc: 'Treuils, rails de bois et équipes doublées.',
  }),
  r_flax: r({
    id: 'r_flax',
    name: 'Culture du lin',
    branch: 'farm',
    tier: 5,
    icon: 'flax',
    cost: 1600,
    duration: 340,
    unlocks: ['flax_field'],
    effects: [],
    desc: 'Du tissu sans dépendre des troupeaux. Utile quand la laine vient à manquer.',
  }),
};

export const ALL_RESEARCH_IDS = Object.keys(RESEARCH) as ResearchId[];

/** Highest era in the tree. */
export const MAX_TIER = ALL_RESEARCH_IDS.reduce((m, id) => Math.max(m, RESEARCH[id].tier), 1);

export const TIER_NAMES: Record<number, string> = {
  1: 'Les premiers feux',
  2: 'Le pain quotidien',
  3: 'Métiers et échanges',
  4: "L'âge du fer",
  5: 'La cité',
};

export function researchOfTier(tier: number): ResearchDef[] {
  return ALL_RESEARCH_IDS.map((id) => RESEARCH[id]).filter((d) => d.tier === tier);
}

export const BRANCH_LABELS: Record<ResearchBranch, { name: string; color: string }> = {
  survival: { name: 'Survie', color: '#c97b3c' },
  forest: { name: 'Forêt', color: '#4f8a46' },
  stone: { name: 'Pierre', color: '#8a8f97' },
  farm: { name: 'Champs', color: '#c7a93a' },
  craft: { name: 'Artisanat', color: '#9b6fae' },
  city: { name: 'Cité', color: '#4a7fa8' },
};
