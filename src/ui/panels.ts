import { formatDuration, formatNumber } from '../core/util';
import {
  BUILDINGS,
  BUILDINGS_BY_CATEGORY,
  CATEGORY_LABELS,
  type BuildingCategory,
  type BuildingDef,
  type BuildingId,
} from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import { PROFESSIONS } from '../data/professions';
import {
  BRANCH_LABELS,
  MAX_TIER,
  RESEARCH,
  researchOfTier,
  TIER_NAMES as ERA_NAMES,
  type ResearchBranch,
  type ResearchDef,
  type ResearchId,
} from '../data/research';
import { PARTNER_KIND_LABEL, TRADE_PARTNERS } from '../data/trade';
import {
  availablePartners,
  buyPrice,
  taxHappiness,
  taxIncome,
  hasTradePost,
  orderBuy,
  partnerSeasonFactor,
  orderSell,
  sellPrice,
  TIER_NAMES,
} from '../sim/economy';
import { activeObjectives, OBJECTIVES } from '../sim/objectives';
import {
  collectRadius,
  displayName,
  gatherRadius,
  MAX_IN_PLACE_LEVEL,
  housingCapacity,
  outputMultiplier,
  serviceRadius,
  upgradeTargetOf,
  workerSlots,
} from '../sim/levels';
import { repairGoldCost, siteCost, siteWork } from '../sim/build';
import { outputRates } from '../sim/output';
import { activeRecipe, recipeOptions, setRecipe } from '../sim/recipes';
import {
  canQueueResearch,
  canStartResearch,
  hasUniversity,
  cancelResearch,
  dequeueResearch,
  researchSpeed,
  scholarCount,
  startResearch,
  tierProgress,
  universities,
  unlockedTier,
} from '../sim/research';
import { FOOD_EXODUS_DAYS, fullName } from '../sim/villagers';
import { SEASON_LABEL } from '../sim/types';
import type { Building, Villager } from '../sim/types';
import type { GameApi, SheetId } from './api';
import { bar, el, onTap } from './dom';
import { icon, pastille, type IconName } from './icons';
import { askText } from './dialog';
import {
  CATEGORY_LABEL as GOOD_CATEGORY_LABEL,
  CATEGORY_ORDER as GOOD_CATEGORY_ORDER,
  MAX_PINNED,
  goodsOfCategory,
  isPinned,
  pinnedGoods,
  togglePin,
} from './stock';
import { breakdownBars, chartLegend, lineChart } from './charts';
import {
  EXPENSE_SOURCES,
  INCOME_SOURCES,
  LEDGER_COLORS,
  LEDGER_LABELS,
  type LedgerSource,
} from '../sim/history';

type Refresh = () => void;

