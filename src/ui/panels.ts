import { formatDuration, formatNumber } from '../core/util';
import {
  BUILDINGS,
  BUILDINGS_BY_CATEGORY,
  CATEGORY_LABELS,
  type BuildingCategory,
  type BuildingId,
} from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import { PROFESSIONS } from '../data/professions';
import { BRANCH_LABELS, RESEARCH, type ResearchBranch, type ResearchId } from '../data/research';
import { PARTNER_KIND_LABEL, TRADE_PARTNERS } from '../data/trade';
import {
  availablePartners,
  buyPrice,
  hasTradePost,
  orderBuy,
  orderSell,
  sellPrice,
  TIER_NAMES,
} from '../sim/economy';
import { activeRecipe, recipeOptions, setRecipe } from '../sim/recipes';
import { availableResearch, canStartResearch, cancelResearch, researchRate, startResearch } from '../sim/research';
import { fullName } from '../sim/villagers';
import type { Building, Villager } from '../sim/types';
import type { GameApi, SheetId } from './api';
import { bar, el, onTap } from './dom';

type Refresh = () => void;

export function sheetTitle(id: SheetId, api: GameApi): { title: string; sub?: string } {
  const w = api.world;
  switch (id) {
    case 'build':
      return { title: 'Construire', sub: 'Posez vos bâtiments sur la carte' };
    case 'research':
      return {
        title: 'Savoir',
        sub: `${Math.floor(w.research.points)} points · +${researchRate(w).toFixed(2)}/s`,
      };
    case 'trade':
      return { title: 'Commerce', sub: `${Math.round(w.treasury)} pièces en caisse` };
    case 'people':
      return {
        title: 'Villageois',
        sub: `${w.stats.population} habitants · ${w.stats.idle} sans emploi`,
      };
    case 'village':
      return { title: TIER_NAMES[w.stats.tier] ?? 'Village', sub: `Rang ${w.stats.tier} / 6` };
    case 'settings':
      return { title: 'Options' };
    case 'building': {
      const b = api.selectedBuildingId ? w.buildings.get(api.selectedBuildingId) : null;
      return b ? { title: BUILDINGS[b.def].name } : { title: 'Bâtiment' };
    }
  }
}

export function renderSheet(id: SheetId, api: GameApi, body: HTMLElement, refresh: Refresh): void {
  switch (id) {
    case 'build':
      return renderBuild(api, body, refresh);
    case 'research':
      return renderResearch(api, body, refresh);
    case 'trade':
      return renderTrade(api, body, refresh);
    case 'people':
      return renderPeople(api, body, refresh);
    case 'village':
      return renderVillage(api, body, refresh);
    case 'building':
      return renderBuilding(api, body, refresh);
    case 'settings':
      return renderSettings(api, body, refresh);
  }
}

// ── Build ──────────────────────────────────────────────────────────────────

const CATEGORY_ORDER: BuildingCategory[] = [
  'gathering',
  'industry',
  'crafting',
  'farming',
  'housing',
  'storage',
  'service',
  'civic',
  'infrastructure',
];

let buildCategory: BuildingCategory = 'gathering';

function renderBuild(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const tabs = el('div', { class: 'tabs' });
  for (const cat of CATEGORY_ORDER) {
    const defs = (BUILDINGS_BY_CATEGORY.get(cat) ?? []).filter((d) => d.id !== 'town_hall');
    if (defs.length === 0) continue;
    const unlockedCount = defs.filter((d) => !d.requires || w.research.completed.has(d.requires)).length;
    const label = CATEGORY_LABELS[cat];
    const tab = el('button', {
      class: `tab ${cat === buildCategory ? 'active' : ''}`,
      text: `${label.icon} ${label.name} ${unlockedCount}/${defs.length}`,
    });
    onTap(tab, () => {
      buildCategory = cat;
      refresh();
    });
    tabs.append(tab);
  }
  body.append(tabs);

  const grid = el('div', { class: 'card-grid' });
  const defs = (BUILDINGS_BY_CATEGORY.get(buildCategory) ?? []).filter((d) => d.id !== 'town_hall');
  // Unlocked first, then the locked ones as a visible goal.
  defs.sort((a, b) => {
    const au = !a.requires || w.research.completed.has(a.requires) ? 0 : 1;
    const bu = !b.requires || w.research.completed.has(b.requires) ? 0 : 1;
    return au - bu || a.tier - b.tier;
  });

  for (const def of defs) {
    const unlocked = !def.requires || w.research.completed.has(def.requires);
    const affordable =
      unlocked &&
      w.treasury >= def.goldCost &&
      Object.entries(def.cost).every(([g, n]) => w.stockOf(g as GoodId) >= (n as number));

    const card = el('div', {
      class: `card ${unlocked ? '' : 'locked'} ${affordable ? 'affordable' : ''}`,
    });
    card.append(
      el('div', { class: 'card-title' }, [
        el('span', { class: 'ic', text: iconFor(def.id) }),
        el('span', { text: def.name }),
      ]),
      el('div', { class: 'card-desc', text: def.desc }),
    );

    const costs = el('div', { class: 'cost-row' });
    if (def.goldCost > 0) {
      costs.append(
        el('span', { class: `cost ${w.treasury < def.goldCost ? 'missing' : ''}` }, [
          el('span', { text: '🪙' }),
          el('span', { text: String(def.goldCost) }),
        ]),
      );
    }
    for (const [g, n] of Object.entries(def.cost)) {
      const good = g as GoodId;
      const missing = w.stockOf(good) < (n as number);
      const dot = el('span', { class: 'dot' });
      dot.style.background = GOODS[good].color;
      costs.append(
        el('span', { class: `cost ${missing ? 'missing' : ''}`, title: GOODS[good].name }, [
          dot,
          el('span', { text: `${GOODS[good].short} ${n}` }),
        ]),
      );
    }
    if (def.workers > 0) {
      costs.append(el('span', { class: 'cost' }, [el('span', { text: `👷 ${def.workers}` })]));
    }
    card.append(costs);

    if (!unlocked && def.requires) {
      card.append(
        el('div', { class: 'card-desc', text: `🔒 ${RESEARCH[def.requires].name}` }),
      );
    } else {
      onTap(card, () => {
        api.beginPlacement(def.id);
        api.closeSheet();
      });
    }
    grid.append(card);
  }
  body.append(grid);
}

