import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/sim/simulation';
import { buyPrice, orderBuy, orderSell, sellPrice } from '../src/sim/economy';
import {
  EXPORTABLE_GOODS,
  IMPORTABLE_GOODS,
  TRADE_PARTNERS,
  type TradePartnerDef,
} from '../src/data/trade';
import { ALL_GOOD_IDS, GOODS } from '../src/data/goods';
import { SEASONS } from '../src/sim/types';
import type { World } from '../src/sim/world';

/** A world where every road is open, every partner is a friend, and the
 *  village is a great city — the most favourable prices the game can offer. */
function bestCase(seed: string): World {
  const w = createNewGame({ seed }).world;
  w.modifiers.tradeTier = 4;
  w.stats.tier = 6;
  for (const rt of w.partners.values()) rt.relation = 100;
  return w;
}

describe('the trade network', () => {
  /**
   * The rule the whole table is built on. Break it and the network prints
   * money: Kharel once sold jewellery at 0.85 times its value while Cité-Haute
   * paid 1.65, which turned 629 coins into 1 943 a caravan, for ever, with no
   * production involved.
   */
  it('never sells a good that anybody else buys', () => {
    const overlap = IMPORTABLE_GOODS.filter((g) => EXPORTABLE_GOODS.includes(g));
    expect(overlap).toEqual([]);
  });

  it('offers no risk-free round trip, in any season, at the best prices in the game', () => {
    const w = bestCase('arbitrage');
    const loops: string[] = [];
    for (const season of SEASONS) {
      w.time.season = season;
      for (const g of ALL_GOOD_IDS) {
        let cheapest = Infinity;
        let dearest = 0;
        for (const p of TRADE_PARTNERS) {
          if (p.sells.some((o) => o.good === g)) cheapest = Math.min(cheapest, buyPrice(w, p, g));
          if (p.buys.some((o) => o.good === g)) dearest = Math.max(dearest, sellPrice(w, p, g));
        }
        if (!Number.isFinite(cheapest) || dearest <= 0) continue;
        if (dearest > cheapest) loops.push(`${season}/${g}: ${cheapest} → ${dearest}`);
      }
    }
    expect(loops).toEqual([]);
  });

  it('keeps every partner distinct in what it wants', () => {
    const seen = new Set<string>();
    for (const p of TRADE_PARTNERS) {
      expect(p.sells.length + p.buys.length).toBeGreaterThan(2);
      expect(p.specialty.length).toBeGreaterThan(3);
      // Two partners may share a good, but never the same complete basket.
      const basket = [...p.buys.map((o) => o.good)].sort().join(',');
      expect(seen.has(basket)).toBe(false);
      seen.add(basket);
    }
  });

  it('spreads the network across every tier of the research tree', () => {
    for (const tier of [1, 2, 3, 4]) {
      expect(TRADE_PARTNERS.filter((p) => p.tier === tier).length).toBeGreaterThan(1);
    }
  });

  it('prices the same good differently from one partner to the next', () => {
    const w = bestCase('prices');
    let compared = 0;
    for (const g of EXPORTABLE_GOODS) {
      const buyers = TRADE_PARTNERS.filter((p) => p.buys.some((o) => o.good === g));
      if (buyers.length < 2) continue;
      compared++;
      const prices = buyers.map((p: TradePartnerDef) => sellPrice(w, p, g));
      expect(new Set(prices).size).toBeGreaterThan(1);
    }
    expect(compared).toBeGreaterThan(2);
  });

  it('lets the season move a partner and not only the goods', () => {
    const w = bestCase('seasons');
    // Hauteroche is snowed in every winter and pays for it.
    const mountain = TRADE_PARTNERS.find((p) => p.id === 'hauteroche')!;
    w.time.season = 'summer';
    const summer = sellPrice(w, mountain, 'clothes');
    w.time.season = 'winter';
    const winter = sellPrice(w, mountain, 'clothes');
    expect(winter).toBeGreaterThan(summer);
  });

  it('still settles a real purchase and a real sale', () => {
    const sim = createNewGame({ seed: 'settle' });
    const w = sim.world;
    w.modifiers.tradeTier = 4;
    w.treasury = 5000;
    // A trade post, so the counter is open. Its study is not done, so the
    // placement check is bypassed the way a test harness must.
    w.research.completed.add('r_trade_post');
    let post = null;
    for (let r = 3; r < 40 && !post; r++) {
      for (let a = 0; a < 32; a++) {
        const ang = (a / 32) * Math.PI * 2;
        const x = Math.round(w.startX + Math.cos(ang) * r);
        const y = Math.round(w.startY + Math.sin(ang) * r);
        if (!w.canPlace('trade_post', x, y).ok) continue;
        post = w.place('trade_post', x, y, 0, true);
        if (post) break;
      }
    }
    expect(post).toBeTruthy();

    const seller = TRADE_PARTNERS.find((p) => p.sells.some((o) => o.good === 'logs'))!;
    const before = w.treasury;
    expect(orderBuy(w, seller.id, 'logs', 10).ok).toBe(true);
    expect(w.treasury).toBeLessThan(before);

    w.addToStock('planks', 40);
    const buyer = TRADE_PARTNERS.find((p) => p.buys.some((o) => o.good === 'planks'))!;
    expect(orderSell(w, buyer.id, 'planks', 10).ok).toBe(true);
    expect(w.contracts.length).toBe(2);
  });

  it('prices everything it trades above nothing', () => {
    const w = bestCase('sane');
    for (const p of TRADE_PARTNERS) {
      for (const o of p.sells) {
        expect(buyPrice(w, p, o.good)).toBeGreaterThan(0);
        expect(GOODS[o.good].value).toBeGreaterThan(0);
      }
      for (const o of p.buys) expect(sellPrice(w, p, o.good)).toBeGreaterThan(0);
    }
  });
});
