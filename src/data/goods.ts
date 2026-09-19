/**
 * Every material that can sit in a storehouse. `gold` is deliberately NOT a
 * good: it lives in the treasury and is never hauled by villagers.
 */
export type GoodId =
  // --- raw / gathered ---------------------------------------------------
  | 'logs'
  | 'stone'
  | 'clay'
  | 'coal'
  | 'iron_ore'
  | 'gold_ore'
  | 'wheat'
  | 'flax'
  | 'berries'
  | 'game'
  | 'fish'
  | 'wool'
  | 'hide'
  | 'eggs'
  | 'feathers'
  // --- refined ----------------------------------------------------------
  | 'planks'
  | 'bricks'
  | 'charcoal'
  | 'iron_ingot'
  | 'gold_ingot'
  | 'flour'
  | 'tools'
  | 'furniture'
  | 'cloth'
  | 'leather'
  | 'arrows'
  | 'jewellery'
  // --- consumables ------------------------------------------------------
  | 'bread'
  | 'meat'
  | 'smoked_fish'
  | 'ale'
  | 'clothes'
  | 'boots'
  | 'candles';

export type GoodCategory = 'raw' | 'building' | 'refined' | 'food' | 'comfort';

export interface GoodDef {
  id: GoodId;
  name: string;
  short: string;
  category: GoodCategory;
  /**
   * The good's identity in the interface: a coloured pastille next to its
   * short name. No glyph — thirty-eight distinct emoji were indistinguishable
   * at HUD size and changed shape from one device to the next.
   */
  color: string;
  /** Nutrition per unit. 0 means it is not edible. */
  nutrition: number;
  /** Baseline market value in gold. Trade prices modulate around this. */
  value: number;
  /** How many units one villager carries per trip. */
  carry: number;
  /** Comfort goods raise happiness when consumed by households. */
  comfort?: number;
  description: string;
}

const def = (
  id: GoodId,
  name: string,
  short: string,
  category: GoodCategory,
  color: string,
  value: number,
  opts: Partial<GoodDef> = {},
): GoodDef => ({
  id,
  name,
  short,
  category,
  color,
  value,
  nutrition: 0,
  carry: 8,
  description: '',
  ...opts,
});