/** A readable glyph per building, reused by every panel. */
export function iconFor(id: BuildingId): string {
  const map: Partial<Record<BuildingId, string>> = {
    town_hall: '🏛️',
    shack: '🛖',
    cottage: '🏠',
    house: '🏡',
    manor: '🏘️',
    storehouse: '📦',
    warehouse: '🏚️',
    granary: '🌾',
    woodcutter_camp: '🪓',
    lumber_camp: '🌲',
    forester_hut: '🌱',
    gatherer_hut: '🧺',
    hunter_camp: '🏹',
    hunting_lodge: '🦌',
    fisher_hut: '🎣',
    fishing_pier: '🛶',
    fishing_dock: '⛵',
    fishing_harbour: '⚓',
    quarry: '🪨',
    great_quarry: '⛏️',
    clay_pit: '🏺',
    coal_mine: '⚫',
    iron_mine: '⚒️',
    gold_mine: '✨',
    deep_mine: '🕳️',
    wheat_field: '🌾',
    flax_field: '🌿',
    chicken_coop: '🐔',
    sheep_pasture: '🐑',
    cattle_pasture: '🐄',
    sawmill: '🪚',
    water_sawmill: '💧',
    charcoal_burner: '🔥',
    brick_kiln: '🧱',
    smelter: '🌋',
    blacksmith: '🔨',
    goldsmith: '💍',
    butcher: '🔪',
    smokehouse: '🐠',
    windmill: '🌬️',
    bakery: '🍞',
    brewery: '🍺',
    weaver: '🧵',
    tailor: '👕',
    tannery: '🟤',
    cobbler: '🥾',
    carpenter: '🪑',
    fletcher: '🪶',
    chandlery: '🕯️',
    market: '🏪',
    grand_market: '🏬',
    trade_post: '⚖️',
    chapel: '⛪',
    tavern: '🍻',
    scholars_hall: '📚',
    well: '🪣',
    firewatch: '🚒',
    healer_hut: '🌿',
    dirt_path: '🛤️',
    cobbled_road: '🧱',
  };
  return map[id] ?? '🏠';
}

// ── Research ───────────────────────────────────────────────────────────────

