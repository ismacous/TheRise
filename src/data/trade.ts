import type { Season } from '../sim/types';
import type { GoodId } from './goods';

export interface TradeOffer {
  good: GoodId;
  /** Price multiplier applied to the good's base value. */
  priceMul: number;
  /** Units the partner restocks per trade cycle. */
  restock: number;
}

export interface TradePartnerDef {
  id: string;
  name: string;
  kind: 'hamlet' | 'town' | 'city' | 'foreign';
  /** Minimum trade tier (granted by research) required to deal with them. */
  tier: number;
  /** Caravan travel time in seconds, one way. */
  travel: number;
  /** What this place is known for, in three or four words. */
  specialty: string;
  /**
   * Price multiplier by season, on top of the global one on food. It is what
   * makes two partners who buy the same thing worth telling apart: the
   * mountain pays for grain in winter, the port pays for preserved food when
   * the boats stop sailing.
   */
  seasonBias?: Partial<Record<Season, number>>;
  /** Raw goods the partner sells to you. */
  sells: TradeOffer[];
  /** Worked goods the partner buys from you. */
  buys: TradeOffer[];
  blurb: string;
}

const P = (d: TradePartnerDef): TradePartnerDef => d;

/**
 * The trading network.
 *
 * One rule governs the whole table, and a test enforces it: **no good is both
 * sold and bought anywhere in the network.** Partners sell raw materials and
 * buy worked ones, full stop.
 *
 * Without that rule the network printed money. Kharel sold jewellery at 0.85
 * times its value and Cité-Haute paid 1.6; with the relationship discount on
 * one side and the prestige bonus on the other, a caravan of twelve pieces
 * turned 629 coins into 1 943 — a 209 % return, repeatable for ever, no
 * production involved. Five other goods had the same loop. Taxes, workshops
 * and the whole research tree became irrelevant the moment era 3 opened.
 *
 * So the player's profit comes from *transforming* things, which is what the
 * production chains are for: buy the ore, sell the tools.
 */