export const GOODS: Record<GoodId, GoodDef> = {
  logs: def('logs', 'Rondins', 'Rondins', 'raw', '#8a5a34', 2, {
    carry: 5,
    description: "Troncs bruts abattus en forêt. La scierie les transforme en planches.",
  }),
  stone: def('stone', 'Pierre', 'Pierre', 'building', '#9aa3ab', 3, {
    carry: 5,
    description: "Blocs extraits des carrières, base de tout bâtiment durable.",
  }),
  clay: def('clay', 'Argile', 'Argile', 'raw', '#b4703f', 2, {
    carry: 6,
    description: "Extraite près des berges, cuite en briques au four.",
  }),
  coal: def('coal', 'Charbon', 'Charbon', 'raw', '#3c3f45', 5, {
    carry: 6,
    description: "Combustible de mine. Indispensable aux forges et aux fours.",
  }),
  iron_ore: def('iron_ore', 'Minerai de fer', 'Fer brut', 'raw', '#7d6a5b', 6, {
    carry: 4,
    description: "Roche ferreuse, inutile tant qu'elle n'est pas fondue.",
  }),
  gold_ore: def('gold_ore', "Minerai d'or", 'Or brut', 'raw', '#c9a227', 14, {
    carry: 4,
    description: "Pépites brutes arrachées au filon.",
  }),
  wheat: def('wheat', 'Blé', 'Blé', 'raw', '#d8b martian', 3, {
    carry: 8,
    description: "Récolté aux champs à l'automne, moulu en farine.",
  }),
  flax: def('flax', 'Lin', 'Lin', 'raw', '#8fb996', 4, {
    carry: 8,
    description: "Fibre végétale filée en toile par les tisserands.",
  }),
  berries: def('berries', 'Baies', 'Baies', 'food', '#7b4a8a', 3, {
    nutrition: 1,
    carry: 8,
    description: "Cueillette de sous-bois. Nourrit peu mais tout de suite.",
  }),
  game: def('game', 'Gibier', 'Gibier', 'raw', '#6b4f3a', 7, {
    carry: 2,
    description: "Carcasse rapportée de la chasse. À porter à la boucherie.",
  }),
  fish: def('fish', 'Poisson', 'Poisson', 'food', '#4f8fa8', 4, {
    nutrition: 1.4,
    carry: 6,
    description: "Pêché en rivière ou en lac. Se conserve mal, se fume bien.",
  }),
  wool: def('wool', 'Laine', 'Laine', 'raw', '#e2ddd3', 5, {
    carry: 6,
    description: "Tondue sur les moutons, filée en tissu.",
  }),
  hide: def('hide', 'Peau', 'Peau', 'raw', '#96714a', 6, {
    carry: 5,
    description: "Dépouille de bête, tannée en cuir.",
  }),
  eggs: def('eggs', 'Œufs', 'Œufs', 'food', '#efe4cb', 3, {
    nutrition: 1.2,
    carry: 8,
    description: "Ramassés au poulailler chaque matin.",
  }),
  feathers: def('feathers', 'Plumes', 'Plumes', 'raw', '#dfe4e8', 4, {
    carry: 10,
    description: "Empennage des flèches, garniture des manteaux d'hiver.",
  }),

  planks: def('planks', 'Planches', 'Planches', 'building', '#c08a4f', 6, {
    carry: 6,
    description: "Bois scié, matériau de construction numéro un.",
  }),
  bricks: def('bricks', 'Briques', 'Briques', 'building', '#a8543a', 7, {
    carry: 5,
    description: "Argile cuite. Nécessaire aux bâtiments de prestige.",
  }),
  charcoal: def('charcoal', 'Charbon de bois', 'Charb. bois', 'refined', '#4b4642', 6, {
    carry: 6,
    description: "Alternative au charbon minier, produite dès le début de partie.",
  }),
  iron_ingot: def('iron_ingot', 'Lingot de fer', 'Lingot fer', 'refined', '#aeb6bd', 16, {
    carry: 4,
    description: "Métal fondu prêt pour la forge.",
  }),
  gold_ingot: def('gold_ingot', "Lingot d'or", "Lingot d'or", 'refined', '#e5c04a', 38, {
    carry: 4,
    description: "Or affiné. Se vend très cher aux grandes cités.",
  }),
  flour: def('flour', 'Farine', 'Farine', 'refined', '#e8e0cd', 6, {
    carry: 8,
    description: "Blé moulu au moulin à vent.",
  }),
  tools: def('tools', 'Outils', 'Outils', 'refined', '#8d949b', 20, {
    carry: 4,
    description: "Haches, pioches et faux. Accélèrent tous les métiers de récolte.",
  }),
  furniture: def('furniture', 'Mobilier', 'Mobilier', 'comfort', '#b07b46', 22, {
    carry: 3,
    comfort: 1.4,
    description: "Confort du foyer : les maisons meublées rendent heureux.",
  }),
  cloth: def('cloth', 'Tissu', 'Tissu', 'refined', '#cfc1a8', 12, {
    carry: 6,
    description: "Tissé à partir de laine ou de lin.",
  }),
  leather: def('leather', 'Cuir', 'Cuir', 'refined', '#7c5230', 13, {
    carry: 5,
    description: "Peaux tannées, base des bottes et des sacs.",
  }),
  arrows: def('arrows', 'Flèches', 'Flèches', 'refined', '#a8925f', 9, {
    carry: 10,
    description: "Consommées par les chasseurs : sans flèches, pas de gibier avancé.",
  }),
  jewellery: def('jewellery', 'Joaillerie', 'Joaillerie', 'comfort', '#f0d264', 70, {
    carry: 2,
    comfort: 2.2,
    description: "Objets d'orfèvrerie. Luxe pur, immense valeur marchande.",
  }),

  bread: def('bread', 'Pain', 'Pain', 'food', '#c98b46', 9, {
    nutrition: 3,
    carry: 6,
    description: "L'aliment le plus rentable : une farine, beaucoup de ventres remplis.",
  }),
  meat: def('meat', 'Viande', 'Viande', 'food', '#a14a3e', 10, {
    nutrition: 3.4,
    carry: 5,
    description: "Découpée à la boucherie à partir du gibier ou de l'élevage.",
  }),
  smoked_fish: def('smoked_fish', 'Poisson fumé', 'Poiss. fumé', 'food', '#7a6a4f', 9, {
    nutrition: 2.8,
    carry: 6,
    description: "Se conserve tout l'hiver.",
  }),
  ale: def('ale', 'Bière', 'Bière', 'comfort', '#c08830', 11, {
    nutrition: 0.6,
    carry: 5,
    comfort: 1.8,
    description: "La taverne en sert : rien ne remonte le moral aussi vite.",
  }),
  clothes: def('clothes', 'Vêtements', 'Vêtements', 'comfort', '#6f8fae', 26, {
    carry: 4,
    comfort: 1.6,
    description: "Protègent du froid et flattent l'orgueil du villageois.",
  }),
  boots: def('boots', 'Bottes', 'Bottes', 'comfort', '#6b4a2f', 24, {
    carry: 4,
    comfort: 1.2,
    description: "Des pieds au sec : déplacements plus rapides, moral en hausse.",
  }),
  candles: def('candles', 'Chandelles', 'Chandelles', 'comfort', '#f2e3a8', 14, {
    carry: 8,
    comfort: 1.0,
    description: "Les longues soirées d'hiver deviennent supportables.",
  }),
};

// Fix a typo-prone literal above in one place rather than in the table.
GOODS.wheat.color = '#d8b94a';

export const ALL_GOOD_IDS = Object.keys(GOODS) as GoodId[];

export const COMFORT_GOODS: GoodId[] = ALL_GOOD_IDS.filter((g) => (GOODS[g].comfort ?? 0) > 0);