function renderResearch(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;

  if (w.research.active) {
    const def = RESEARCH[w.research.active];
    const progress = w.research.progress / def.duration;
    const card = el('div', { class: 'research-active' }, [
      el('div', { class: 'card-title' }, [
        el('span', { class: 'ic', text: def.icon }),
        el('span', { text: `En cours : ${def.name}` }),
      ]),
      el('div', {
        class: 'card-desc',
        text: `Encore ${formatDuration((def.duration - w.research.progress) / Math.max(0.25, api.speed))}`,
      }),
      bar(progress),
    ]);
    const cancel = el('button', { class: 'btn danger', text: 'Abandonner (80 % remboursés)' });
    onTap(cancel, () => {
      cancelResearch(w);
      refresh();
    });
    card.append(el('div', { class: 'btn-row' }, [cancel]));
    body.append(card);
  } else {
    body.append(
      el('div', {
        class: 'empty-note',
        text: 'Aucune recherche en cours. Choisissez un sujet ci-dessous : les points sont dépensés au lancement, puis l’étude prend du temps.',
      }),
    );
  }

  if (w.research.queue.length > 0) {
    body.append(el('div', { class: 'section-title', text: "File d'attente" }));
    for (const id of w.research.queue) {
      const def = RESEARCH[id];
      const row = el('div', { class: 'offer-row' }, [
        el('span', { text: def.icon }),
        el('span', { class: 'grow', text: def.name }),
        el('span', { class: 'qty', text: `${def.cost} pts` }),
      ]);
      body.append(row);
    }
  }

  const available = new Set(availableResearch(w));
  const branches: ResearchBranch[] = ['survival', 'forest', 'stone', 'farm', 'craft', 'city'];

  for (const branch of branches) {
    const ids = (Object.keys(RESEARCH) as ResearchId[]).filter((id) => RESEARCH[id].branch === branch);
    const doneCount = ids.filter((id) => w.research.completed.has(id)).length;
    const label = BRANCH_LABELS[branch];
    body.append(
      el('div', { class: 'branch-head' }, [
        el('span', { text: label.icon }),
        el('span', { text: label.name }),
        el('span', { class: 'line' }),
        el('span', { class: 'sub', text: `${doneCount}/${ids.length}` }),
      ]),
    );

    const grid = el('div', { class: 'card-grid' });
    ids.sort((a, b) => RESEARCH[a].cost - RESEARCH[b].cost);
    for (const id of ids) {
      const def = RESEARCH[id];
      const done = w.research.completed.has(id);
      const ready = available.has(id);
      if (done) continue;
      // Hide topics whose prerequisites are two steps away to avoid noise.
      if (!ready && !def.requires.some((r) => w.research.completed.has(r)) && def.requires.length > 0) {
        continue;
      }
      const check = canStartResearch(w, id);
      const card = el('div', {
        class: `card res-card ${ready ? '' : 'locked'} ${check.ok ? 'affordable' : ''}`,
      });
      card.append(
        el('div', { class: 'card-title' }, [
          el('span', { class: 'ic', text: def.icon }),
          el('span', { text: def.name }),
        ]),
        el('div', { class: 'card-desc', text: def.desc }),
      );
      const meta = el('div', { class: 'cost-row' }, [
        el('span', { class: `cost ${w.research.points < def.cost ? 'missing' : ''}` }, [
          el('span', { text: `📜 ${def.cost}` }),
        ]),
        el('span', { class: 'cost' }, [el('span', { text: `⏳ ${formatDuration(def.duration)}` })]),
      ]);
      card.append(meta);

      if (def.unlocks.length > 0) {
        const effects = el('div', { class: 'effects' });
        for (const b of def.unlocks) {
          effects.append(el('span', { class: 'effect', text: `${iconFor(b)} ${BUILDINGS[b].name}` }));
        }
        card.append(effects);
      }
      if (def.effects.length > 0) {
        const effects = el('div', { class: 'effects' });
        for (const e of def.effects) effects.append(el('span', { class: 'effect', text: describeEffect(e) }));
        card.append(effects);
      }
      if (!ready) {
        const missing = def.requires.filter((r) => !w.research.completed.has(r));
        card.append(
          el('div', {
            class: 'card-desc',
            text: `🔒 ${missing.map((m) => RESEARCH[m].name).join(', ')}`,
          }),
        );
      } else {
        onTap(card, () => {
          if (startResearch(w, id)) refresh();
        });
        if (!check.ok) card.append(el('div', { class: 'card-desc', text: check.reason }));
      }
      grid.append(card);
    }
    body.append(grid);
  }
}

function describeEffect(e: { kind: string } & Record<string, unknown>): string {
  const pct = (m: number): string => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)} %`;
  switch (e.kind) {
    case 'work_speed': {
      const prof = e.profession ? PROFESSIONS[e.profession as keyof typeof PROFESSIONS] : undefined;
      return `⚡ Travail ${pct(e.mul as number)}${prof ? ` (${prof.name})` : ''}`;
    }
    case 'gather_yield':
      return `📈 Rendement ${pct(e.mul as number)}`;
    case 'craft_yield':
      return `📈 Production ${pct(e.mul as number)}`;
    case 'move_speed':
      return `👟 Déplacement ${pct(e.mul as number)}`;
    case 'carry_capacity':
      return `🎒 Portage ${pct(e.mul as number)}`;
    case 'happiness':
      return `😊 Bonheur +${e.add}`;
    case 'food_upkeep':
      return `🍞 Consommation ${pct(e.mul as number)}`;
    case 'trade_tier':
      return `🐎 Route de commerce ${e.value}`;
    case 'deposit_richness':
      return `⛏️ Filons ${pct(e.mul as number)}`;
    case 'research_rate':
      return `📜 Recherche ${pct(e.mul as number)}`;
    case 'fire_risk':
      return `🔥 Risque d'incendie ${pct(e.mul as number)}`;
    case 'disease_resist':
      return `🌿 Maladies ${pct(e.mul as number)}`;
    case 'build_speed':
      return `🏗️ Chantiers ${pct(e.mul as number)}`;
    case 'storage':
      return `📦 Stockage ${pct(e.mul as number)}`;
    default:
      return '';
  }
}

// ── Trade ──────────────────────────────────────────────────────────────────

