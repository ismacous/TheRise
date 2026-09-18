import type { BuildingId } from './buildings';
import type { ProfessionId } from './professions';

export type ResearchBranch = 'survival' | 'forest' | 'stone' | 'farm' | 'craft' | 'city';

export type ResearchEffect =
  /** Multiplies harvest speed for a profession (or all if omitted). */
  | { kind: 'work_speed'; profession?: ProfessionId; mul: number }
  /** Multiplies the yield of gathering buildings. */
  | { kind: 'gather_yield'; profession?: ProfessionId; mul: number }
  /** Extra output per production batch, as a multiplier. */
  | { kind: 'craft_yield'; mul: number }
  /** Villager walking speed. */
  | { kind: 'move_speed'; mul: number }
  /** Carrying capacity per trip. */
  | { kind: 'carry_capacity'; mul: number }
  /** Flat happiness bonus for the whole village. */
  | { kind: 'happiness'; add: number }
  /** Food eaten per villager per day, as a multiplier (<1 is better). */
  | { kind: 'food_upkeep'; mul: number }
  /** Unlocks a trade partner tier (1 hamlets, 2 towns, 3 cities, 4 foreign). */
  | { kind: 'trade_tier'; value: number }
  /** Increases remaining amount in every mineral deposit. */
  | { kind: 'deposit_richness'; mul: number }
  /** Research point generation. */
  | { kind: 'research_rate'; mul: number }
  /** Reduces the chance a building catches fire. */
  | { kind: 'fire_risk'; mul: number }
  /** Reduces the chance and severity of disease. */
  | { kind: 'disease_resist'; mul: number }
  /** Construction speed. */
  | { kind: 'build_speed'; mul: number }
  /** Storage capacity of every storehouse. */
  | { kind: 'storage'; mul: number };

export interface ResearchDef {
  id: ResearchId;
  name: string;
  branch: ResearchBranch;
  icon: string;
  /** Research points required. */
  cost: number;
  /** Seconds of study once started (at 1x speed). */
  duration: number;
  requires: ResearchId[];
  unlocks: BuildingId[];
  effects: ResearchEffect[];
  desc: string;
}

export type ResearchId =
  // survival
  | 'r_shelter'
  | 'r_cottages'
  | 'r_food_preservation'
  | 'r_hunting'
  | 'r_butchery'
  | 'r_fishing'
  | 'r_nets'
  | 'r_fishing_boats'
  | 'r_harbour'
  | 'r_herbalism'
  | 'r_firewatch'
  // forest
  | 'r_forestry'
  | 'r_sharp_axes'
  | 'r_lumber_camp'
  | 'r_charcoal'
  | 'r_carpentry'
  | 'r_fletching'
  | 'r_water_power'
  // stone
  | 'r_quarrying'
  | 'r_masonry_homes'
  | 'r_heavy_quarrying'
  | 'r_clay_working'
  | 'r_mining'
  | 'r_iron_working'
  | 'r_blacksmithing'
  | 'r_deep_mining'
  | 'r_gold_prospecting'
  | 'r_goldsmithing'
  // farm
  | 'r_agriculture'
  | 'r_crop_rotation'
  | 'r_milling'
  | 'r_baking'
  | 'r_brewing'
  | 'r_husbandry_fowl'
  | 'r_husbandry_sheep'
  | 'r_husbandry_cattle'
  | 'r_flax'
  // craft
  | 'r_weaving'
  | 'r_tailoring'
  | 'r_tanning'
  | 'r_cobbling'
  | 'r_chandlery'
  // city
  | 'r_paths'
  | 'r_cobbled_roads'
  | 'r_logistics'
  | 'r_marketplace'
  | 'r_grand_market'
  | 'r_trade_post'
  | 'r_trade_routes'
  | 'r_guild_charter'
  | 'r_faith'
  | 'r_tavern'
  | 'r_scholarship'
  | 'r_burgher_manors';

const r = (d: ResearchDef): ResearchDef => d;

