import { clamp } from '../core/util';
import { GOODS, type GoodId } from '../data/goods';
import { TRADE_PARTNERS, type TradePartnerDef } from '../data/trade';
import { DAY_SECONDS } from './world';
import type { TradeContract } from './types';
import type { World } from './world';

/** Coin a single adult contributes per day at the neutral rate, full morale. */
const TAX_PER_ADULT_PER_DAY = 2.2;
/** Happiness swing between a tax-free village and a confiscatory one. */
const TAX_HAPPINESS_SWING = 26;

let nextContractId = 1;

export interface PartnerRuntime {
  /** Units currently available for each good the partner sells. */
  stock: Partial<Record<GoodId, number>>;
  /** Units the partner is still willing to buy this cycle. */
  demand: Partial<Record<GoodId, number>>;
  /** 0..100, grows with completed trades and unlocks better prices. */
  relation: number;
}

export function createPartnerRuntime(p: TradePartnerDef): PartnerRuntime {
  const stock: Partial<Record<GoodId, number>> = {};
  const demand: Partial<Record<GoodId, number>> = {};
  for (const o of p.sells) stock[o.good] = o.restock;
  for (const o of p.buys) demand[o.good] = o.restock;
  return { stock, demand, relation: 10 };
}

export function availablePartners(world: World): TradePartnerDef[] {
  return TRADE_PARTNERS.filter((p) => p.tier <= world.modifiers.tradeTier);
}

export function hasTradePost(world: World): boolean {
  return world.buildingList.some((b) => b.def === 'trade_post' && b.state === 'active');
}

/**
 * Food gets dearer as the cold closes in and cheap again after the harvest.
 * It applies to both directions, so a well-stocked granary turns winter into
 * a trading opportunity instead of a pure loss.
 */
export function seasonalPriceFactor(world: World, good: GoodId): number {
  if (GOODS[good].nutrition <= 0) return 1;
  switch (world.time.season) {
    case 'winter':
      return 1.45;
    case 'autumn':
      return 0.85;
    case 'spring':
      return 1.15;
    default:
      return 1;
  }
}

/** Price the partner charges you per unit when buying from them. */
export function buyPrice(world: World, p: TradePartnerDef, good: GoodId): number {
  const offer = p.sells.find((o) => o.good === good);
  if (!offer) return Infinity;
  const rt = world.partners.get(p.id)!;
  const relationDiscount = 1 - (rt.relation / 100) * 0.12;
  const season = seasonalPriceFactor(world, good);
  return Math.max(1, Math.round(GOODS[good].value * offer.priceMul * relationDiscount * season * 10) / 10);
}

/** Price the partner pays you per unit when selling to them. */
export function sellPrice(world: World, p: TradePartnerDef, good: GoodId): number {
  const offer = p.buys.find((o) => o.good === good);
  if (!offer) return 0;
  const rt = world.partners.get(p.id)!;
  const relationBonus = 1 + (rt.relation / 100) * 0.18;
  // Reputation of the village itself nudges prices up as it grows.
  const prestige = 1 + (world.stats.tier - 1) * 0.045;
  const season = seasonalPriceFactor(world, good);
  return Math.max(
    1,
    Math.round(GOODS[good].value * offer.priceMul * relationBonus * prestige * season * 10) / 10,
  );
}

export interface TradeResult {
  ok: boolean;
  reason: string;
}

export function orderBuy(world: World, partnerId: string, good: GoodId, amount: number): TradeResult {
  const p = TRADE_PARTNERS.find((x) => x.id === partnerId);
  if (!p) return { ok: false, reason: 'Partenaire inconnu' };
  if (!hasTradePost(world)) return { ok: false, reason: 'Comptoir de commerce requis' };
  if (p.tier > world.modifiers.tradeTier) return { ok: false, reason: 'Route non débloquée' };
  const rt = world.partners.get(p.id)!;
  const available = Math.floor(rt.stock[good] ?? 0);
  if (available <= 0) return { ok: false, reason: 'Rupture de stock' };
  const qty = Math.min(amount, available);
  const unit = buyPrice(world, p, good);
  const total = unit * qty;
  if (world.treasury < total) return { ok: false, reason: "Pas assez d'or" };

  world.treasury -= total;
  rt.stock[good] = available - qty;
  const c: TradeContract = {
    id: nextContractId++,
    partnerId,
    direction: 'buy',
    good,
    amount: qty,
    unitPrice: unit,
    eta: p.travel,
    totalTravel: p.travel,
    state: 'outbound',
  };
  world.contracts.push(c);
  world.notify(`Caravane partie vers ${p.name} — achat de ${qty} ${GOODS[good].name}`, '🐎', 'neutral');
  return { ok: true, reason: '' };
}