function renderTrade(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;

  if (!hasTradePost(w)) {
    body.append(
      el('div', {
        class: 'empty-note',
        text: "Construisez un comptoir de commerce pour ouvrir les routes marchandes. La recherche « Comptoir de commerce » le débloque.",
      }),
    );
  }

  if (w.contracts.length > 0) {
    body.append(el('div', { class: 'section-title', text: 'Caravanes en route' }));
    for (const c of w.contracts) {
      const partner = TRADE_PARTNERS.find((p) => p.id === c.partnerId);
      const row = el('div', { class: 'partner' }, [
        el('div', { class: 'partner-head' }, [
          el('span', { text: c.direction === 'buy' ? '📥' : '📤' }),
          el('strong', { text: partner?.name ?? c.partnerId }),
          el('span', { class: 'pill', text: c.direction === 'buy' ? 'Achat' : 'Vente' }),
        ]),
        el('div', {
          class: 'card-desc',
          text: `${c.amount} × ${GOODS[c.good].name} — ${Math.round(c.amount * c.unitPrice)} pièces`,
        }),
        bar(1 - c.eta / c.totalTravel, 'blue'),
        el('div', { class: 'qty', text: `Arrivée dans ${formatDuration(c.eta / Math.max(0.25, api.speed))}` }),
      ]);
      body.append(row);
    }
  }

  const partners = availablePartners(w);
  const locked = TRADE_PARTNERS.filter((p) => p.tier > w.modifiers.tradeTier);

  for (const p of partners) {
    const rt = w.partners.get(p.id)!;
    const card = el('div', { class: 'partner' });
    card.append(
      el('div', { class: 'partner-head' }, [
        el('strong', { text: p.name }),
        el('span', { class: 'pill', text: PARTNER_KIND_LABEL[p.kind] }),
        el('span', { class: 'qty', text: `🤝 ${Math.round(rt.relation)}` }),
      ]),
      el('div', { class: 'card-desc', text: p.blurb }),
      el('div', {
        class: 'qty',
        text: `Trajet ${formatDuration(p.travel)} · aller simple`,
      }),
    );

    card.append(el('div', { class: 'section-title', text: 'Ils vendent' }));
    for (const offer of p.sells) {
      const stock = Math.floor(rt.stock[offer.good] ?? 0);
      const unit = buyPrice(w, p, offer.good);
      const row = el('div', { class: 'offer-row' });
      const dot = el('span', { class: 'dot' });
      dot.style.background = GOODS[offer.good].color;
      row.append(
        dot,
        el('span', { class: 'grow' }, [
          el('div', { text: GOODS[offer.good].name }),
          el('div', { class: 'qty', text: `${unit.toFixed(1)} 🪙/u · ${stock} dispo` }),
        ]),
      );
      for (const qty of [10, 40]) {
        const cost = Math.round(unit * Math.min(qty, stock));
        const btn = el('button', {
          class: 'mini-btn buy',
          text: `×${qty}`,
          title: `${cost} pièces`,
        });
        (btn as HTMLButtonElement).disabled = !hasTradePost(w) || stock <= 0 || w.treasury < unit * Math.min(qty, stock);
        onTap(btn, () => {
          const res = orderBuy(w, p.id, offer.good, qty);
          if (!res.ok) w.notify(res.reason, '⚠️', 'bad');
          refresh();
        });
        row.append(btn);
      }
      card.append(row);
    }

    card.append(el('div', { class: 'section-title', text: 'Ils achètent' }));
    for (const offer of p.buys) {
      const demand = Math.floor(rt.demand[offer.good] ?? 0);
      const unit = sellPrice(w, p, offer.good);
      const have = w.stockOf(offer.good);
      const row = el('div', { class: 'offer-row' });
      const dot = el('span', { class: 'dot' });
      dot.style.background = GOODS[offer.good].color;
      row.append(
        dot,
        el('span', { class: 'grow' }, [
          el('div', { text: GOODS[offer.good].name }),
          el('div', { class: 'qty', text: `${unit.toFixed(1)} 🪙/u · en stock ${formatNumber(have)} · demande ${demand}` }),
        ]),
      );
      for (const qty of [10, 40]) {
        const btn = el('button', { class: 'mini-btn sell', text: `×${qty}` });
        (btn as HTMLButtonElement).disabled = !hasTradePost(w) || demand <= 0 || have <= 0;
        onTap(btn, () => {
          const res = orderSell(w, p.id, offer.good, qty);
          if (!res.ok) w.notify(res.reason, '⚠️', 'bad');
          refresh();
        });
        row.append(btn);
      }
      card.append(row);
    }

    body.append(card);
  }

  if (locked.length > 0) {
    body.append(el('div', { class: 'section-title', text: 'Routes à débloquer' }));
    for (const p of locked) {
      body.append(
        el('div', { class: 'offer-row' }, [
          el('span', { text: '🔒' }),
          el('span', { class: 'grow' }, [
            el('div', { text: p.name }),
            el('div', { class: 'qty', text: `${PARTNER_KIND_LABEL[p.kind]} · palier ${p.tier}` }),
          ]),
        ]),
      );
    }
  }
}

// ── People ─────────────────────────────────────────────────────────────────

type PeopleFilter = 'all' | 'idle' | 'unhappy' | 'hungry' | 'sick';
let peopleFilter: PeopleFilter = 'all';