export const RESEARCH: Record<ResearchId, ResearchDef> = {
  // ── Survie ──────────────────────────────────────────────────────────────
  r_shelter: r({
    id: 'r_shelter',
    name: 'Abris solides',
    branch: 'survival',
    icon: '🏚️',
    cost: 8,
    duration: 45,
    requires: [],
    unlocks: [],
    effects: [
      { kind: 'happiness', add: 3 },
      { kind: 'build_speed', mul: 1.15 },
    ],
    desc: "Calfeutrer les cabanes avant l'hiver. Un peu de moral et des chantiers plus rapides.",
  }),
  r_cottages: r({
    id: 'r_cottages',
    name: 'Chaumières',
    branch: 'survival',
    icon: '🏠',
    cost: 30,
    duration: 120,
    requires: ['r_shelter'],
    unlocks: ['cottage'],
    effects: [],
    desc: "Des foyers pour cinq personnes au lieu de trois, et bien plus confortables.",
  }),
  r_food_preservation: r({
    id: 'r_food_preservation',
    name: 'Conservation des vivres',
    branch: 'survival',
    icon: '🧊',
    cost: 45,
    duration: 150,
    requires: ['r_shelter'],
    unlocks: ['granary', 'smokehouse'],
    effects: [{ kind: 'food_upkeep', mul: 0.9 }],
    desc: "Greniers ventilés et fumoirs : moins de pertes, des réserves qui passent l'hiver.",
  }),
  r_hunting: r({
    id: 'r_hunting',
    name: "Chasse à l'arc",
    branch: 'survival',
    icon: '🏹',
    cost: 18,
    duration: 75,
    requires: [],
    unlocks: ['hunter_camp'],
    effects: [],
    desc: "Les forêts grouillent de gibier. Encore faut-il savoir l'approcher.",
  }),
  r_butchery: r({
    id: 'r_butchery',
    name: 'Boucherie',
    branch: 'survival',
    icon: '🔪',
    cost: 26,
    duration: 90,
    requires: ['r_hunting'],
    unlocks: ['butcher'],
    effects: [],
    desc: "Sans boucher, le gibier pourrit dans l'entrepôt. Avec lui, c'est de la viande.",
  }),
  r_fishing: r({
    id: 'r_fishing',
    name: 'Pêche à la ligne',
    branch: 'survival',
    icon: '🎣',
    cost: 14,
    duration: 60,
    requires: [],
    unlocks: ['fisher_hut'],
    effects: [],
    desc: "La rivière nourrit ceux qui savent attendre.",
  }),
  r_nets: r({
    id: 'r_nets',
    name: 'Filets de pêche',
    branch: 'survival',
    icon: '🕸️',
    cost: 55,
    duration: 180,
    requires: ['r_fishing', 'r_weaving'],
    unlocks: ['fishing_pier'],
    effects: [],
    desc: "Un ponton et des filets tressés : le rendement fait plus que doubler.",
  }),
  r_fishing_boats: r({
    id: 'r_fishing_boats',
    name: 'Barques de pêche',
    branch: 'survival',
    icon: '🛶',
    cost: 140,
    duration: 330,
    requires: ['r_nets', 'r_iron_working'],
    unlocks: ['fishing_dock'],
    effects: [],
    desc: "On quitte enfin la berge pour aller chercher les bancs du large.",
  }),
  r_harbour: r({
    id: 'r_harbour',
    name: 'Port de pêche',
    branch: 'survival',
    icon: '⚓',
    cost: 340,
    duration: 600,
    requires: ['r_fishing_boats', 'r_heavy_quarrying'],
    unlocks: ['fishing_harbour'],
    effects: [{ kind: 'food_upkeep', mul: 0.95 }],
    desc: "Le plus gros producteur de nourriture du jeu, si vous avez de l'eau.",
  }),
  r_herbalism: r({
    id: 'r_herbalism',
    name: 'Herboristerie',
    branch: 'survival',
    icon: '🌿',
    cost: 90,
    duration: 240,
    requires: ['r_food_preservation'],
    unlocks: ['healer_hut'],
    effects: [{ kind: 'disease_resist', mul: 0.6 }],
    desc: "Décoctions et cataplasmes. Les épidémies deviennent survivables.",
  }),
  r_firewatch: r({
    id: 'r_firewatch',
    name: 'Guet du feu',
    branch: 'survival',
    icon: '🚒',
    cost: 110,
    duration: 260,
    requires: ['r_shelter', 'r_quarrying'],
    unlocks: ['firewatch'],
    effects: [{ kind: 'fire_risk', mul: 0.75 }],
    desc: "Une équipe organisée, des seaux prêts. Les incendies cessent d'être des catastrophes.",
  }),

  // ── Forêt & bois ────────────────────────────────────────────────────────
  r_forestry: r({
    id: 'r_forestry',
    name: 'Sylviculture',
    branch: 'forest',
    icon: '🌱',
    cost: 20,
    duration: 80,
    requires: [],
    unlocks: ['forester_hut'],
    effects: [],
    desc: "Replanter ce qu'on abat. La première leçon de tout gestionnaire.",
  }),
  r_sharp_axes: r({
    id: 'r_sharp_axes',
    name: 'Haches affûtées',
    branch: 'forest',
    icon: '🪓',
    cost: 35,
    duration: 110,
    requires: ['r_forestry'],
    unlocks: [],
    effects: [
      { kind: 'work_speed', profession: 'woodcutter', mul: 1.3 },
      { kind: 'gather_yield', profession: 'woodcutter', mul: 1.15 },
    ],
    desc: "Meules et manches en frêne : vos bûcherons abattent bien plus vite.",
  }),
  r_lumber_camp: r({
    id: 'r_lumber_camp',
    name: 'Exploitation forestière',
    branch: 'forest',
    icon: '🌲',
    cost: 85,
    duration: 220,
    requires: ['r_sharp_axes'],
    unlocks: ['lumber_camp'],
    effects: [],
    desc: "Quatre bûcherons, un rayon élargi, des piles de rondins.",
  }),
  r_charcoal: r({
    id: 'r_charcoal',
    name: 'Charbonnage',
    branch: 'forest',
    icon: '🔥',
    cost: 40,
    duration: 130,
    requires: [],
    unlocks: ['charcoal_burner'],
    effects: [],
    desc: "Du combustible dès le début de partie, sans creuser une seule galerie.",
  }),
  r_carpentry: r({
    id: 'r_carpentry',
    name: 'Menuiserie',
    branch: 'forest',
    icon: '🪑',
    cost: 60,
    duration: 170,
    requires: ['r_sharp_axes'],
    unlocks: ['carpenter'],
    effects: [],
    desc: "Le mobilier transforme une maison en foyer — et le foyer en bonheur.",
  }),
  r_fletching: r({
    id: 'r_fletching',
    name: 'Empennage',
    branch: 'forest',
    icon: '🪶',
    cost: 100,
    duration: 240,
    requires: ['r_carpentry', 'r_husbandry_fowl'],
    unlocks: ['fletcher', 'hunting_lodge'],
    effects: [],
    desc: "Flèches empennées et pavillons de chasse : la chasse change d'échelle.",
  }),
  r_water_power: r({
    id: 'r_water_power',
    name: 'Force hydraulique',
    branch: 'forest',
    icon: '💧',
    cost: 180,
    duration: 380,
    requires: ['r_lumber_camp', 'r_iron_working'],
    unlocks: ['water_sawmill'],
    effects: [],
    desc: "La roue à aubes ne dort jamais. Deux fois plus de planches par rondin.",
  }),

  // ── Pierre & mine ───────────────────────────────────────────────────────
  r_quarrying: r({
    id: 'r_quarrying',
    name: 'Extraction de pierre',
    branch: 'stone',
    icon: '🪨',
    cost: 25,
    duration: 100,
    requires: [],
    unlocks: ['quarry'],
    effects: [],
    desc: "Coins, masses et leviers. La pierre devient enfin exploitable.",
  }),
  r_masonry_homes: r({
    id: 'r_masonry_homes',
    name: 'Maçonnerie civile',
    branch: 'stone',
    icon: '🧱',
    cost: 110,
    duration: 260,
    requires: ['r_quarrying', 'r_cottages', 'r_clay_working'],
    unlocks: ['house'],
    effects: [{ kind: 'fire_risk', mul: 0.85 }],
    desc: "Murs de pierre : huit habitants par maison et bien moins d'incendies.",
  }),
  r_heavy_quarrying: r({
    id: 'r_heavy_quarrying',
    name: 'Carrières lourdes',
    branch: 'stone',
    icon: '⛏️',
    cost: 150,
    duration: 300,
    requires: ['r_quarrying', 'r_blacksmithing'],
    unlocks: ['great_quarry'],
    effects: [{ kind: 'gather_yield', profession: 'quarrier', mul: 1.2 }],
    desc: "Treuils, rails de bois, équipes doublées.",
  }),
  r_clay_working: r({
    id: 'r_clay_working',
    name: "Travail de l'argile",
    branch: 'stone',
    icon: '🏺',
    cost: 50,
    duration: 150,
    requires: ['r_charcoal'],
    unlocks: ['clay_pit', 'brick_kiln'],
    effects: [],
    desc: "Fosses d'argile et fours à briques. Le matériau des bâtiments de prestige.",
  }),
  r_mining: r({
    id: 'r_mining',
    name: 'Mines de charbon',
    branch: 'stone',
    icon: '⚫',
    cost: 80,
    duration: 210,
    requires: ['r_quarrying'],
    unlocks: ['coal_mine'],
    effects: [],
    desc: "Galeries étayées et lampes à huile. Le vrai charbon, en quantité.",
  }),
  r_iron_working: r({
    id: 'r_iron_working',
    name: 'Métallurgie du fer',
    branch: 'stone',
    icon: '⚒️',
    cost: 160,
    duration: 320,
    requires: ['r_mining'],
    unlocks: ['iron_mine', 'smelter'],
    effects: [],
    desc: "Le seuil décisif : le fer ouvre les outils, les grands bâtiments et la mer.",
  }),
  r_blacksmithing: r({
    id: 'r_blacksmithing',
    name: 'Forge',
    branch: 'stone',
    icon: '🔨',
    cost: 190,
    duration: 340,
    requires: ['r_iron_working'],
    unlocks: ['blacksmith'],
    effects: [{ kind: 'work_speed', mul: 1.1 }],
    desc: "Les outils de fer accélèrent tout le monde, partout.",
  }),
  r_deep_mining: r({
    id: 'r_deep_mining',
    name: 'Mines profondes',
    branch: 'stone',
    icon: '🕳️',
    cost: 300,
    duration: 520,
    requires: ['r_blacksmithing'],
    unlocks: ['deep_mine'],
    effects: [{ kind: 'deposit_richness', mul: 2.2 }],
    desc: "On descend enfin sous la couche stérile : tous vos filons s'enrichissent.",
  }),
  r_gold_prospecting: r({
    id: 'r_gold_prospecting',
    name: "Prospection de l'or",
    branch: 'stone',
    icon: '✨',
    cost: 260,
    duration: 460,
    requires: ['r_iron_working'],
    unlocks: ['gold_mine'],
    effects: [],
    desc: "Les filons aurifères se cachent dans les hauteurs rocheuses.",
  }),
  r_goldsmithing: r({
    id: 'r_goldsmithing',
    name: 'Orfèvrerie',
    branch: 'stone',
    icon: '💍',
    cost: 380,
    duration: 560,
    requires: ['r_gold_prospecting', 'r_tailoring'],
    unlocks: ['goldsmith'],
    effects: [{ kind: 'happiness', add: 2 }],
    desc: "La joaillerie est l'objet le plus cher du jeu. Les grandes cités s'arrachent la vôtre.",
  }),

  // ── Agriculture & élevage ───────────────────────────────────────────────
  r_agriculture: r({
    id: 'r_agriculture',
    name: 'Agriculture',
    branch: 'farm',
    icon: '🌾',
    cost: 30,
    duration: 110,
    requires: [],
    unlocks: ['wheat_field'],
    effects: [],
    desc: "Labourer, semer, attendre. La base de toute civilisation sédentaire.",
  }),
  r_crop_rotation: r({
    id: 'r_crop_rotation',
    name: 'Assolement triennal',
    branch: 'farm',
    icon: '🔄',
    cost: 120,
    duration: 270,
    requires: ['r_agriculture', 'r_husbandry_sheep'],
    unlocks: [],
    effects: [{ kind: 'gather_yield', profession: 'farmer', mul: 1.45 }],
    desc: "Alterner céréales, légumineuses et jachère : +45 % sur tous vos champs.",
  }),
  r_milling: r({
    id: 'r_milling',
    name: 'Meunerie',
    branch: 'farm',
    icon: '🌬️',
    cost: 65,
    duration: 180,
    requires: ['r_agriculture'],
    unlocks: ['windmill'],
    effects: [],
    desc: "Le blé seul ne se mange pas. Il lui faut des meules.",
  }),
  r_baking: r({
    id: 'r_baking',
    name: 'Boulangerie',
    branch: 'farm',
    icon: '🍞',
    cost: 95,
    duration: 220,
    requires: ['r_milling', 'r_charcoal'],
    unlocks: ['bakery'],
    effects: [{ kind: 'happiness', add: 2 }],
    desc: "Blé → farine → pain : la chaîne alimentaire la plus efficace du village.",
  }),
  r_brewing: r({
    id: 'r_brewing',
    name: 'Brassage',
    branch: 'farm',
    icon: '🍺',
    cost: 130,
    duration: 260,
    requires: ['r_baking'],
    unlocks: ['brewery'],
    effects: [],
    desc: "De la cervoise pour les tavernes. Le moral du village vous dira merci.",
  }),
  r_husbandry_fowl: r({
    id: 'r_husbandry_fowl',
    name: 'Élevage : volaille',
    branch: 'farm',
    icon: '🐔',
    cost: 55,
    duration: 160,
    requires: ['r_agriculture'],
    unlocks: ['chicken_coop'],
    effects: [],
    desc: "Premier palier d'élevage : des œufs, et surtout des plumes.",
  }),
  r_husbandry_sheep: r({
    id: 'r_husbandry_sheep',
    name: 'Élevage : ovins',
    branch: 'farm',
    icon: '🐑',
    cost: 120,
    duration: 250,
    requires: ['r_husbandry_fowl'],
    unlocks: ['sheep_pasture'],
    effects: [],
    desc: "Deuxième palier : la laine ouvre toute la filière textile.",
  }),
  r_husbandry_cattle: r({
    id: 'r_husbandry_cattle',
    name: 'Élevage : bovins',
    branch: 'farm',
    icon: '🐄',
    cost: 220,
    duration: 400,
    requires: ['r_husbandry_sheep', 'r_butchery'],
    unlocks: ['cattle_pasture'],
    effects: [],
    desc: "Troisième palier : viande en masse et cuir épais.",
  }),
  r_flax: r({
    id: 'r_flax',
    name: 'Culture du lin',
    branch: 'farm',
    icon: '🌿',
    cost: 100,
    duration: 210,
    requires: ['r_agriculture', 'r_weaving'],
    unlocks: ['flax_field'],
    effects: [],
    desc: "Du tissu sans dépendre des troupeaux. Utile quand la laine manque.",
  }),

  // ── Artisanat ───────────────────────────────────────────────────────────
  r_weaving: r({
    id: 'r_weaving',
    name: 'Tissage',
    branch: 'craft',
    icon: '🧵',
    cost: 45,
    duration: 140,
    requires: [],
    unlocks: ['weaver'],
    effects: [],
    desc: "Le métier à tisser : laine ou lin deviennent du tissu.",
  }),
  r_tailoring: r({
    id: 'r_tailoring',
    name: 'Couture',
    branch: 'craft',
    icon: '👕',
    cost: 110,
    duration: 250,
    requires: ['r_weaving', 'r_husbandry_fowl'],
    unlocks: ['tailor'],
    effects: [{ kind: 'happiness', add: 2 }],
    desc: "Vêtements doublés de plumes. Le froid ne fait plus fuir personne.",
  }),
  r_tanning: r({
    id: 'r_tanning',
    name: 'Tannage',
    branch: 'craft',
    icon: '🟤',
    cost: 90,
    duration: 210,
    requires: ['r_butchery'],
    unlocks: ['tannery'],
    effects: [],
    desc: "Les peaux deviennent du cuir. À installer au bord de l'eau.",
  }),
  r_cobbling: r({
    id: 'r_cobbling',
    name: 'Cordonnerie',
    branch: 'craft',
    icon: '🥾',
    cost: 140,
    duration: 280,
    requires: ['r_tanning'],
    unlocks: ['cobbler'],
    effects: [{ kind: 'move_speed', mul: 1.12 }],
    desc: "Des bottes pour tous : vos villageois marchent plus vite.",
  }),
  r_chandlery: r({
    id: 'r_chandlery',
    name: 'Fabrique de chandelles',
    branch: 'craft',
    icon: '🕯️',
    cost: 150,
    duration: 290,
    requires: ['r_weaving', 'r_charcoal'],
    unlocks: ['chandlery'],
    effects: [],
    desc: "De la lumière pour les chapelles, les érudits et les longues nuits.",
  }),

  // ── Cité & commerce ─────────────────────────────────────────────────────
  r_paths: r({
    id: 'r_paths',
    name: 'Sentiers battus',
    branch: 'city',
    icon: '🛤️',
    cost: 12,
    duration: 50,
    requires: [],
    unlocks: ['dirt_path'],
    effects: [],
    desc: "Tracez des chemins : +35 % de vitesse pour tous ceux qui les empruntent.",
  }),
  r_cobbled_roads: r({
    id: 'r_cobbled_roads',
    name: 'Routes pavées',
    branch: 'city',
    icon: '🧱',
    cost: 100,
    duration: 230,
    requires: ['r_paths', 'r_quarrying'],
    unlocks: ['cobbled_road'],
    effects: [],
    desc: "Pavés taillés : +80 % de vitesse. Le nerf de la logistique urbaine.",
  }),
  r_logistics: r({
    id: 'r_logistics',
    name: 'Logistique',
    branch: 'city',
    icon: '📦',
    cost: 95,
    duration: 230,
    requires: ['r_paths'],
    unlocks: ['warehouse'],
    effects: [
      { kind: 'carry_capacity', mul: 1.4 },
      { kind: 'storage', mul: 1.25 },
    ],
    desc: "Hottes, brouettes et registres : vos porteurs transportent bien plus.",
  }),
  r_marketplace: r({
    id: 'r_marketplace',
    name: 'Place de marché',
    branch: 'city',
    icon: '🏪',
    cost: 40,
    duration: 130,
    requires: [],
    unlocks: ['market'],
    effects: [],
    desc: "Sans marché, les foyers se nourrissent mal. C'est la recherche la plus urgente.",
  }),
  r_grand_market: r({
    id: 'r_grand_market',
    name: 'Halles couvertes',
    branch: 'city',
    icon: '🏬',
    cost: 200,
    duration: 360,
    requires: ['r_marketplace', 'r_masonry_homes'],
    unlocks: ['grand_market'],
    effects: [{ kind: 'happiness', add: 3 }],
    desc: "Un marché qui dessert un tiers de la cité.",
  }),
  r_trade_post: r({
    id: 'r_trade_post',
    name: 'Comptoir de commerce',
    branch: 'city',
    icon: '⚖️',
    cost: 70,
    duration: 190,
    requires: ['r_marketplace'],
    unlocks: ['trade_post'],
    effects: [{ kind: 'trade_tier', value: 1 }],
    desc: "Les hameaux voisins acceptent de commercer avec vous.",
  }),
  r_trade_routes: r({
    id: 'r_trade_routes',
    name: 'Routes marchandes',
    branch: 'city',
    icon: '🐎',
    cost: 210,
    duration: 380,
    requires: ['r_trade_post', 'r_cobbled_roads'],
    unlocks: [],
    effects: [{ kind: 'trade_tier', value: 2 }],
    desc: "Les bourgs marchands ouvrent leurs portes : plus de volume, de meilleurs prix.",
  }),
  r_guild_charter: r({
    id: 'r_guild_charter',
    name: 'Charte de guilde',
    branch: 'city',
    icon: '📜',
    cost: 450,
    duration: 660,
    requires: ['r_trade_routes', 'r_scholarship'],
    unlocks: [],
    effects: [{ kind: 'trade_tier', value: 3 }],
    desc: "Les grandes cités vous reconnaissent. Marchandises rares et contrats lucratifs.",
  }),
  r_faith: r({
    id: 'r_faith',
    name: 'Chapelle',
    branch: 'city',
    icon: '⛪',
    cost: 75,
    duration: 200,
    requires: ['r_quarrying'],
    unlocks: ['chapel'],
    effects: [],
    desc: "Un clocher au centre du village apaise bien des angoisses.",
  }),
  r_tavern: r({
    id: 'r_tavern',
    name: 'Taverne',
    branch: 'city',
    icon: '🍻',
    cost: 160,
    duration: 300,
    requires: ['r_brewing'],
    unlocks: ['tavern'],
    effects: [],
    desc: "Le meilleur bâtiment de bonheur du jeu — tant qu'il y a de la bière.",
  }),
  r_scholarship: r({
    id: 'r_scholarship',
    name: 'Érudition',
    branch: 'city',
    icon: '📚',
    cost: 130,
    duration: 270,
    requires: ['r_marketplace', 'r_cottages'],
    unlocks: ['scholars_hall'],
    effects: [{ kind: 'research_rate', mul: 1.2 }],
    desc: "Des érudits à plein temps. Toutes vos recherches suivantes iront bien plus vite.",
  }),
  r_burgher_manors: r({
    id: 'r_burgher_manors',
    name: 'Demeures bourgeoises',
    branch: 'city',
    icon: '🏛️',
    cost: 420,
    duration: 620,
    requires: ['r_masonry_homes', 'r_carpentry', 'r_grand_market'],
    unlocks: ['manor'],
    effects: [{ kind: 'happiness', add: 4 }],
    desc: "Douze habitants par bâtisse, et le prestige qui va avec.",
  }),
};

export const ALL_RESEARCH_IDS = Object.keys(RESEARCH) as ResearchId[];

export const BRANCH_LABELS: Record<ResearchBranch, { name: string; icon: string; color: string }> = {
  survival: { name: 'Survie', icon: '🔥', color: '#c97b3c' },
  forest: { name: 'Forêt & bois', icon: '🌲', color: '#4f8a46' },
  stone: { name: 'Pierre & mine', icon: '⛏️', color: '#8a8f97' },
  farm: { name: 'Champs & élevage', icon: '🌾', color: '#c7a93a' },
  craft: { name: 'Artisanat', icon: '🧵', color: '#9b6fae' },
  city: { name: 'Cité & commerce', icon: '🏛️', color: '#4a7fa8' },
};

/** Map of building -> research that unlocks it, derived once at load. */
export const UNLOCKED_BY = (() => {
  const m = new Map<BuildingId, ResearchId>();
  for (const id of ALL_RESEARCH_IDS) {
    for (const bId of RESEARCH[id].unlocks) m.set(bId, id);
  }
  return m;
})();