export function orderSell(world: World, partnerId: string, good: GoodId, amount: number): TradeResult {
  const p = TRADE_PARTNERS.find((x) => x.id === partnerId);
  if (!p) return { ok: false, reason: 'Partenaire inconnu' };
  if (!hasTradePost(world)) return { ok: false, reason: 'Comptoir de commerce requis' };
  if (p.tier > world.modifiers.tradeTier) return { ok: false, reason: 'Route non débloquée' };
  const rt = world.partners.get(p.id)!;
  const wanted = Math.floor(rt.demand[good] ?? 0);
  if (wanted <= 0) return { ok: false, reason: "Ils n'en veulent pas" };
  const have = world.stockOf(good);
  const qty = Math.min(amount, wanted, have);
  if (qty <= 0) return { ok: false, reason: 'Stock insuffisant' };

  world.takeFromStock(good, qty);
  rt.demand[good] = wanted - qty;
  const unit = sellPrice(world, p, good);
  const c: TradeContract = {
    id: nextContractId++,
    partnerId,
    direction: 'sell',
    good,
    amount: qty,
    unitPrice: unit,
    eta: p.travel,
    totalTravel: p.travel,
    state: 'outbound',
  };
  world.contracts.push(c);
  world.notify(`Caravane partie vers ${p.name} — vente de ${qty} ${GOODS[good].name}`, '🐎', 'neutral');
  return { ok: true, reason: '' };
}

export function updateEconomy(world: World, dt: number): void {
  // ── Caravans ────────────────────────────────────────────────────────────
  for (let i = world.contracts.length - 1; i >= 0; i--) {
    const c = world.contracts[i];
    c.eta -= dt;
    if (c.eta > 0) continue;
    const p = TRADE_PARTNERS.find((x) => x.id === c.partnerId)!;
    const rt = world.partners.get(c.partnerId)!;
    if (c.direction === 'buy') {
      const leftover = world.addToStock(c.good, c.amount);
      if (leftover > 0) {
        // No room left: the goods are sold back at a loss rather than vanishing.
        world.treasury += leftover * c.unitPrice * 0.5;
        world.notify(
          `Entrepôts pleins : ${leftover} ${GOODS[c.good].name} revendus à perte`,
          '⚠️',
          'bad',
        );
      }
      world.notify(`${c.amount} ${GOODS[c.good].name} livrés par ${p.name}`, '📦', 'good');
    } else {
      const income = c.amount * c.unitPrice;
      world.treasury += income;
      world.tradeIncomeWindow += income;
      world.notify(
        `${p.name} paie ${Math.round(income)} pièces pour ${c.amount} ${GOODS[c.good].name}`,
        '💰',
        'good',
      );
    }
    rt.relation = clamp(rt.relation + 2.5, 0, 100);
    world.contracts.splice(i, 1);
  }

  // ── Partner restocking ──────────────────────────────────────────────────
  for (const p of TRADE_PARTNERS) {
    const rt = world.partners.get(p.id);
    if (!rt) continue;
    const rate = dt / 90;
    for (const o of p.sells) {
      rt.stock[o.good] = Math.min(o.restock, (rt.stock[o.good] ?? 0) + o.restock * rate);
    }
    for (const o of p.buys) {
      rt.demand[o.good] = Math.min(o.restock, (rt.demand[o.good] ?? 0) + o.restock * rate);
    }
    rt.relation = clamp(rt.relation - dt * 0.004, 0, 100);
  }

  // ── Daily taxes ─────────────────────────────────────────────────────────
  // A couple of coins per adult per day at the neutral rate and decent morale,
  // scaled by prestige. This is what pays for research, so the whole tree is
  // balanced against it.
  const taxes = taxIncome(world) * dt;
  world.treasury += taxes;
  world.taxIncomeWindow += taxes;
}

/** Coin per second the village collects at its current rate and morale. */
export function taxIncome(world: World): number {
  const prestige = 1 + (world.stats.tier - 1) * 0.18;
  const morale = 0.5 + world.stats.happiness / 100;
  return (world.stats.adults * TAX_PER_ADULT_PER_DAY * world.taxRate * 2 * morale * prestige) / DAY_SECONDS;
}

/**
 * Happiness swing from the tax rate. Free-riding villagers are delighted, a
 * confiscatory rate is the fastest way to empty a village.
 */
export function taxHappiness(world: World): number {
  return (0.5 - world.taxRate) * TAX_HAPPINESS_SWING;
}

/** Village tier, from hamlet (1) to great city (6). */
export function computeTier(world: World): number {
  const pop = world.stats.population;
  const happy = world.stats.happiness;
  const services = world.buildingList.filter(
    (b) => b.state === 'active' && ['market', 'chapel', 'tavern', 'university', 'grand_market'].includes(b.def),
  ).length;
  let tier = 1;
  if (pop >= 25 && happy >= 45) tier = 2;
  if (pop >= 60 && happy >= 50 && services >= 2) tier = 3;
  if (pop >= 120 && happy >= 55 && services >= 4) tier = 4;
  if (pop >= 220 && happy >= 60 && services >= 5) tier = 5;
  if (pop >= 380 && happy >= 65 && services >= 6) tier = 6;
  return tier;
}

export const TIER_NAMES = [
  '',
  'Hameau en ruine',
  'Village',
  'Gros bourg',
  'Ville',
  'Cité',
  'Grande cité',
];