function renderPeople(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;

  const summary = el('div', { class: 'kpi-grid' });
  const entries: Array<[string, string, string]> = [
    ['Population', String(w.stats.population), `${w.stats.children} enfants`],
    ['Au travail', String(w.stats.employed), `${w.stats.idle} disponibles`],
    ['Logements', `${w.stats.population}/${w.stats.housingCapacity}`, w.stats.housingCapacity <= w.stats.population ? 'Complet' : 'Places libres'],
    ['Santé', `${Math.round(w.stats.health)}%`, `${w.villagers.filter((v) => v.sick > 0).length} malades`],
  ];
  for (const [k, v, s] of entries) {
    summary.append(
      el('div', { class: 'kpi' }, [
        el('div', { class: 'k', text: k }),
        el('div', { class: 'v', text: v }),
        el('div', { class: 's', text: s }),
      ]),
    );
  }
  body.append(summary);

  const tabs = el('div', { class: 'tabs' });
  const filters: Array<[PeopleFilter, string]> = [
    ['all', 'Tous'],
    ['idle', 'Sans emploi'],
    ['unhappy', 'Mécontents'],
    ['hungry', 'Affamés'],
    ['sick', 'Malades'],
  ];
  for (const [f, label] of filters) {
    const tab = el('button', { class: `tab ${peopleFilter === f ? 'active' : ''}`, text: label });
    onTap(tab, () => {
      peopleFilter = f;
      refresh();
    });
    tabs.append(tab);
  }
  body.append(tabs);

  let list = [...w.villagers];
  if (peopleFilter === 'idle') list = list.filter((v) => v.workId === 0 && v.profession !== 'child');
  if (peopleFilter === 'unhappy') list = list.filter((v) => v.happiness < 45);
  if (peopleFilter === 'hungry') list = list.filter((v) => v.satiety < 40);
  if (peopleFilter === 'sick') list = list.filter((v) => v.sick > 0);
  list.sort((a, b) => a.happiness - b.happiness);

  if (list.length === 0) {
    body.append(el('div', { class: 'empty-note', text: 'Personne dans cette catégorie. Bonne nouvelle.' }));
    return;
  }

  const container = el('div');
  for (const v of list.slice(0, 80)) container.append(villagerRow(api, v));
  if (list.length > 80) {
    container.append(el('div', { class: 'empty-note', text: `… et ${list.length - 80} autres` }));
  }
  body.append(container);
}

function villagerRow(api: GameApi, v: Villager): HTMLElement {
  const prof = PROFESSIONS[v.profession] ?? PROFESSIONS.idle;
  const avatar = el('div', { class: 'avatar', text: prof.icon });
  avatar.style.background = prof.tunic;
  const bars = el('div', { class: 'mini-bars' }, [
    miniBar(v.satiety / 100, '#e8a94a'),
    miniBar(v.happiness / 100, '#7fc06a'),
    miniBar(v.energy / 100, '#6fb0d4'),
  ]);
  const row = el('div', { class: 'villager-row' }, [
    avatar,
    el('div', { class: 'who' }, [
      el('div', { class: 'nm', text: `${fullName(v)}${v.sick > 0 ? ' 🤒' : ''}` }),
      el('div', {
        class: 'jb',
        text: `${prof.name} · ${Math.floor(v.age)} ans${v.pregnant > 0 ? ' · enceinte' : ''}`,
      }),
    ]),
    bars,
  ]);
  onTap(row, () => {
    api.selectVillager(v.id);
    api.focusOn(v.x, v.y, 16);
  });
  return row;
}

function miniBar(value: number, color: string): HTMLElement {
  const outer = el('div', { class: 'mini-bar' });
  const inner = el('span');
  inner.style.width = `${Math.max(0, Math.min(100, value * 100))}%`;
  inner.style.background = color;
  outer.append(inner);
  return outer;
}

// ── Village overview ───────────────────────────────────────────────────────

function renderVillage(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const s = w.stats;

  body.append(
    el('div', { class: 'tier-banner' }, [
      el('span', { class: 'crest', text: '🏰' }),
      el('div', {}, [
        el('div', { class: 'card-title', text: TIER_NAMES[s.tier] ?? 'Village' }),
        el('div', { class: 'card-desc', text: tierHint(s.tier) }),
      ]),
    ]),
  );

  const kpis = el('div', { class: 'kpi-grid' });
  const rows: Array<[string, string, string]> = [
    ['Habitants', String(s.population), `${s.employed} au travail`],
    ['Bonheur', `${Math.round(s.happiness)}%`, happinessHint(s.happiness)],
    ['Vivres', `${s.foodDays.toFixed(1)} j`, `${formatNumber(s.foodStock)} de nutrition`],
    ['Trésor', formatNumber(w.treasury), `${s.goldPerMinute >= 0 ? '+' : ''}${formatNumber(s.goldPerMinute)}/min`],
    ['Recherche', formatNumber(w.research.points), `+${researchRate(w).toFixed(2)}/s`],
    ['Bâtiments', String(w.buildingList.filter((b) => b.state === 'active').length), `${w.buildingList.filter((b) => b.state === 'building' || b.state === 'planned').length} en chantier`],
  ];
  for (const [k, v, sub] of rows) {
    kpis.append(
      el('div', { class: 'kpi' }, [
        el('div', { class: 'k', text: k }),
        el('div', { class: 'v', text: v }),
        el('div', { class: 's', text: sub }),
      ]),
    );
  }
  body.append(kpis);

  // Problems worth the player's attention, ranked.
  const issues = collectIssues(api);
  body.append(el('div', { class: 'section-title', text: 'À surveiller' }));
  if (issues.length === 0) {
    body.append(el('div', { class: 'empty-note', text: 'Tout roule. Profitez-en pour agrandir.' }));
  } else {
    for (const issue of issues.slice(0, 8)) {
      const row = el('div', { class: 'offer-row' }, [
        el('span', { text: issue.icon }),
        el('span', { class: 'grow' }, [
          el('div', { text: issue.title }),
          el('div', { class: 'qty', text: issue.detail }),
        ]),
      ]);
      if (issue.focus) {
        const btn = el('button', { class: 'mini-btn', text: 'Voir' });
        onTap(btn, () => {
          api.focusOn(issue.focus![0], issue.focus![1], 20);
          api.closeSheet();
        });
        row.append(btn);
      }
      body.append(row);
    }
  }

  body.append(el('div', { class: 'section-title', text: 'Production' }));
  const prod = productionSummary(api);
  if (prod.length === 0) {
    body.append(el('div', { class: 'empty-note', text: 'Aucun atelier en activité.' }));
  }
  for (const line of prod) {
    body.append(
      el('div', { class: 'offer-row' }, [
        el('span', { text: line.icon }),
        el('span', { class: 'grow' }, [
          el('div', { text: line.name }),
          el('div', { class: 'qty', text: line.detail }),
        ]),
        el('span', { class: 'qty', text: `${Math.round(line.efficiency * 100)}%` }),
      ]),
    );
  }

  const settings = el('button', { class: 'btn', text: '⚙️ Options et sauvegarde' });
  onTap(settings, () => api.openSheet('settings'));
  body.append(el('div', { class: 'btn-row' }, [settings]));
  void refresh;
}