export const TRADE_PARTNERS: TradePartnerDef[] = [
  // ══ Tier 1 — hamlets: raw materials, small volumes, short roads ══════════
  P({
    id: 'aubepine',
    name: 'Aubépine',
    kind: 'hamlet',
    tier: 1,
    travel: 45,
    specialty: 'Bûcherons',
    seasonBias: { winter: 1.15 },
    sells: [
      { good: 'logs', priceMul: 0.95, restock: 90 },
      { good: 'berries', priceMul: 0.9, restock: 60 },
      { good: 'game', priceMul: 1.05, restock: 25 },
    ],
    buys: [
      { good: 'planks', priceMul: 1.15, restock: 40 },
      { good: 'tools', priceMul: 1.3, restock: 10 },
      { good: 'bread', priceMul: 1.2, restock: 40 },
    ],
    blurb:
      "Un hameau de bûcherons à deux vallées d'ici. Ils ont du bois de reste et pas une seule scie : l'hiver, ils paient tout plus cher.",
  }),
  P({
    id: 'valmoreau',
    name: 'Valmoreau',
    kind: 'hamlet',
    tier: 1,
    travel: 60,
    specialty: 'Carriers',
    seasonBias: { autumn: 1.1 },
    sells: [
      { good: 'stone', priceMul: 1.0, restock: 70 },
      { good: 'clay', priceMul: 0.9, restock: 80 },
    ],
    buys: [
      { good: 'bread', priceMul: 1.3, restock: 40 },
      { good: 'charcoal', priceMul: 1.25, restock: 40 },
      { good: 'boots', priceMul: 1.35, restock: 12 },
    ],
    blurb:
      "Des carriers taciturnes. Ils cassent de la pierre toute l'année et usent leurs bottes à la même vitesse.",
  }),
  P({
    id: 'chaume_les_pres',
    name: 'Chaume-les-Prés',
    kind: 'hamlet',
    tier: 1,
    travel: 70,
    specialty: 'Laboureurs',
    seasonBias: { autumn: 0.85, spring: 1.2 },
    sells: [
      { good: 'wheat', priceMul: 1.0, restock: 80 },
      { good: 'wool', priceMul: 1.05, restock: 40 },
      { good: 'eggs', priceMul: 0.95, restock: 50 },
    ],
    buys: [
      { good: 'tools', priceMul: 1.35, restock: 14 },
      { good: 'cloth', priceMul: 1.2, restock: 30 },
      { good: 'ale', priceMul: 1.3, restock: 40 },
    ],
    blurb:
      "Des fermes dispersées sur un plateau. Après la moisson ils bradent le grain ; au printemps ils le rachètent au prix fort.",
  }),

  // ══ Tier 2 — towns: the first real money, and the first real distances ═══
  P({
    id: 'pont_de_saule',
    name: 'Pont-de-Saule',
    kind: 'town',
    tier: 2,
    travel: 90,
    specialty: 'Tanneurs et forgerons',
    sells: [
      { good: 'coal', priceMul: 1.05, restock: 90 },
      { good: 'hide', priceMul: 1.0, restock: 50 },
    ],
    buys: [
      { good: 'furniture', priceMul: 1.4, restock: 25 },
      { good: 'smoked_fish', priceMul: 1.3, restock: 60 },
      { good: 'ale', priceMul: 1.45, restock: 50 },
      { good: 'arrows', priceMul: 1.25, restock: 60 },
    ],
    blurb:
      "Bourg de tanneurs et de forgerons sur la grand-route. Ils ont le charbon et les peaux, jamais le temps de travailler le bois.",
  }),
  P({
    id: 'marchefort',
    name: 'Marchefort',
    kind: 'town',
    tier: 2,
    travel: 110,
    specialty: 'Place marchande',
    seasonBias: { winter: 1.25 },
    sells: [
      { good: 'flax', priceMul: 0.95, restock: 60 },
      { good: 'iron_ore', priceMul: 1.1, restock: 70 },
    ],
    buys: [
      { good: 'bread', priceMul: 1.35, restock: 80 },
      { good: 'meat', priceMul: 1.4, restock: 60 },
      { good: 'candles', priceMul: 1.35, restock: 40 },
      { good: 'bricks', priceMul: 1.25, restock: 60 },
    ],
    blurb:
      "Une place forte marchande. Ses greniers sont toujours vides et ses bourses pleines — et l'hiver, ses prix s'envolent.",
  }),
  P({
    id: 'hauteroche',
    name: 'Hauteroche',
    kind: 'town',
    tier: 2,
    travel: 130,
    specialty: 'Mineurs de montagne',
    seasonBias: { winter: 1.35, summer: 0.9 },
    sells: [
      { good: 'iron_ore', priceMul: 1.0, restock: 80 },
      { good: 'coal', priceMul: 0.95, restock: 100 },
      { good: 'stone', priceMul: 0.9, restock: 90 },
    ],
    buys: [
      { good: 'bread', priceMul: 1.4, restock: 70 },
      { good: 'clothes', priceMul: 1.45, restock: 30 },
      { good: 'ale', priceMul: 1.4, restock: 50 },
      { good: 'smoked_fish', priceMul: 1.3, restock: 50 },
    ],
    blurb:
      "Accrochée à un col, riche en minerai et pauvre en tout le reste. Dès les premières neiges elle paie n'importe quoi pour manger.",
  }),

  // ══ Tier 3 — cities: the luxury market ═══════════════════════════════════
  P({
    id: 'cite_haute',
    name: 'Cité-Haute',
    kind: 'city',
    tier: 3,
    travel: 170,
    specialty: 'Capitale provinciale',
    sells: [
      { good: 'gold_ore', priceMul: 1.15, restock: 35 },
      { good: 'clay', priceMul: 1.0, restock: 100 },
    ],
    buys: [
      { good: 'jewellery', priceMul: 1.65, restock: 12 },
      { good: 'clothes', priceMul: 1.5, restock: 40 },
      { good: 'furniture', priceMul: 1.45, restock: 40 },
      { good: 'gold_ingot', priceMul: 1.4, restock: 25 },
    ],
    blurb:
      "Capitale provinciale. Elle paie le luxe au prix fort et vend son minerai d'or à qui sait le fondre.",
  }),
  P({
    id: 'port_argente',
    name: 'Port-Argenté',
    kind: 'city',
    tier: 3,
    travel: 200,
    specialty: 'Port de haute mer',
    seasonBias: { winter: 1.2, summer: 1.1 },
    sells: [
      { good: 'fish', priceMul: 0.85, restock: 120 },
      { good: 'flax', priceMul: 0.9, restock: 90 },
    ],
    buys: [
      { good: 'planks', priceMul: 1.35, restock: 140 },
      { good: 'boots', priceMul: 1.45, restock: 50 },
      { good: 'ale', priceMul: 1.5, restock: 80 },
      { good: 'tools', priceMul: 1.35, restock: 40 },
    ],
    blurb:
      "Un port de haute mer. Volumes énormes, un appétit sans fond pour le bois, et du poisson à ne plus savoir qu'en faire.",
  }),

  // ══ Tier 4 — the far roads: enormous margins, enormous journeys ══════════
  P({
    id: 'khared_oasis',
    name: "Kharel de l'Oasis",
    kind: 'foreign',
    tier: 4,
    travel: 280,
    specialty: 'Caravanes du sud',
    seasonBias: { summer: 1.2 },
    sells: [
      { good: 'gold_ore', priceMul: 1.05, restock: 40 },
      { good: 'wool', priceMul: 0.85, restock: 120 },
    ],
    buys: [
      { good: 'smoked_fish', priceMul: 1.8, restock: 100 },
      { good: 'leather', priceMul: 1.7, restock: 80 },
      { good: 'candles', priceMul: 1.6, restock: 80 },
      { good: 'furniture', priceMul: 1.55, restock: 60 },
    ],
    blurb:
      "Caravanes venues du sud. Lointaines, lentes, mais leurs marges sont légendaires — surtout en plein été.",
  }),
  P({
    id: 'thulmark',
    name: 'Thulmark du Nord',
    kind: 'foreign',
    tier: 4,
    travel: 310,
    specialty: 'Comptoirs du nord',
    seasonBias: { winter: 1.3, autumn: 1.1 },
    sells: [
      { good: 'hide', priceMul: 0.85, restock: 90 },
      { good: 'feathers', priceMul: 0.9, restock: 110 },
      { good: 'fish', priceMul: 0.8, restock: 130 },
    ],
    buys: [
      { good: 'bread', priceMul: 1.55, restock: 90 },
      { good: 'tools', priceMul: 1.5, restock: 50 },
      { good: 'clothes', priceMul: 1.6, restock: 60 },
      { good: 'iron_ingot', priceMul: 1.45, restock: 60 },
    ],
    blurb:
      "Des comptoirs de fourrures au bord de la banquise. Ils ont les peaux et le poisson, rien qui pousse, et pas une forge.",
  }),
];

export const PARTNER_KIND_LABEL: Record<TradePartnerDef['kind'], string> = {
  hamlet: 'Hameau',
  town: 'Bourg',
  city: 'Cité',
  foreign: 'Lointain',
};

/** Everything the network will sell you. */
export const IMPORTABLE_GOODS: GoodId[] = [
  ...new Set(TRADE_PARTNERS.flatMap((p) => p.sells.map((o) => o.good))),
];

/** Everything the network will buy from you. */
export const EXPORTABLE_GOODS: GoodId[] = [
  ...new Set(TRADE_PARTNERS.flatMap((p) => p.buys.map((o) => o.good))),
];