export function sheetTitle(id: SheetId, api: GameApi): { title: string; sub?: string } {
  const w = api.world;
  switch (id) {
    case 'build':
      return { title: 'Construire', sub: 'Posez vos bâtiments sur la carte' };
    case 'research': {
      const era = unlockedTier(w);
      return {
        title: 'Savoir',
        sub: `Ère ${era} · ${ERA_NAMES[era] ?? ''} · ${w.research.completed.size}/${Object.keys(RESEARCH).length} étudiés`,
      };
    }
    case 'trade':
      return { title: 'Commerce', sub: `${Math.round(w.treasury)} pièces en caisse` };
    case 'people':
      return {
        title: 'Villageois',
        sub: `${w.stats.population} habitants · ${w.stats.idle} sans emploi`,
      };
    case 'economy': {
      // The same figure the verdict shows, so the header can never contradict
      // the big number right under it.
      const net = w.history.liveIncome() - w.history.liveExpense();
      return {
        title: 'Économie',
        sub: `${Math.round(w.treasury)} pièces · ${net >= 0 ? '+' : ''}${net.toFixed(0)} par jour`,
      };
    }
    case 'stock': {
      const pct = w.stockCapacity > 0 ? Math.round((w.stockUsed / w.stockCapacity) * 100) : 0;
      return {
        title: 'Ressources',
        sub: `${formatNumber(w.stockUsed)} / ${formatNumber(w.stockCapacity)} · ${pct} % des entrepôts`,
      };
    }
    case 'village':
      return {
        title: w.villageName,
        sub: `${TIER_NAMES[w.stats.tier] ?? 'Village'} · rang ${w.stats.tier} / 6`,
      };
    case 'settings':
      return { title: 'Options' };
    case 'building': {
      const b = api.selectedBuildingId ? w.buildings.get(api.selectedBuildingId) : null;
      if (!b) return { title: 'Bâtiment' };
      const slots = workerSlots(b);
      return {
        title: displayName(b),
        sub: slots > 0 ? `${b.workers.length}/${slots} ouvriers` : undefined,
      };
    }
    case 'villager': {
      const v = api.selectedVillagerId ? w.villagerById.get(api.selectedVillagerId) : null;
      return v
        ? { title: fullName(v), sub: `${PROFESSIONS[v.profession]?.name ?? ''} · ${Math.floor(v.age)} ans` }
        : { title: 'Villageois' };
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
    case 'economy':
      return renderEconomy(api, body, refresh);
    case 'stock':
      return renderStock(api, body, refresh);
    case 'village':
      return renderVillage(api, body, refresh);
    case 'building':
      return renderBuilding(api, body, refresh);
    case 'villager':
      return renderVillager(api, body, refresh);
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

/** `null` is "everything", which is what the panel opens on. */
let buildCategory: BuildingCategory | null = null;

/**
 * The build panel.
 *
 * It used to be a row of category tabs above a grid, and it was the worst
 * screen in the game: the tabs scrolled sideways, so half the categories were
 * off the right edge, and the grid was mostly buildings the player could not
 * place — every locked entry in the catalogue sat there greyed out, in the way
 * of the four or five they could actually build.
 *
 * So: locked buildings are gone entirely, the filter chips wrap instead of
 * scrolling — nothing is ever off-screen — and the default is one list of
 * everything available, grouped under its headings. In the opening hour that
 * list is six cards long, which is the whole point.
 */
function renderBuild(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;

  const available: BuildingDef[] = [];
  let lockedCount = 0;
  let nextUp: ResearchId | null = null;
  for (const cat of CATEGORY_ORDER) {
    for (const def of BUILDINGS_BY_CATEGORY.get(cat) ?? []) {
      if (def.id === 'town_hall') continue;
      if (def.requires && !w.research.completed.has(def.requires)) {
        lockedCount++;
        // The nearest thing to a "coming next": the cheapest study that would
        // put something new in this list.
        if (
          canQueueResearch(w, def.requires) &&
          (!nextUp || RESEARCH[def.requires].cost < RESEARCH[nextUp].cost)
        ) {
          nextUp = def.requires;
        }
        continue;
      }
      available.push(def);
    }
  }

  if (available.length === 0) {
    body.append(
      el('div', { class: 'empty-note', text: "Rien à bâtir pour l'instant. Passez par la page Savoir." }),
    );
    return;
  }

  // Which categories actually have something in them right now. A chip for an
  // empty category is a dead end the player has to discover by tapping it.
  const present = CATEGORY_ORDER.filter((c) => available.some((d) => d.category === c));
  if (buildCategory !== null && !present.includes(buildCategory)) buildCategory = null;

  if (present.length > 1) {
    const chips = el('div', { class: 'chip-filter' });
    const chip = (label: string, count: number, cat: BuildingCategory | null): HTMLElement => {
      const node = el('button', { class: `chip ${cat === buildCategory ? 'active' : ''}` }, [
        el('span', { text: label }),
        el('span', { class: 'qty', text: String(count) }),
      ]);
      onTap(node, () => {
        buildCategory = cat;
        refresh();
      });
      return node;
    };
    chips.append(chip('Tout', available.length, null));
    for (const cat of present) {
      chips.append(
        chip(CATEGORY_LABELS[cat].name, available.filter((d) => d.category === cat).length, cat),
      );
    }
    body.append(chips);
  }

  const shown = buildCategory === null ? present : [buildCategory];
  for (const cat of shown) {
    const defs = available.filter((d) => d.category === cat).sort((a, b) => a.tier - b.tier);
    if (defs.length === 0) continue;
    if (shown.length > 1) {
      body.append(
        el('div', { class: 'section-title' }, [
          icon(CATEGORY_LABELS[cat].icon as IconName, 'ic'),
          el('span', { text: CATEGORY_LABELS[cat].name }),
        ]),
      );
    }
    const grid = el('div', { class: 'card-grid' });
    for (const def of defs) grid.append(buildCard(api, def));
    body.append(grid);
  }

  // The catalogue is much bigger than this list, and hiding that entirely
  // would make the game look small. One line at the bottom, not forty cards.
  if (lockedCount > 0) {
    const note = el('div', { class: 'build-locked-note' }, [
      icon('lock'),
      el('span', {
        text: nextUp
          ? `${lockedCount} autres bâtiments attendent une étude — au plus près : ${RESEARCH[nextUp].name}.`
          : `${lockedCount} autres bâtiments attendent une étude.`,
      }),
    ]);
    onTap(note, () => api.openSheet('research'));
    body.append(note);
  }
}

/** One placeable building, as a card. */
function buildCard(api: GameApi, def: BuildingDef): HTMLElement {
  const w = api.world;
  const affordable =
    w.treasury >= def.goldCost &&
    Object.entries(def.cost).every(([g, n]) => w.stockOf(g as GoodId) >= (n as number));

  const card = el('div', { class: `card ${affordable ? 'affordable' : ''}` });
  card.append(
    el('div', { class: 'card-title' }, [buildingIcon(def.id, 'ic'), el('span', { text: def.name })]),
    el('div', { class: 'card-desc', text: def.desc }),
  );

  const costs = el('div', { class: 'cost-row' });
  if (def.goldCost > 0) {
    costs.append(
      el('span', { class: `cost ${w.treasury < def.goldCost ? 'missing' : ''}` }, [
        el('span', { class: 'coin' }),
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
    costs.append(el('span', { class: 'cost' }, [icon('worker'), el('span', { text: String(def.workers) })]));
  }
  card.append(costs);

  onTap(card, () => {
    api.beginPlacement(def.id);
    api.closeSheet();
  });
  return card;
}

/**
 * A glyph per building, reused by every panel. Buildings that share a trade
 * share a mark; the building's own accent colour tells them apart, exactly as
 * goods are told apart by their pastille.
 */
const BUILDING_GLYPH: Partial<Record<BuildingId, IconName>> = {
  town_hall: 'village',
  shack: 'home',
  cottage: 'home',
  house: 'home',
  manor: 'home',
  storehouse: 'box',
  warehouse: 'box',
  granary: 'wheat',
  woodcutter_camp: 'tree',
  lumber_camp: 'tree',
  forester_hut: 'tree',
  gatherer_hut: 'harvest',
  hunter_camp: 'flag',
  hunting_lodge: 'flag',
  fisher_hut: 'water',
  fishing_pier: 'water',
  fishing_dock: 'water',
  fishing_harbour: 'water',
  quarry: 'stone',
  great_quarry: 'stone',
  clay_pit: 'pot',
  coal_mine: 'stone',
  iron_mine: 'anvil',
  gold_mine: 'gem',
  deep_mine: 'stone',
  wheat_field: 'wheat',
  flax_field: 'harvest',
  chicken_coop: 'food',
  sheep_pasture: 'food',
  cattle_pasture: 'food',
  sawmill: 'tool',
  water_sawmill: 'tool',
  charcoal_burner: 'fire',
  brick_kiln: 'fire',
  smelter: 'fire',
  blacksmith: 'anvil',
  goldsmith: 'gem',
  butcher: 'food',
  smokehouse: 'fire',
  windmill: 'wheat',
  bakery: 'food',
  brewery: 'pot',
  weaver: 'box',
  tailor: 'box',
  tannery: 'pot',
  cobbler: 'box',
  carpenter: 'tool',
  fletcher: 'tool',
  chandlery: 'star',
  market: 'trade',
  grand_market: 'trade',
  trade_post: 'trade',
  chapel: 'bell',
  tavern: 'pot',
  university: 'research',
  well: 'water',
  firewatch: 'bell',
  healer_hut: 'heart',
  dirt_path: 'cart',
  cobbled_road: 'cart',
  flower_bed: 'star',
  bench: 'heart',
  lamp_post: 'sun',
  fountain: 'water',
  statue: 'star',
  village_green: 'tree',
  theatre: 'flag',
};

/** Accent colour per category, so two "box" marks never read as one thing. */
const CATEGORY_COLOR: Record<BuildingCategory, string> = {
  civic: '#d9b45f',
  housing: '#c98b46',
  storage: '#a98a55',
  gathering: '#7fc06a',
  farming: '#c8b24a',
  industry: '#c2724f',
  crafting: '#a0729c',
  service: '#6fb0d4',
  infrastructure: '#8d8069',
};

export function glyphFor(id: BuildingId): IconName {
  return BUILDING_GLYPH[id] ?? 'home';
}

export function colorFor(id: BuildingId): string {
  return CATEGORY_COLOR[BUILDINGS[id].category] ?? '#d9b45f';
}

/** The building's mark, tinted by its category. */
export function buildingIcon(id: BuildingId, cls = ''): SVGSVGElement {
  const node = icon(glyphFor(id), cls);
  node.style.color = colorFor(id);
  return node;
}

// ── Research ───────────────────────────────────────────────────────────────

function renderResearch(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const speed = researchSpeed(w);
  const open = unlockedTier(w);

  // ── Status strip ─────────────────────────────────────────────────────────
  const halls = universities(w);
  if (halls.length === 0) {
    const call = el('div', { class: 'research-warn' }, [
      el('div', { class: 'card-title' }, [el('span', { text: "Aucune université" })]),
      el('div', {
        class: 'card-desc',
        text: "Le savoir ne vient pas tout seul. Construisez une université et affectez-y des érudits : chaque érudit accélère l'étude en cours.",
      }),
    ]);
    const build = el('button', { class: 'btn primary', text: 'Construire une université' });
    onTap(build, () => {
      api.beginPlacement('university');
      api.closeSheet();
    });
    call.append(el('div', { class: 'btn-row' }, [build]));
    body.append(call);
  } else {
    const scholars = scholarCount(w);
    const slots = halls.reduce((n, b) => n + workerSlots(b), 0);
    body.append(
      el('div', { class: 'research-status' }, [
        statChip('Érudits', `${scholars}/${slots}`),
        statChip('Vitesse', `×${speed.toFixed(2)}`),
        statChip('Trésor', `${Math.round(w.treasury)} pièces`),
      ]),
    );
    if (scholars === 0) {
      body.append(
        el('div', {
          class: 'empty-note',
          text: "Votre université est vide. Touchez-la sur la carte pour y affecter des érudits : l'étude avance trois fois plus vite avec trois d'entre eux.",
        }),
      );
    }
  }

  // ── Active study ─────────────────────────────────────────────────────────
  if (w.research.active) {
    const def = RESEARCH[w.research.active];
    const left = def.duration - w.research.progress;
    const eta = speed > 0 ? left / (speed * Math.max(0.25, api.speed)) : Infinity;
    const card = el('div', { class: 'research-active' }, [
      el('div', { class: 'card-title' }, [el('span', { text: `En cours : ${def.name}` })]),
      el('div', {
        class: 'card-desc',
        text: speed > 0 ? `Encore ${formatDuration(eta)}` : "À l'arrêt : plus aucune université en service",
      }),
      bar(w.research.progress / def.duration),
    ]);
    const cancel = el('button', { class: 'btn danger', text: 'Abandonner (80 % remboursés)' });
    onTap(cancel, () => {
      cancelResearch(w);
      refresh();
    });
    card.append(el('div', { class: 'btn-row' }, [cancel]));
    body.append(card);
  }

  // ── Queue ────────────────────────────────────────────────────────────────
  if (w.research.queue.length > 0) {
    body.append(el('div', { class: 'section-title', text: "File d'attente" }));
    for (const id of w.research.queue) {
      const def = RESEARCH[id];
      const drop = el('button', { class: 'btn tiny', text: 'Retirer' });
      onTap(drop, () => {
        dequeueResearch(w, id);
        refresh();
      });
      body.append(
        el('div', { class: 'offer-row' }, [
          branchDot(def.branch),
          el('span', { class: 'grow', text: def.name }),
          el('span', { class: 'qty', text: `${def.cost} pièces` }),
          drop,
        ]),
      );
    }
  }

  // ── The tree, one era at a time ──────────────────────────────────────────
  for (let tier = 1; tier <= MAX_TIER; tier++) {
    const [done, total] = tierProgress(w, tier);
    const locked = tier > open;
    const head = el('div', { class: `era-head ${locked ? 'locked' : ''} ${done === total ? 'done' : ''}` }, [
      el('span', { class: 'era-n', text: String(tier) }),
      el('span', { class: 'grow' }, [
        el('div', { class: 'era-name', text: ERA_NAMES[tier] ?? `Ère ${tier}` }),
        el('div', {
          class: 'era-sub',
          text: locked ? `Terminez l'ère ${tier - 1} pour l'ouvrir` : `${done}/${total} acquises`,
        }),
      ]),
    ]);
    head.append(bar(total > 0 ? done / total : 0));
    body.append(head);

    if (locked) continue;

    const defs = researchOfTier(tier).sort((a, b) => a.cost - b.cost);
    // A finished era collapses to a row of names: it is history, and the
    // player still has four more to scroll past.
    if (done === total) {
      const recap = el('div', { class: 'effects era-recap' });
      for (const def of defs) {
        recap.append(
          el('span', { class: 'effect', style: `border-color:${BRANCH_LABELS[def.branch].color}` }, [
            el('span', { text: def.name }),
          ]),
        );
      }
      body.append(recap);
      continue;
    }

    const grid = el('div', { class: 'card-grid' });
    for (const def of defs) grid.append(researchCard(api, def, refresh));
    body.append(grid);
  }
}

function statChip(label: string, value: string): HTMLElement {
  return el('div', { class: 'stat-chip' }, [
    el('span', { class: 'k', text: label }),
    el('span', { class: 'v', text: value }),
  ]);
}

function branchDot(branch: ResearchBranch): HTMLElement {
  const label = BRANCH_LABELS[branch];
  return el('span', {
    class: 'branch-dot',
    style: `background:${label.color}`,
    title: label.name,
  });
}

function researchCard(api: GameApi, def: ResearchDef, refresh: Refresh): HTMLElement {
  const w = api.world;
  const done = w.research.completed.has(def.id);
  const active = w.research.active === def.id;
  const queued = w.research.queue.includes(def.id);
  const check = canStartResearch(w, def.id);
  const poor = !done && !active && !queued && w.treasury < def.cost;

  const card = el('div', {
    class: `card res-card ${done ? 'done' : ''} ${active ? 'running' : ''} ${poor ? 'poor' : ''}`,
    style: `--branch:${BRANCH_LABELS[def.branch].color}`,
  });
  card.append(
    el('div', { class: 'card-title' }, [
      branchDot(def.branch),
      el('span', { class: 'grow', text: def.name }),
      done ? el('span', { class: 'tag ok', text: 'Acquis' }) : el('span', { class: 'tag', text: BRANCH_LABELS[def.branch].name }),
    ]),
    el('div', { class: 'card-desc', text: def.desc }),
  );

  if (!done) {
    card.append(
      el('div', { class: 'cost-row' }, [
        el('span', { class: `cost ${poor ? 'missing' : ''}` }, [el('span', { text: `${def.cost} pièces` })]),
        el('span', { class: 'cost' }, [el('span', { text: formatDuration(def.duration) })]),
      ]),
    );
  }

  if (def.unlocks.length > 0) {
    const effects = el('div', { class: 'effects' });
    for (const b of def.unlocks) effects.append(el('span', { class: 'effect', text: BUILDINGS[b].name }));
    card.append(effects);
  }
  if (def.effects.length > 0) {
    const effects = el('div', { class: 'effects' });
    for (const e of def.effects) effects.append(el('span', { class: 'effect', text: describeEffect(e) }));
    card.append(effects);
  }

  if (done) return card;
  if (active) {
    card.append(el('div', { class: 'card-desc', text: 'Étude en cours' }));
    return card;
  }
  if (queued) {
    const drop = el('button', { class: 'btn tiny', text: 'Retirer de la file' });
    onTap(drop, () => {
      dequeueResearch(w, def.id);
      refresh();
    });
    card.append(el('div', { class: 'btn-row' }, [drop]));
    return card;
  }

  // One line, one meaning: the button says exactly what tapping it does, so
  // the refusal never has to be repeated underneath.
  const busy = w.research.active !== null;
  const canAct = hasUniversity(w) && canQueueResearch(w, def.id);
  let label: string;
  if (!hasUniversity(w)) label = 'Université requise';
  else if (busy) label = "Mettre en file d'attente";
  else if (poor) label = `Attendre ${Math.ceil(def.cost - w.treasury)} pièces`;
  else label = `Étudier · ${def.cost}`;

  const go = el('button', { class: `btn ${check.ok && !busy ? 'primary' : ''}`, text: label });
  if (!canAct) go.setAttribute('disabled', 'true');
  onTap(go, () => {
    if (startResearch(w, def.id)) refresh();
  });
  card.append(el('div', { class: 'btn-row' }, [go]));
  return card;
}

function describeEffect(e: { kind: string } & Record<string, unknown>): string {
  const pct = (m: number): string => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)} %`;
  switch (e.kind) {
    case 'work_speed': {
      const prof = e.profession ? PROFESSIONS[e.profession as keyof typeof PROFESSIONS] : undefined;
      return `Travail ${pct(e.mul as number)}${prof ? ` (${prof.name})` : ''}`;
    }
    case 'gather_yield':
      return `Rendement ${pct(e.mul as number)}`;
    case 'craft_yield':
      return `Production ${pct(e.mul as number)}`;
    case 'move_speed':
      return `Déplacement ${pct(e.mul as number)}`;
    case 'carry_capacity':
      return `Portage ${pct(e.mul as number)}`;
    case 'happiness':
      return `Bonheur +${e.add}`;
    case 'food_upkeep':
      return `Consommation ${pct(e.mul as number)}`;
    case 'trade_tier':
      return `Route de commerce ${e.value}`;
    case 'deposit_richness':
      return `Filons ${pct(e.mul as number)}`;
    case 'research_rate':
      return `Recherche ${pct(e.mul as number)}`;
    case 'fire_risk':
      return `Risque d'incendie ${pct(e.mul as number)}`;
    case 'disease_resist':
      return `Maladies ${pct(e.mul as number)}`;
    case 'build_speed':
      return `Chantiers ${pct(e.mul as number)}`;
    case 'storage':
      return `Stockage ${pct(e.mul as number)}`;
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
          icon(c.direction === 'buy' ? 'arrive' : 'leave', 'ic'),
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
        el('span', { class: 'pill', text: p.specialty }),
        el('span', { class: 'qty', text: `Relation ${Math.round(rt.relation)}` }),
      ]),
      el('div', { class: 'card-desc', text: p.blurb }),
      el('div', {
        class: 'qty',
        text: `Trajet ${formatDuration(p.travel)} · aller simple`,
      }),
    );

    // The season is half of what makes two partners worth telling apart, so
    // say plainly whether this one is paying well today.
    const bias = partnerSeasonFactor(w, p);
    if (Math.abs(bias - 1) > 0.02) {
      const better = bias > 1;
      card.append(
        el('div', { class: `season-note ${better ? 'good' : 'bad'}` }, [
          icon(better ? 'good' : 'bad'),
          el('span', {
            text: better
              ? `${SEASON_LABEL[w.time.season]} : ils paient ${Math.round((bias - 1) * 100)} % de plus, et vendent d'autant plus cher.`
              : `${SEASON_LABEL[w.time.season]} : ils bradent, mais paient ${Math.round((1 - bias) * 100)} % de moins.`,
          }),
        ]),
      );
    }

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
          el('div', { class: 'qty', text: `${unit.toFixed(1)} pièces/u · ${stock} dispo` }),
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
          if (!res.ok) w.notify(res.reason, 'warn', 'bad');
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
          el('div', {
            class: 'qty',
            text: `${unit.toFixed(1)} pièces/u · en stock ${formatNumber(have)} · demande ${demand}`,
          }),
        ]),
      );
      for (const qty of [10, 40]) {
        const btn = el('button', { class: 'mini-btn sell', text: `×${qty}` });
        (btn as HTMLButtonElement).disabled = !hasTradePost(w) || demand <= 0 || have <= 0;
        onTap(btn, () => {
          const res = orderSell(w, p.id, offer.good, qty);
          if (!res.ok) w.notify(res.reason, 'warn', 'bad');
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
          icon('lock'),
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

/**
 * A villager's avatar: their own initial on their trade's tunic colour — the
 * same colour they wear on the map. An emoji per trade was unreadable at 28 px
 * and duplicated across a dozen crafts; a letter on a colour never is, and the
 * initial tells two neighbours apart where a shared trade glyph could not.
 */
function villagerAvatar(v: Villager, cls = ''): HTMLElement {
  const prof = PROFESSIONS[v.profession] ?? PROFESSIONS.idle;
  const node = el('div', { class: `avatar ${cls}`.trim(), text: v.name.charAt(0).toUpperCase() });
  node.style.background = prof.tunic;
  node.title = prof.name;
  return node;
}

/** An icon in a given colour, for lines that need to stay distinguishable. */
function tintedIcon(name: IconName, color: string): SVGSVGElement {
  const node = icon(name, 'ic');
  node.style.color = color;
  return node;
}

function villagerRow(api: GameApi, v: Villager): HTMLElement {
  const prof = PROFESSIONS[v.profession] ?? PROFESSIONS.idle;
  const avatar = villagerAvatar(v);
  const bars = el('div', { class: 'mini-bars' }, [
    miniBar(v.satiety / 100, '#e8a94a'),
    miniBar(v.happiness / 100, '#7fc06a'),
    miniBar(v.energy / 100, '#6fb0d4'),
  ]);
  const row = el('div', { class: 'villager-row' }, [
    avatar,
    el('div', { class: 'who' }, [
      el('div', { class: 'nm' }, [
        el('span', { text: fullName(v) }),
        v.sick > 0 ? icon('illness', 'sick-mark') : null,
      ]),
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

// ── Resources ──────────────────────────────────────────────────────────────

/**
 * Everything the village owns, on one page. The HUD only carries four pinned
 * goods now, so this is where the rest lives — grouped, sorted and with the
 * pin toggle right next to each line.
 */
function renderStock(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const pins = pinnedGoods();

  const ratio = w.stockCapacity > 0 ? w.stockUsed / w.stockCapacity : 0;
  body.append(
    el('div', { class: 'research-status' }, [
      statChip('Occupation', `${Math.round(ratio * 100)} %`),
      statChip('Libre', formatNumber(Math.max(0, w.stockCapacity - w.stockUsed))),
      statChip('Vivres', `${w.stats.foodDays.toFixed(1)} j`),
    ]),
    bar(ratio, ratio > 0.92 ? 'red' : 'green'),
  );
  if (ratio > 0.92) {
    body.append(
      el('div', {
        class: 'empty-note',
        text: "Les entrepôts sont pleins : toute la production en amont s'arrête. Bâtissez un entrepôt, ou vendez au comptoir.",
      }),
    );
  }
  body.append(
    el('div', {
      class: 'card-desc lead',
      text: `Touchez une ressource pour l'épingler en haut de l'écran (${pins.length}/${MAX_PINNED}).`,
    }),
  );

  for (const category of GOOD_CATEGORY_ORDER) {
    const goods = goodsOfCategory(category)
      .map((g) => ({ g, amount: w.stockOf(g) }))
      .sort((a, b) => b.amount - a.amount || GOODS[a.g].name.localeCompare(GOODS[b.g].name));
    if (goods.length === 0) continue;
    const total = goods.reduce((n, x) => n + x.amount, 0);
    body.append(
      el('div', { class: 'section-title' }, [
        el('span', { text: GOOD_CATEGORY_LABEL[category] }),
        el('span', { class: 'qty', text: formatNumber(total) }),
      ]),
    );
    const grid = el('div', { class: 'stock-grid' });
    for (const { g, amount } of goods) {
      const def = GOODS[g];
      const pinned = isPinned(g);
      const row = el('button', {
        class: `stock-row ${amount <= 0 ? 'empty' : ''} ${pinned ? 'pinned' : ''}`,
        title: def.description,
      });
      row.append(
        pastille(def.color),
        el('span', { class: 'stock-name', text: def.name }),
        el('span', { class: 'stock-amount', text: formatNumber(amount) }),
      );
      if (pinned) row.append(icon('star', 'pin'));
      onTap(row, () => {
        togglePin(g);
        api.requestUiRefresh();
        refresh();
      });
      grid.append(row);
    }
    body.append(grid);
  }
}

// ── Economy ────────────────────────────────────────────────────────────────

/**
 * The page that answers "where is my money going?". Everything on it reads the
 * rolling history the simulation keeps, so it works identically whether the
 * player opened it after two minutes or after two in-game years.
 */
function renderEconomy(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const h = w.history;
  const samples = h.samples;
  const liveIncome = h.liveIncome();
  const liveExpense = h.liveExpense();
  const net = liveIncome - liveExpense;
  const trend = h.netTrend();

  // ── Verdict ──────────────────────────────────────────────────────────────
  const surplus = net >= 0;
  body.append(
    el('div', { class: `verdict ${surplus ? 'good' : 'bad'}` }, [
      el('div', { class: 'verdict-figure' }, [
        el('span', { class: 'verdict-sign', text: surplus ? '+' : '−' }),
        el('span', { class: 'verdict-value', text: formatNumber(Math.abs(net)) }),
        el('span', { class: 'verdict-unit', text: 'pièces / jour' }),
      ]),
      el('div', { class: 'verdict-body' }, [
        el('div', { class: 'card-title', text: surplus ? 'Excédent' : 'Déficit' }),
        el('div', { class: 'card-desc', text: deficitHint(w, net, trend) }),
      ]),
    ]),
  );

  const kpis = el('div', { class: 'kpi-grid' });
  for (const [k, v, sub] of [
    ['Trésor', formatNumber(w.treasury), `tendance ${trend >= 0 ? '+' : ''}${formatNumber(trend)} / jour`],
    ['Recettes', `${formatNumber(liveIncome)}`, 'pièces par jour'],
    ['Dépenses', `${formatNumber(liveExpense)}`, 'pièces par jour'],
    [
      'Autonomie',
      surplus ? '—' : `${Math.max(0, Math.floor(w.treasury / Math.max(1, -net)))} j`,
      surplus ? 'la caisse monte' : 'avant la caisse vide',
    ],
  ] as Array<[string, string, string]>) {
    kpis.append(
      el('div', { class: 'kpi' }, [
        el('div', { class: 'k', text: k }),
        el('div', { class: 'v', text: v }),
        el('div', { class: 's', text: sub }),
      ]),
    );
  }
  body.append(kpis);

  const labels = xLabelsFor(samples.map((s) => s.day));

  // ── Money in and out ─────────────────────────────────────────────────────
  body.append(el('div', { class: 'section-title', text: 'Recettes et dépenses' }));
  if (samples.length < 2) {
    body.append(el('div', { class: 'empty-note', text: waitingNote() }));
  } else {
    body.append(
      lineChart({
        series: [
          { label: 'Recettes', color: '#7fc06a', values: samples.map((s) => s.income), fill: true },
          { label: 'Dépenses', color: '#e0705c', values: samples.map((s) => s.expense), dashed: true },
        ],
        include: [0],
        xLabels: labels,
        height: 130,
        format: (v) => formatNumber(v),
      }),
      chartLegend([
        { label: 'Recettes', color: '#7fc06a' },
        { label: 'Dépenses', color: '#e0705c', dashed: true },
      ]),
    );

    body.append(el('div', { class: 'section-title', text: 'Solde quotidien' }));
    const balance = samples.map((s) => s.income - s.expense);
    body.append(
      lineChart({
        series: [{ label: 'Solde', color: '#d9b45f', values: balance, fill: true }],
        include: [0],
        xLabels: labels,
        height: 110,
        zeroLine: true,
        format: (v) => formatNumber(v),
      }),
    );

    body.append(el('div', { class: 'section-title', text: 'Trésor' }));
    body.append(
      lineChart({
        series: [{ label: 'Trésor', color: '#6fb0d4', values: samples.map((s) => s.treasury), fill: true }],
        include: [0],
        xLabels: labels,
        height: 110,
        format: (v) => formatNumber(v),
      }),
    );
  }

  // ── Where it comes from, where it goes ───────────────────────────────────
  const incomeRows = ledgerRows(w, INCOME_SOURCES);
  const expenseRows = ledgerRows(w, EXPENSE_SOURCES);
  body.append(el('div', { class: 'section-title', text: "D'où vient l'or" }));
  if (incomeRows.length === 0) {
    body.append(el('div', { class: 'empty-note', text: 'Aucune recette pour le moment.' }));
  } else {
    body.append(breakdownBars(incomeRows, (v) => formatNumber(v)));
  }
  body.append(el('div', { class: 'section-title', text: 'Où il part' }));
  if (expenseRows.length === 0) {
    body.append(el('div', { class: 'empty-note', text: 'Vous n’avez encore rien dépensé.' }));
  } else {
    body.append(breakdownBars(expenseRows, (v) => formatNumber(v)));
  }

  // ── Happiness and population ─────────────────────────────────────────────
  body.append(el('div', { class: 'section-title', text: 'Bonheur' }));
  body.append(
    el('div', { class: 'research-status' }, [
      statChip('Bonheur', `${Math.round(w.stats.happiness)} %`),
      statChip('Impôt', `${Math.round(w.taxRate * 100)} %`),
      statChip('Humeur fiscale', `${taxHappiness(w) >= 0 ? '+' : ''}${Math.round(taxHappiness(w))}`),
    ]),
  );
  if (samples.length < 2) {
    body.append(el('div', { class: 'empty-note', text: waitingNote() }));
  } else {
    body.append(
      lineChart({
        series: [{ label: 'Bonheur', color: '#e8a94a', values: samples.map((s) => s.happiness), fill: true }],
        include: [0, 100],
        clamp: [0, 100],
        xLabels: labels,
        height: 110,
        format: (v) => `${Math.round(v)}%`,
      }),
    );
    body.append(el('div', { class: 'section-title', text: 'Population et vivres' }));
    body.append(
      lineChart({
        series: [
          { label: 'Habitants', color: '#6fb0d4', values: samples.map((s) => s.population), fill: true },
          { label: 'Lits', color: '#8d8069', values: samples.map((s) => s.housing), dashed: true },
        ],
        include: [0],
        clamp: [0, Infinity],
        xLabels: labels,
        height: 110,
        format: (v) => formatNumber(v),
      }),
      chartLegend([
        { label: 'Habitants', color: '#6fb0d4' },
        { label: 'Lits', color: '#8d8069', dashed: true },
      ]),
    );
    body.append(
      lineChart({
        series: [{ label: 'Vivres', color: '#7fc06a', values: samples.map((s) => s.foodDays), fill: true }],
        include: [0],
        clamp: [0, Infinity],
        xLabels: labels,
        height: 100,
        format: (v) => `${Math.round(v)} j`,
      }),
    );
    body.append(
      el('div', {
        class: 'card-desc',
        text: `Sous ${FOOD_EXODUS_DAYS.toLocaleString('fr-FR')} jour de vivres, les villageois commencent à quitter le village : c'est la soupape qui évite la famine générale.`,
      }),
    );
  }

  const hall = el('button', { class: 'btn', text: "Régler l'impôt" });
  onTap(hall, () => {
    const townHall = w.buildingList.find((b) => b.def === 'town_hall');
    if (!townHall) return;
    api.selectBuilding(townHall.id);
  });
  body.append(el('div', { class: 'btn-row' }, [hall]));
  void refresh;
}

function waitingNote(): string {
  return "Les courbes se remplissent d'un point toutes les demi-journées. Revenez dans quelques minutes de jeu.";
}

function ledgerRows(w: GameApi['world'], sources: LedgerSource[]): Array<{ label: string; value: number; color: string }> {
  return sources
    .map((s) => ({ label: LEDGER_LABELS[s], value: w.history.total[s], color: LEDGER_COLORS[s] }))
    .filter((r) => r.value > 0.5)
    .sort((a, b) => b.value - a.value);
}

/** Turns the first, middle and last sample day into readable axis labels. */
function xLabelsFor(days: number[]): [string, string, string] {
  if (days.length === 0) return ['', '', ''];
  const first = days[0];
  const last = days[days.length - 1];
  const mid = days[Math.floor((days.length - 1) / 2)];
  const fmt = (d: number): string => `j${Math.floor(d)}`;
  return [fmt(first), fmt(mid), fmt(last)];
}

function deficitHint(w: GameApi['world'], net: number, trend: number): string {
  if (net >= 0) {
    if (w.research.active) return "Les études consomment déjà une partie de ce surplus : gardez-les en file d'attente.";
    return "Rien à l'étude en ce moment : lancez une recherche, c'est à ça que sert le trésor.";
  }
  const days = Math.floor(w.treasury / Math.max(1, -net));
  if (days < 3) {
    return `La caisse sera vide dans ${days} jour(s). Montez l'impôt à l'hôtel de ville, ou vendez au comptoir.`;
  }
  if (trend < 0 && w.taxRate < 0.5) {
    return `L'impôt est à ${Math.round(w.taxRate * 100)} % : le remonter d'un cran rééquilibre le budget sans vider le village.`;
  }
  return "Un déficit se rattrape en vendant : le comptoir de commerce paie bien les biens transformés.";
}

// ── Village overview ───────────────────────────────────────────────────────

function renderVillage(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const s = w.stats;

  body.append(
    el('div', { class: 'tier-banner' }, [
      icon('village', 'crest'),
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
    ['Savoir', String(w.research.completed.size), `études · ${scholarCount(w)} érudit(s)`],
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

  // Guided objectives: always something to aim at.
  const objectives = activeObjectives(w);
  if (objectives.length > 0) {
    body.append(
      el('div', { class: 'section-title', text: `Objectifs (${w.completedObjectives.size}/${OBJECTIVES.length})` }),
    );
    for (const o of objectives) {
      const [done, target] = o.progress(w);
      const reward = `${o.reward.gold} pièces`;
      body.append(
        el('div', { class: 'objective-card' }, [
          el('div', { class: 'card-title' }, [
            icon(o.icon as IconName, 'ic'),
            el('span', { text: o.title }),
            el('span', { class: 'qty', style: 'margin-left:auto', text: reward }),
          ]),
          el('div', { class: 'card-desc', text: o.hint }),
          bar(done / target, 'green'),
          target > 1
            ? el('div', { class: 'qty', text: `${Math.min(done, target)} / ${target}` })
            : null,
        ]),
      );
    }
  } else {
    body.append(
      el('div', {
        class: 'empty-note',
        text: 'Tous les objectifs sont accomplis. La vallée est à vous.',
      }),
    );
  }

  // Problems worth the player's attention, ranked.
  const issues = collectIssues(api);
  body.append(el('div', { class: 'section-title', text: 'À surveiller' }));
  if (issues.length === 0) {
    body.append(el('div', { class: 'empty-note', text: 'Tout roule. Profitez-en pour agrandir.' }));
  } else {
    for (const issue of issues.slice(0, 8)) {
      const row = el('div', { class: 'offer-row' }, [
        icon(issue.icon, 'ic'),
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
        tintedIcon(line.glyph, line.color),
        el('span', { class: 'grow' }, [
          el('div', { text: line.name }),
          el('div', { class: 'qty', text: line.detail }),
        ]),
        el('span', { class: 'qty', text: `${Math.round(line.efficiency * 100)}%` }),
      ]),
    );
  }

  const economy = el('button', { class: 'btn primary', text: 'Économie et courbes' });
  onTap(economy, () => api.openSheet('economy'));
  const settings = el('button', { class: 'btn', text: 'Options et sauvegarde' });
  onTap(settings, () => api.openSheet('settings'));
  body.append(el('div', { class: 'btn-row' }, [economy, settings]));
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
  icon: IconName;
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
      icon: 'food',
      title: 'Les réserves de nourriture baissent',
      detail: `${w.stats.foodDays.toFixed(1)} jours restants`,
      weight: 100,
    });
  }
  if (w.stats.housingCapacity <= w.stats.population) {
    issues.push({
      icon: 'home',
      title: 'Plus aucun logement libre',
      detail: 'Sans lit, pas de naissance ni de nouvel arrivant',
      weight: 80,
    });
  }
  if (w.stats.idle > 4) {
    issues.push({
      icon: 'worker',
      title: `${w.stats.idle} villageois sans emploi`,
      detail: 'Construisez des ateliers ou des camps de récolte',
      weight: 40,
    });
  }
  if (w.stockUsed >= w.stockCapacity * 0.95 && w.stockCapacity > 0) {
    issues.push({
      icon: 'box',
      title: 'Entrepôts saturés',
      detail: 'La production est bloquée tant que rien ne sort',
      weight: 70,
    });
  }

  for (const b of w.buildingList) {
    if (b.state === 'burning') {
      issues.push({
        icon: 'fire',
        title: `${BUILDINGS[b.def].name} en feu`,
        detail: `${Math.round(b.fire * 100)} % consumé`,
        focus: [b.cx, b.cy],
        weight: 200,
      });
    } else if (b.state === 'active' && b.stall) {
      issues.push({
        icon: 'warn',
        title: `${BUILDINGS[b.def].name} à l'arrêt`,
        detail: b.stall,
        focus: [b.cx, b.cy],
        weight: 30,
      });
    } else if (b.state === 'active' && BUILDINGS[b.def].workers > 0 && b.workers.length === 0) {
      issues.push({
        icon: 'worker',
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
  glyph: IconName;
  color: string;
  name: string;
  detail: string;
  efficiency: number;
}

function productionSummary(api: GameApi): ProdLine[] {
  const w = api.world;
  const byDef = new Map<
    BuildingId,
    { count: number; eff: number; workers: number; cap: number; rate: Map<GoodId, number> }
  >();
  for (const b of w.buildingList) {
    if (b.state !== 'active') continue;
    const def = BUILDINGS[b.def];
    if (!def.recipe && !def.gather && !def.recipes) continue;
    const e = byDef.get(b.def) ?? { count: 0, eff: 0, workers: 0, cap: 0, rate: new Map() };
    e.count++;
    e.eff += b.efficiency;
    e.workers += b.workers.length;
    e.cap += def.workers;
    // Summed across every building of the type: what the player compares is
    // "all my woodcutters" against "all my sawmills", not one shed at a time.
    for (const r of outputRates(b)) e.rate.set(r.good, (e.rate.get(r.good) ?? 0) + r.perMinute);
    byDef.set(b.def, e);
  }
  const out: ProdLine[] = [];
  for (const [id, e] of byDef) {
    const best = [...e.rate.entries()].sort((a, b) => b[1] - a[1])[0];
    const rate = best
      ? `${GOODS[best[0]].short} ${best[1] < 1 ? best[1].toFixed(1) : Math.round(best[1])}/min`
      : null;
    out.push({
      glyph: glyphFor(id),
      color: colorFor(id),
      name: `${BUILDINGS[id].name} ×${e.count}`,
      detail: rate ? `${e.workers}/${e.cap} ouvriers · ${rate}` : `${e.workers}/${e.cap} ouvriers`,
      efficiency: e.eff / Math.max(1, e.count),
    });
  }
  out.sort((a, b) => a.efficiency - b.efficiency);
  return out;
}

// ── Selected building ──────────────────────────────────────────────────────

/** Tax rate, the money it brings in, and the village's own name. */
function renderTreasury(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const perMinute = taxIncome(w) * 60;
  const swing = taxHappiness(w);

  // The village's own name, as a name. It used to be the label of a button
  // that said "Renommer « X »", so the one thing the panel was for — telling
  // you where you are — was buried in an instruction.
  const name = el('button', { class: 'village-name', title: 'Toucher pour renommer' }, [
    el('span', { text: w.villageName }),
    icon('pencil', 'ic'),
  ]);
  body.append(name);
  const rename = name;
  onTap(rename, () => {
    void askText({
      title: 'Nom du village',
      label: 'Comment appelle-t-on cet endroit ?',
      value: w.villageName,
      confirm: 'Renommer',
      cancel: 'Annuler',
    }).then((result) => {
      if (!result) return;
      const previous = w.villageName;
      w.villageName = result.value;
      w.notify(`${previous} s'appelle désormais ${w.villageName}`, 'flag', 'good');
      api.requestUiRefresh();
      refresh();
    });
  });
  // Taxes are a study. Until it is done there is no register, no rate and no
  // slider — showing a disabled one would only raise the question.
  if (!w.modifiers.taxation) {
    body.append(
      el('div', { class: 'section-title', text: 'Impôts' }),
      el('div', {
        class: 'card-desc',
        text: "Personne ne lève l'impôt ici. Étudiez « Registre et dîme » pour ouvrir un registre — d'ici là, le trésor ne grossit que par le commerce.",
      }),
      el('div', { class: 'research-status' }, [statChip('Trésor', `${Math.round(w.treasury)}`)]),
    );
    return;
  }

  body.append(el('div', { class: 'section-title', text: 'Impôts' }));
  body.append(
    el('div', { class: 'research-status' }, [
      statChip('Trésor', `${Math.round(w.treasury)}`),
      statChip('Impôts', `+${perMinute.toFixed(1)}/min`),
      statChip('Humeur', `${swing >= 0 ? '+' : ''}${Math.round(swing)} bonheur`),
    ]),
  );

  const slider = el('input', { class: 'slider', type: 'range', min: '0', max: '100', step: '5' }) as HTMLInputElement;
  slider.value = String(Math.round(w.taxRate * 100));
  const readout = el('div', { class: 'card-desc', text: taxHint(w.taxRate) });
  slider.addEventListener('input', () => {
    w.taxRate = Number(slider.value) / 100;
    readout.textContent = taxHint(w.taxRate);
  });
  slider.addEventListener('change', () => refresh());
  body.append(
    el('div', { class: 'slider-row' }, [
      el('span', { class: 'qty', text: '0 %' }),
      slider,
      el('span', { class: 'qty', text: '100 %' }),
    ]),
    readout,
  );
}

function taxHint(rate: number): string {
  const pct = Math.round(rate * 100);
  if (rate <= 0.2) return `${pct} % — les villageois vous adorent et la caisse se vide.`;
  if (rate <= 0.45) return `${pct} % — clément : un peu de marge, beaucoup de sourires.`;
  if (rate <= 0.6) return `${pct} % — le taux d'équilibre : personne ne s'en plaint vraiment.`;
  if (rate <= 0.8) return `${pct} % — lourd. Le bonheur baisse, la recherche avance.`;
  return `${pct} % — confiscatoire. Attendez-vous à des départs.`;
}

function renderBuilding(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const b = api.selectedBuildingId ? w.buildings.get(api.selectedBuildingId) : null;
  if (!b) {
    body.append(el('div', { class: 'empty-note', text: 'Aucun bâtiment sélectionné.' }));
    return;
  }
  const def = BUILDINGS[b.def];
  const slots = workerSlots(b);

  // The sheet header already names the building; repeating it wastes a third
  // of a phone screen.
  body.append(el('div', { class: 'card-desc lead', text: def.desc }));

  // The town hall is where the village's money is decided.
  if (b.def === 'town_hall') renderTreasury(api, body, refresh);

  // ── Construction ────────────────────────────────────────────────────────
  if ((b.state === 'planned' || b.state === 'building') && !b.demolish) {
    body.append(
      el('div', { class: 'section-title', text: b.repairing ? 'Remise en état' : 'Chantier' }),
    );
    body.append(bar(b.buildProgress / Math.max(1, siteWork(b)), 'blue'));
    const missing = el('div', { class: 'cost-row' });
    for (const [g, need] of Object.entries(siteCost(b))) {
      const good = g as GoodId;
      const have = b.delivered[good] ?? 0;
      missing.append(goodChip(good, `${have}/${need}`, have < (need as number)));
    }
    body.append(missing);
    body.append(
      el('div', {
        class: 'card-desc',
        text: 'Les villageois sans affectation apportent les matériaux et bâtissent.',
      }),
    );
  }

  if (b.state === 'ruined' && !b.demolish) {
    body.append(
      el('div', {
        class: 'empty-note',
        text:
          'Des murs debout et des gravats. Relevez-les — moins cher et plus rapide que de bâtir à neuf, ' +
          'les matériaux du tas comptant dans la note — ou déblayez le terrain.',
      }),
    );
    const gold = repairGoldCost(b);
    const check = w.canRepair(b);
    body.append(el('div', { class: 'section-title', text: 'Coût de la remise en état' }));
    const costs = el('div', { class: 'cost-row' });
    if (gold > 0) {
      costs.append(
        el('span', { class: `cost ${w.treasury < gold ? 'missing' : ''}` }, [
          el('span', { class: 'coin' }),
          el('span', { text: String(gold) }),
        ]),
      );
    }
    for (const [g, n] of Object.entries(siteCost(b))) {
      const have = b.delivered[g as GoodId] ?? 0;
      costs.append(goodChip(g as GoodId, `${Math.min(have, n as number)}/${n}`, have < (n as number)));
    }
    body.append(costs);
    const repair = el('button', {
      class: `btn ${check.ok ? 'primary' : ''} grow`,
      text: 'Relever le bâtiment',
      title: check.reason,
    });
    (repair as HTMLButtonElement).disabled = !check.ok;
    onTap(repair, () => {
      w.startRepair(b.id);
      refresh();
    });
    body.append(el('div', { class: 'btn-row' }, [repair]));
    if (!check.ok) body.append(el('div', { class: 'card-desc', text: check.reason }));
  }

  if (b.demolish) {
    body.append(el('div', { class: 'section-title', text: 'Démolition' }));
    body.append(bar(b.demolish.progress / b.demolish.total, 'red'));
    body.append(
      el('div', {
        class: 'card-desc',
        text: 'Les bâtisseurs démontent la charpente. Une partie des matériaux reviendra au village.',
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

  // ── Improvement in progress ─────────────────────────────────────────────
  if (b.upgrade) {
    body.append(el('div', { class: 'section-title', text: 'Travaux en cours' }));
    body.append(bar(b.upgrade.progress / Math.max(1, b.upgrade.total), 'blue'));
    const remaining = (b.upgrade.total - b.upgrade.progress) / Math.max(0.25, api.speed);
    body.append(el('div', { class: 'qty', text: `Encore ${formatDuration(remaining)}` }));
  }

  // ── Worker slots ────────────────────────────────────────────────────────
  if (slots > 0 && b.state === 'active') {
    const free = w.availableWorkers(b).length;
    body.append(
      el('div', { class: 'section-title', text: `Postes — ${b.workers.length}/${slots}` }),
    );
    const grid = el('div', { class: 'slot-grid' });
    for (let i = 0; i < slots; i++) {
      const id = b.workers[i];
      const v = id !== undefined ? w.villagerById.get(id) : undefined;
      if (v) {
        const av = villagerAvatar(v, 'slot-av');
        const slot = el('button', { class: 'slot filled', title: 'Retirer de ce poste' }, [
          av,
          el('span', { class: 'slot-name', text: v.name }),
        ]);
        onTap(slot, () => {
          w.unassignWorker(b.id, v.id);
          refresh();
        });
        grid.append(slot);
      } else {
        const slot = el('button', { class: `slot empty ${free > 0 ? '' : 'nobody'}` }, [
          el('span', { class: 'slot-av', text: '+' }),
          el('span', { class: 'slot-name', text: free > 0 ? 'Affecter' : 'Personne' }),
        ]);
        (slot as HTMLButtonElement).disabled = free === 0;
        onTap(slot, () => {
          w.assignWorker(b.id);
          refresh();
        });
        grid.append(slot);
      }
    }
    body.append(grid);
    body.append(
      el('div', {
        class: 'card-desc',
        text:
          free > 0
            ? `${free} villageois disponibles. Le rendement suit le nombre d’ouvriers.`
            : 'Aucun villageois disponible : libérez un poste ailleurs ou agrandissez le village.',
      }),
    );
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  const stats = el('div', { class: 'stat-grid' });
  if (housingCapacity(b) > 0) {
    stats.append(statBox('Habitants', `${b.residents.length}/${housingCapacity(b)}`));
  }
  if (def.gather || def.recipe || def.recipes) {
    stats.append(statBox('Rendement', `${Math.round(b.efficiency * outputMultiplier(b) * 100)}%`));
  }
  if (def.livestock) {
    stats.append(statBox('Troupeau', `${Math.floor(b.herd)}/${def.livestock.capacity}`));
  }
  if (def.gather) stats.append(statBox('Portée', `${Math.round(gatherRadius(b))} cases`));
  else if (def.service && def.service.radius > 0) {
    stats.append(statBox('Portée', `${Math.round(serviceRadius(b))} cases`));
  }
  if (def.storage) {
    stats.append(statBox('Stock', `${Math.round(w.usedOf(b))}/${w.capacityOf(b)}`));
  }
  if (collectRadius(b) > 0) {
    stats.append(statBox('Tournée', `${Math.round(collectRadius(b))} cases`));
  }
  if (stats.children.length > 0) body.append(stats);

  // A depot with nobody in it is a shed: say so, because the collection round
  // is the whole reason to staff one.
  if (def.storage?.collect) {
    body.append(
      el('div', {
        class: 'card-desc',
        text:
          b.workers.length > 0
            ? `${b.workers.length} porteur(s) font la tournée des ateliers dans ce rayon et ramènent ce qui s'y accumule.`
            : "Sans porteur, ce dépôt ne fait que stocker. Affectez-y quelqu'un pour qu'il aille chercher les productions alentour.",
      }),
    );
  }

  if (b.stall) body.append(el('div', { class: 'empty-note', text: `Arrêt : ${b.stall}` }));

  // ── Recipe selector ─────────────────────────────────────────────────────
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
    if (Object.keys(recipe.inputs).length > 0) flow.append(el('span', { class: 'cost arrow', text: '→' }));
    for (const [g, n] of Object.entries(recipe.outputs)) flow.append(goodChip(g as GoodId, `${n}`));
    body.append(flow);
  }
  if (def.gather) {
    const flow = el('div', { class: 'cost-row' });
    for (const [g, n] of Object.entries(def.gather.consumes ?? {})) flow.append(goodChip(g as GoodId, `${n}`));
    if (def.gather.consumes) flow.append(el('span', { class: 'cost arrow', text: '→' }));
    for (const [g, n] of Object.entries(def.gather.outputs)) flow.append(goodChip(g as GoodId, `${n}`));
    if (flow.children.length > 0) body.append(flow);
  }

  // ── Measured output ─────────────────────────────────────────────────────
  // What the recipe above promises is not what the building delivers: a camp
  // whose trees are forty tiles away spends its day walking. This is counted,
  // not computed, so two links of a chain can honestly be compared.
  if (recipe || def.gather) {
    const rates = outputRates(b);
    body.append(el('div', { class: 'section-title', text: 'Cadence réelle' }));
    if (!b.output.measured) {
      body.append(el('div', { class: 'card-desc', text: 'Mesure en cours…' }));
    } else if (rates.length === 0) {
      body.append(el('div', { class: 'card-desc', text: 'Rien ne sort d’ici pour le moment.' }));
    } else {
      const row = el('div', { class: 'cost-row' });
      for (const r of rates) {
        row.append(goodChip(r.good, `${r.perMinute < 1 ? r.perMinute.toFixed(1) : Math.round(r.perMinute)}/min`));
      }
      body.append(row);
    }
  }

  // ── Inventory ───────────────────────────────────────────────────────────
  const invEntries = Object.entries(b.inv).filter(([, n]) => (n as number) > 0.5);
  if (invEntries.length > 0) {
    body.append(el('div', { class: 'section-title', text: 'Sur place' }));
    const inv = el('div', { class: 'inv-row' });
    for (const [g, n] of invEntries) inv.append(goodChip(g as GoodId, formatNumber(n as number)));
    body.append(inv);
  }

  if (b.residents.length > 0) {
    body.append(el('div', { class: 'section-title', text: 'Foyer' }));
    for (const id of b.residents) {
      const v = w.villagerById.get(id);
      if (v) body.append(villagerRow(api, v));
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  const actions = el('div', { class: 'btn-row' });

  if (b.state === 'active' && !b.upgrade) {
    const target = upgradeTargetOf(b, w.modifiers.buildingLevel);
    if (!target && b.level < MAX_IN_PLACE_LEVEL && !BUILDINGS[b.def].upgradesTo) {
      body.append(
        el('div', { class: 'section-title', text: 'Amélioration' }),
        el('div', {
          class: 'card-desc',
          text:
            b.level === 1
              ? "Étudiez « Maîtres bâtisseurs » pour ouvrir le niveau II."
              : "Étudiez « Grands travaux » pour ouvrir le niveau III.",
        }),
      );
    }
    if (target) {
      const check = w.canUpgrade(b);
      const btn = el('button', {
        class: `btn ${check.ok ? 'primary' : ''}`,
        text: `Améliorer en ${target.name}`,
        title: check.reason,
      });
      (btn as HTMLButtonElement).disabled = !check.ok;
      onTap(btn, () => {
        w.startUpgrade(b.id);
        refresh();
      });
      actions.append(btn);

      body.append(el('div', { class: 'section-title', text: 'Coût de l’amélioration' }));
      const costs = el('div', { class: 'cost-row' });
      if (target.goldCost) {
        costs.append(
          el('span', { class: `cost ${w.treasury < target.goldCost ? 'missing' : ''}` }, [
            el('span', { class: 'coin' }),
            el('span', { text: String(target.goldCost) }),
          ]),
        );
      }
      for (const [g, n] of Object.entries(target.cost)) {
        costs.append(goodChip(g as GoodId, `${n}`, w.stockOf(g as GoodId) < (n as number)));
      }
      body.append(costs);
      if (!check.ok) body.append(el('div', { class: 'card-desc', text: check.reason }));
    }
  }

  if (b.upgrade) {
    const cancel = el('button', { class: 'btn', text: 'Annuler les travaux' });
    onTap(cancel, () => {
      w.cancelUpgrade(b.id);
      refresh();
    });
    actions.append(cancel);
  }

  if (b.demolish) {
    const stop = el('button', { class: 'btn', text: 'Arrêter la démolition' });
    onTap(stop, () => {
      w.cancelDemolish(b.id);
      refresh();
    });
    actions.append(stop);
  } else {
    const demolish = el('button', {
      class: 'btn danger',
      text: b.state === 'ruined' ? 'Déblayer' : 'Démolir',
    });
    onTap(demolish, () => {
      w.startDemolish(b.id);
      // A plan nobody has started on goes at once; anything else becomes a
      // site, and the panel should stay open to show the work happening.
      if (!w.buildings.has(b.id)) {
        api.selectBuilding(null);
        api.closeSheet();
      } else {
        refresh();
      }
    });
    actions.append(demolish);
  }
  body.append(actions);
}

function statBox(k: string, v: string): HTMLElement {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'k', text: k }),
    el('div', { class: 'v', text: v }),
  ]);
}

function goodChip(good: GoodId, amount: string, missing = false): HTMLElement {
  const dot = el('span', { class: 'dot' });
  dot.style.background = GOODS[good].color;
  return el('span', { class: `cost ${missing ? 'missing' : ''}`, title: GOODS[good].name }, [
    dot,
    el('span', { text: `${GOODS[good].short} ${amount}` }),
  ]);
}

// ── Selected villager ──────────────────────────────────────────────────────

const STATE_LABEL: Record<string, string> = {
  idle: 'Attend des ordres',
  walking: 'En chemin',
  working: 'Au travail',
  hauling: 'Transporte une charge',
  eating: 'Mange',
  sleeping: 'Dort',
  relaxing: 'Se promène',
  fleeing: 'Fuit',
};

const TASK_LABEL: Record<string, string> = {
  none: '—',
  harvest: 'Récolte',
  produce: 'Production',
  haul: 'Livraison',
  build: 'Chantier',
  eat: 'Cherche à manger',
  sleep: 'Rentre se coucher',
  wander: 'Flâne',
  douse: "Combat l'incendie",
};

function renderVillager(api: GameApi, body: HTMLElement, refresh: Refresh): void {
  const w = api.world;
  const v = api.selectedVillagerId ? w.villagerById.get(api.selectedVillagerId) : null;
  if (!v) {
    body.append(el('div', { class: 'empty-note', text: 'Ce villageois n’est plus parmi nous.' }));
    return;
  }
  const prof = PROFESSIONS[v.profession] ?? PROFESSIONS.idle;

  const avatar = villagerAvatar(v, 'big');
  const head = el('div', { class: 'detail-head' }, [
    avatar,
    el('div', { class: 'grow' }, [
      el('div', { class: 'card-title', text: fullName(v) }),
      el('div', {
        class: 'card-desc',
        text: `${v.female ? 'Femme' : 'Homme'} · ${Math.floor(v.age)} ans · ${prof.name}`,
      }),
    ]),
  ]);
  const renameVillager = el('button', {
    class: 'icon-btn',
    'aria-label': 'Renommer',
    title: 'Renommer',
  });
  renameVillager.append(icon('scroll'));
  onTap(renameVillager, () => {
    void askText({
      title: 'Renommer',
      label: 'Prénom',
      value: v.name,
      secondLabel: 'Nom',
      secondValue: v.surname,
      confirm: 'Renommer',
      cancel: 'Annuler',
    }).then((result) => {
      if (!result) return;
      v.name = result.value;
      if (result.second) v.surname = result.second;
      api.requestUiRefresh();
      refresh();
    });
  });
  head.append(renameVillager);
  body.append(head);

  body.append(el('div', { class: 'section-title', text: 'En ce moment' }));
  body.append(
    el('div', { class: 'card-desc', text: `${STATE_LABEL[v.state] ?? v.state} — ${TASK_LABEL[v.task.kind] ?? v.task.kind}` }),
  );
  if (v.carrying) {
    body.append(el('div', { class: 'inv-row' }, [goodChip(v.carrying, String(v.carryAmount))]));
  }

  const needs: Array<[string, number, string]> = [
    ['Satiété', v.satiety, ''],
    ['Bonheur', v.happiness, 'green'],
    ['Énergie', v.energy, 'blue'],
    ['Santé', v.health, v.health < 50 ? 'red' : 'green'],
  ];
  body.append(el('div', { class: 'section-title', text: 'Besoins' }));
  for (const [label, value, cls] of needs) {
    body.append(
      el('div', { class: 'offer-row' }, [
        el('span', { class: 'grow' }, [
          el('div', { text: label }),
          bar(value / 100, cls),
        ]),
        el('span', { class: 'qty', text: `${Math.round(value)}%` }),
      ]),
    );
  }
  if (v.sick > 0) {
    body.append(
      el('div', { class: 'empty-note' }, [icon('illness'), el('span', { text: 'Alité, convalescence en cours.' })]),
    );
  }
  if (v.pregnant > 0) {
    body.append(
      el('div', { class: 'empty-note' }, [
        icon('family'),
        el('span', { text: `Enceinte — naissance dans ${v.pregnant.toFixed(1)} jours.` }),
      ]),
    );
  }

  const work = v.workId ? w.buildings.get(v.workId) : null;
  const home = v.homeId ? w.buildings.get(v.homeId) : null;
  body.append(el('div', { class: 'section-title', text: 'Attaches' }));
  for (const [label, b] of [
    ['Travail', work],
    ['Foyer', home],
  ] as Array<[string, Building | null | undefined]>) {
    const row = el('div', { class: 'offer-row' }, [
      b ? buildingIcon(b.def, 'ic') : el('span', { text: '—' }),
      el('span', { class: 'grow' }, [
        el('div', { text: label }),
        el('div', { class: 'qty', text: b ? BUILDINGS[b.def].name : 'Aucun' }),
      ]),
    ]);
    if (b) {
      const btn = el('button', { class: 'mini-btn', text: 'Voir' });
      onTap(btn, () => {
        api.selectBuilding(b.id);
        api.focusOn(b.cx, b.cy, 20);
      });
      row.append(btn);
    }
    body.append(row);
  }

  const follow = el('button', { class: 'btn primary', text: 'Centrer la caméra' });
  onTap(follow, () => api.focusOn(v.x, v.y, 14));
  const close = el('button', { class: 'btn', text: 'Désélectionner' });
  onTap(close, () => {
    api.selectVillager(null);
    api.closeSheet();
  });
  body.append(el('div', { class: 'btn-row' }, [follow, close]));
  void refresh;
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

  // ── Sound ───────────────────────────────────────────────────────────────
  body.append(el('div', { class: 'section-title', text: 'Son' }));
  const muteBtn = el('button', {
    class: `btn ${api.sound.muted ? '' : 'primary'}`,
    text: api.sound.muted ? 'Activer le son' : 'Couper le son',
  });
  onTap(muteBtn, () => {
    api.sound.setMuted(!api.sound.muted);
    if (!api.sound.muted) api.sound.play('tap');
    refresh();
  });
  body.append(el('div', { class: 'btn-row' }, [muteBtn]));

  const volume = el('input', {
    class: 'slider',
    type: 'range',
    min: '0',
    max: '100',
    step: '5',
  }) as HTMLInputElement;
  volume.value = String(Math.round(api.sound.volume * 100));
  volume.disabled = api.sound.muted;
  volume.addEventListener('input', () => api.sound.setVolume(Number(volume.value) / 100));
  volume.addEventListener('change', () => api.sound.play('tap'));
  body.append(
    el('div', { class: 'slider-row' }, [
      el('span', { class: 'qty', text: 'Bas' }),
      volume,
      el('span', { class: 'qty', text: 'Fort' }),
    ]),
    el('div', {
      class: 'card-desc',
      text: "Tout est synthétisé à la volée : le vent, la pluie, les oiseaux, la hache du bûcheron et la cloche du matin. Aucun fichier audio dans l'APK.",
    }),
  );

  body.append(el('div', { class: 'section-title', text: 'Affichage' }));
  const debugBtn = el('button', {
    class: 'btn',
    text: api.showDebug ? 'Masquer les infos techniques' : 'Afficher les infos techniques',
  });
  onTap(debugBtn, () => {
    api.showDebug = !api.showDebug;
    refresh();
  });
  body.append(el('div', { class: 'btn-row' }, [debugBtn]));

  body.append(el('div', { class: 'section-title', text: 'Partie' }));
  const saveBtn = el('button', { class: 'btn primary', text: 'Sauvegarder' });
  onTap(saveBtn, () => {
    void api.save();
  });
  const loadBtn = el('button', { class: 'btn', text: 'Charger' });
  onTap(loadBtn, () => {
    void api.load();
  });
  body.append(el('div', { class: 'btn-row' }, [saveBtn, loadBtn]));

  const restart = el('button', { class: 'btn danger', text: 'Nouvelle vallée' });
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