function tierHint(tier: number): string {
  const hints = [
    '',
    'Atteignez 25 habitants et 45 % de bonheur pour devenir un village.',
    '60 habitants, 50 % de bonheur et 2 services pour un gros bourg.',
    '120 habitants, 55 % de bonheur et 4 services pour une ville.',
    '220 habitants, 60 % de bonheur et 5 services pour une cité.',
    '380 habitants, 65 % de bonheur et 6 services pour une grande cité.',
    'Votre cité rayonne sur toute la vallée.',
  ];
  return hints[tier] ?? '';
}

function happinessHint(h: number): string {
  if (h >= 75) return 'Le village est radieux';
  if (h >= 60) return 'On vit bien ici';
  if (h >= 45) return 'Correct, sans plus';
  if (h >= 30) return 'Le mécontentement gronde';
  return 'Les gens songent à partir';
}

interface Issue {
  icon: string;
  title: string;
  detail: string;
  focus?: [number, number];
  weight: number;
}

function collectIssues(api: GameApi): Issue[] {
  const w = api.world;
  const issues: Issue[] = [];

  if (w.stats.foodDays < 5) {
    issues.push({
      icon: '🍞',
      title: 'Les réserves de nourriture baissent',
      detail: `${w.stats.foodDays.toFixed(1)} jours restants`,
      weight: 100,
    });
  }
  if (w.stats.housingCapacity <= w.stats.population) {
    issues.push({
      icon: '🏠',
      title: 'Plus aucun logement libre',
      detail: 'Sans lit, pas de naissance ni de nouvel arrivant',
      weight: 80,
    });
  }
  if (w.stats.idle > 4) {
    issues.push({
      icon: '🚶',
      title: `${w.stats.idle} villageois sans emploi`,
      detail: 'Construisez des ateliers ou des camps de récolte',
      weight: 40,
    });
  }
  if (w.stockUsed >= w.stockCapacity * 0.95 && w.stockCapacity > 0) {
    issues.push({
      icon: '📦',
      title: 'Entrepôts saturés',
      detail: 'La production est bloquée tant que rien ne sort',
      weight: 70,
    });
  }

  for (const b of w.buildingList) {
    if (b.state === 'burning') {
      issues.push({
        icon: '🔥',
        title: `${BUILDINGS[b.def].name} en feu`,
        detail: `${Math.round(b.fire * 100)} % consumé`,
        focus: [b.cx, b.cy],
        weight: 200,
      });
    } else if (b.state === 'active' && b.stall) {
      issues.push({
        icon: '⚠️',
        title: `${BUILDINGS[b.def].name} à l'arrêt`,
        detail: b.stall,
        focus: [b.cx, b.cy],
        weight: 30,
      });
    } else if (b.state === 'active' && BUILDINGS[b.def].workers > 0 && b.workers.length === 0) {
      issues.push({
        icon: '👷',
        title: `${BUILDINGS[b.def].name} sans ouvrier`,
        detail: 'Aucun villageois disponible',
        focus: [b.cx, b.cy],
        weight: 25,
      });
    }
  }

  issues.sort((a, b) => b.weight - a.weight);
  return issues;
}

interface ProdLine {
  icon: string;
  name: string;
  detail: string;
  efficiency: number;
}

function productionSummary(api: GameApi): ProdLine[] {
  const w = api.world;
  const byDef = new Map<BuildingId, { count: number; eff: number; workers: number; cap: number }>();
  for (const b of w.buildingList) {
    if (b.state !== 'active') continue;
    const def = BUILDINGS[b.def];
    if (!def.recipe && !def.gather && !def.recipes) continue;
    const e = byDef.get(b.def) ?? { count: 0, eff: 0, workers: 0, cap: 0 };
    e.count++;
    e.eff += b.efficiency;
    e.workers += b.workers.length;
    e.cap += def.workers;
    byDef.set(b.def, e);
  }
  const out: ProdLine[] = [];
  for (const [id, e] of byDef) {
    out.push({
      icon: iconFor(id),
      name: `${BUILDINGS[id].name} ×${e.count}`,
      detail: `${e.workers}/${e.cap} ouvriers`,
      efficiency: e.eff / Math.max(1, e.count),
    });
  }
  out.sort((a, b) => a.efficiency - b.efficiency);
  return out;
}

// ── Selected building ──────────────────────────────────────────────────────

