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
  /** Goods the partner sells to you. */
  sells: TradeOffer[];
  /** Goods the partner buys from you. */
  buys: TradeOffer[];
  blurb: string;
}

const P = (d: TradePartnerDef): TradePartnerDef => d;

export const TRADE_PARTNERS: TradePartnerDef[] = [
  P({
    id: 'aubepine',
    name: 'Aubépine',
    kind: 'hamlet',
    tier: 1,
    travel: 45,
    sells: [
      { good: 'berries', priceMul: 0.9, restock: 60 },
      { good: 'logs', priceMul: 1.1, restock: 80 },
      { good: 'wheat', priceMul: 1.15, restock: 50 },
    ],
    buys: [
      { good: 'planks', priceMul: 1.1, restock: 40 },
      { good: 'fish', priceMul: 1.2, restock: 50 },
      { good: 'tools', priceMul: 1.25, restock: 10 },
    ],
    blurb: "Un hameau de bûcherons à deux vallées d'ici. Petits volumes, mais toujours partants.",
  }),
  P({
    id: 'valmoreau',
    name: 'Valmoreau',
    kind: 'hamlet',
    tier: 1,
    travel: 60,
    sells: [
      { good: 'stone', priceMul: 1.2, restock: 60 },
      { good: 'clay', priceMul: 1.0, restock: 70 },
      { good: 'wool', priceMul: 1.15, restock: 30 },
    ],
    buys: [
      { good: 'bread', priceMul: 1.3, restock: 40 },
      { good: 'charcoal', priceMul: 1.2, restock: 40 },
      { good: 'boots', priceMul: 1.2, restock: 12 },
    ],
    blurb: "Des carriers taciturnes. Ils vendent leur pierre à bon prix quand la récolte est mauvaise.",
  }),
  P({
    id: 'pont_de_saule',
    name: 'Pont-de-Saule',
    kind: 'town',
    tier: 2,
    travel: 90,
    sells: [
      { good: 'iron_ore', priceMul: 1.15, restock: 60 },
      { good: 'coal', priceMul: 1.1, restock: 80 },
      { good: 'cloth', priceMul: 1.2, restock: 40 },
    ],
    buys: [
      { good: 'furniture', priceMul: 1.35, restock: 25 },
      { good: 'smoked_fish', priceMul: 1.3, restock: 60 },
      { good: 'ale', priceMul: 1.4, restock: 50 },
      { good: 'arrows', priceMul: 1.2, restock: 60 },
    ],
    blurb: "Bourg de tanneurs et de forgerons sur la grand-route. Bon débouché pour l'artisanat.",
  }),
  P({
    id: 'marchefort',
    name: 'Marchefort',
    kind: 'town',
    tier: 2,
    travel: 110,
    sells: [
      { good: 'tools', priceMul: 1.25, restock: 25 },
      { good: 'leather', priceMul: 1.15, restock: 40 },
      { good: 'flax', priceMul: 1.05, restock: 50 },
    ],
    buys: [
      { good: 'bread', priceMul: 1.3, restock: 80 },
      { good: 'meat', priceMul: 1.35, restock: 60 },
      { good: 'candles', priceMul: 1.3, restock: 40 },
      { good: 'bricks', priceMul: 1.2, restock: 60 },
    ],
    blurb: "Une place forte marchande. Ses greniers sont toujours vides et ses bourses pleines.",
  }),
  P({
    id: 'cite_haute',
    name: 'Cité-Haute',
    kind: 'city',
    tier: 3,
    travel: 170,
    sells: [
      { good: 'gold_ore', priceMul: 1.3, restock: 30 },
      { good: 'iron_ingot', priceMul: 1.2, restock: 50 },
      { good: 'tools', priceMul: 1.15, restock: 50 },
      { good: 'bricks', priceMul: 1.1, restock: 80 },
    ],
    buys: [
      { good: 'jewellery', priceMul: 1.6, restock: 12 },
      { good: 'clothes', priceMul: 1.45, restock: 40 },
      { good: 'furniture', priceMul: 1.4, restock: 40 },
      { good: 'gold_ingot', priceMul: 1.35, restock: 25 },
    ],
    blurb: "Capitale provinciale. Elle paie le luxe au prix fort — et vend l'or brut aux impatients.",
  }),
  P({
    id: 'port_argente',
    name: 'Port-Argenté',
    kind: 'city',
    tier: 3,
    travel: 200,
    sells: [
      { good: 'cloth', priceMul: 1.1, restock: 80 },
      { good: 'smoked_fish', priceMul: 1.05, restock: 100 },
      { good: 'gold_ingot', priceMul: 1.45, restock: 15 },
    ],
    buys: [
      { good: 'planks', priceMul: 1.3, restock: 140 },
      { good: 'boots', priceMul: 1.4, restock: 50 },
      { good: 'ale', priceMul: 1.45, restock: 80 },
      { good: 'tools', priceMul: 1.3, restock: 40 },
    ],
    blurb: "Un port de haute mer. Volumes énormes, et un appétit sans fond pour le bois et le cuir.",
  }),
  P({
    id: 'khared_oasis',
    name: "Kharel de l'Oasis",
    kind: 'foreign',
    tier: 4,
    travel: 280,
    sells: [
      { good: 'jewellery', priceMul: 0.85, restock: 10 },
      { good: 'gold_ingot', priceMul: 1.1, restock: 30 },
      { good: 'cloth', priceMul: 0.9, restock: 120 },
    ],
    buys: [
      { good: 'smoked_fish', priceMul: 1.7, restock: 100 },
      { good: 'leather', priceMul: 1.6, restock: 80 },
      { good: 'candles', priceMul: 1.55, restock: 80 },
      { good: 'furniture', priceMul: 1.5, restock: 60 },
    ],
    blurb: "Caravanes venues du sud. Lointaines, lentes, mais leurs marges sont légendaires.",
  }),
];

export const PARTNER_KIND_LABEL: Record<TradePartnerDef['kind'], string> = {
  hamlet: 'Hameau',
  town: 'Bourg',
  city: 'Cité',
  foreign: 'Lointain',
};