function renderBuilding(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const b = api.selectedBuildingId ? w.buildings.get(api.selectedBuildingId) : null;
  if (!b) {
    body.append(el('div', { class: 'empty-note', text: 'Aucun bâtiment sélectionné.' }));
    return;
  }
  const def = BUILDINGS[b.def];

  body.append(
    el('div', { class: 'detail-head' }, [
      el('span', { class: 'big-ic', text: iconFor(b.def) }),
      el('div', {}, [
        el('div', { class: 'card-title', text: def.name }),
        el('div', { class: 'card-desc', text: def.desc }),
      ]),
    ]),
  );

  // Construction ---------------------------------------------------------
  if (b.state === 'planned' || b.state === 'building') {
    body.append(el('div', { class: 'section-title', text: 'Chantier' }));
    body.append(bar(b.buildProgress / Math.max(1, def.buildWork), 'blue'));
    const missing = el('div', { class: 'cost-row' });
    for (const [g, need] of Object.entries(def.cost)) {
      const good = g as GoodId;
      const have = b.delivered[good] ?? 0;
      const dot = el('span', { class: 'dot' });
      dot.style.background = GOODS[good].color;
      missing.append(
        el('span', { class: `cost ${have < (need as number) ? 'missing' : ''}` }, [
          dot,
          el('span', { text: `${have}/${need}` }),
        ]),
      );
    }
    body.append(missing);
  }

  if (b.state === 'ruined') {
    body.append(
      el('div', {
        class: 'empty-note',
        text: 'Ces ruines encombrent le terrain. Déblayez-les pour récupérer des matériaux.',
      }),
    );
  }

  if (b.state === 'burning') {
    body.append(el('div', { class: 'section-title', text: 'Incendie' }));
    body.append(bar(b.fire, 'red'));
    body.append(
      el('div', {
        class: 'card-desc',
        text: 'Les villageois proches accourent. Des puits et une tour de guet accélèrent l’intervention.',
      }),
    );
  }

  // Stats ----------------------------------------------------------------
  const stats = el('div', { class: 'stat-grid' });
  if (def.workers > 0) {
    stats.append(statBox('Ouvriers', `${b.workers.length}/${def.workers}`));
  }
  if (def.housing) {
    stats.append(statBox('Habitants', `${b.residents.length}/${def.housing.capacity}`));
  }
  if (def.gather || def.recipe || def.recipes) {
    stats.append(statBox('Rendement', `${Math.round(b.efficiency * 100)}%`));
  }
  if (def.livestock) {
    stats.append(statBox('Troupeau', `${Math.floor(b.herd)}/${def.livestock.capacity}`));
  }
  if (def.service && def.service.radius > 0) {
    stats.append(statBox('Portée', `${def.service.radius} cases`));
  }
  if (def.storage) {
    stats.append(statBox('Stock', `${Math.round(w.usedOf(b))}/${w.capacityOf(b) || def.storage.capacity}`));
  }
  if (stats.children.length > 0) body.append(stats);

  if (b.stall) {
    body.append(el('div', { class: 'empty-note', text: `⚠️ ${b.stall}` }));
  }

  // Recipe selector ------------------------------------------------------
  const options = recipeOptions(b.def);
  if (options.length > 1) {
    body.append(el('div', { class: 'section-title', text: 'Production' }));
    const tabs = el('div', { class: 'tabs' });
    options.forEach((r, i) => {
      const tab = el('button', {
        class: `tab ${b.recipeIndex === i ? 'active' : ''}`,
        text: r.label ?? `Recette ${i + 1}`,
      });
      onTap(tab, () => {
        setRecipe(b, i);
        refresh();
      });
      tabs.append(tab);
    });
    body.append(tabs);
  }

  const recipe = activeRecipe(b);
  if (recipe) {
    const flow = el('div', { class: 'cost-row' });
    for (const [g, n] of Object.entries(recipe.inputs)) flow.append(goodChip(g as GoodId, `${n}`));
    if (Object.keys(recipe.inputs).length > 0) flow.append(el('span', { class: 'cost', text: '→' }));
    for (const [g, n] of Object.entries(recipe.outputs)) flow.append(goodChip(g as GoodId, `${n}`));
    body.append(flow);
  }
  if (def.gather) {
    const flow = el('div', { class: 'cost-row' });
    for (const [g, n] of Object.entries(def.gather.consumes ?? {})) flow.append(goodChip(g as GoodId, `${n}`));
    if (def.gather.consumes) flow.append(el('span', { class: 'cost', text: '→' }));
    for (const [g, n] of Object.entries(def.gather.outputs)) flow.append(goodChip(g as GoodId, `${n}`));
    if (flow.children.length > 0) body.append(flow);
  }

  // Inventory ------------------------------------------------------------
  const invEntries = Object.entries(b.inv).filter(([, n]) => (n as number) > 0.5);
  if (invEntries.length > 0) {
    body.append(el('div', { class: 'section-title', text: 'Sur place' }));
    const inv = el('div', { class: 'inv-row' });
    for (const [g, n] of invEntries) inv.append(goodChip(g as GoodId, formatNumber(n as number)));
    body.append(inv);
  }

  // Workers --------------------------------------------------------------
  if (b.workers.length > 0) {
    body.append(el('div', { class: 'section-title', text: 'Équipe' }));
    for (const id of b.workers) {
      const v = w.villagerById.get(id);
      if (v) body.append(villagerRow(api, v));
    }
  }
  if (b.residents.length > 0) {
    body.append(el('div', { class: 'section-title', text: 'Foyer' }));
    for (const id of b.residents) {
      const v = w.villagerById.get(id);
      if (v) body.append(villagerRow(api, v));
    }
  }

  // Actions --------------------------------------------------------------
  const actions = el('div', { class: 'btn-row' });

  if (b.state === 'active' && def.upgradesTo) {
    const next = BUILDINGS[def.upgradesTo];
    const check = w.canUpgrade(b);
    const btn = el('button', {
      class: `btn ${check.ok ? 'primary' : ''}`,
      text: `⬆️ ${next.name}`,
      title: check.reason,
    });
    (btn as HTMLButtonElement).disabled = !check.ok;
    onTap(btn, () => {
      const created = w.upgrade(b.id);
      if (created) api.selectBuilding(created.id);
      refresh();
    });
    actions.append(btn);
    if (!check.ok) {
      body.append(el('div', { class: 'card-desc', text: `Amélioration : ${check.reason}` }));
    } else {
      const costs = el('div', { class: 'cost-row' });
      if (next.goldCost) costs.append(el('span', { class: 'cost', text: `🪙 ${next.goldCost}` }));
      for (const [g, n] of Object.entries(next.cost)) costs.append(goodChip(g as GoodId, `${n}`));
      body.append(el('div', { class: 'section-title', text: 'Coût de l’amélioration' }), costs);
    }
  }

  if (b.state === 'active' && def.workers > 0) {
    const toggle = el('button', { class: 'btn', text: b.enabled ? '⏸ Mettre en pause' : '▶️ Reprendre' });
    onTap(toggle, () => {
      b.enabled = !b.enabled;
      refresh();
    });
    actions.append(toggle);
  }

  const demolish = el('button', {
    class: 'btn danger',
    text: b.state === 'ruined' ? '🧹 Déblayer' : '🧨 Démolir',
  });
  onTap(demolish, () => {
    w.removeBuilding(b.id, true);
    api.selectBuilding(null);
    api.closeSheet();
  });
  actions.append(demolish);
  body.append(actions);
}

function statBox(k: string, v: string): HTMLElement {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'k', text: k }),
    el('div', { class: 'v', text: v }),
  ]);
}

function goodChip(good: GoodId, amount: string): HTMLElement {
  const dot = el('span', { class: 'dot' });
  dot.style.background = GOODS[good].color;
  return el('span', { class: 'cost', title: GOODS[good].name }, [
    dot,
    el('span', { text: `${GOODS[good].short} ${amount}` }),
  ]);
}

// ── Settings ───────────────────────────────────────────────────────────────

function renderSettings(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  body.append(el('div', { class: 'section-title', text: 'Qualité graphique' }));
  const tabs = el('div', { class: 'tabs' });
  for (const [q, label] of [
    ['low', 'Économe'],
    ['medium', 'Équilibré'],
    ['high', 'Élevée'],
  ] as const) {
    const tab = el('button', { class: `tab ${api.quality === q ? 'active' : ''}`, text: label });
    onTap(tab, () => {
      api.setQuality(q);
      refresh();
    });
    tabs.append(tab);
  }
  body.append(tabs);
  body.append(
    el('div', {
      class: 'card-desc',
      text: 'Économe désactive les ombres et la météo. Utile si la batterie chauffe.',
    }),
  );

  body.append(el('div', { class: 'section-title', text: 'Affichage' }));
  const debugBtn = el('button', {
    class: 'btn',
    text: api.showDebug ? '🐞 Masquer les infos techniques' : '🐞 Afficher les infos techniques',
  });
  onTap(debugBtn, () => {
    api.showDebug = !api.showDebug;
    refresh();
  });
  body.append(el('div', { class: 'btn-row' }, [debugBtn]));

  body.append(el('div', { class: 'section-title', text: 'Partie' }));
  const saveBtn = el('button', { class: 'btn primary', text: '💾 Sauvegarder' });
  onTap(saveBtn, () => {
    void api.save();
  });
  const loadBtn = el('button', { class: 'btn', text: '📂 Charger' });
  onTap(loadBtn, () => {
    void api.load();
  });
  body.append(el('div', { class: 'btn-row' }, [saveBtn, loadBtn]));

  const restart = el('button', { class: 'btn danger', text: '🌱 Nouvelle vallée' });
  onTap(restart, () => {
    if (confirm('Abandonner ce village et générer une nouvelle vallée ?')) {
      api.restart();
    }
  });
  body.append(el('div', { class: 'btn-row' }, [restart]));

  body.append(
    el('div', {
      class: 'empty-note',
      text: 'La partie se sauvegarde aussi toute seule toutes les deux minutes et quand vous quittez le jeu.',
    }),
  );
}

export function buildingSummaryLine(b: Building): string {
  const def = BUILDINGS[b.def];
  if (b.state === 'building' || b.state === 'planned') return 'En construction';
  if (b.state === 'burning') return 'En feu !';
  if (b.state === 'ruined') return 'Ruines';
  if (b.stall) return b.stall;
  if (def.workers > 0 && b.workers.length === 0) return 'Sans ouvrier';
  return 'En activité';
}
