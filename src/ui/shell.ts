import { formatNumber } from '../core/util';
import { BUILDINGS } from '../data/buildings';
import { buildingIcon } from './panels';
import { GOODS, type GoodId } from '../data/goods';
import { TIER_NAMES } from '../sim/economy';
import { SEASON_LABEL, type Notification } from '../sim/types';
import { clear, el, onTap, setText } from './dom';
import { icon, pastille, type IconName } from './icons';
import { pinnedGoods, togglePin } from './stock';
import type { GameApi, SheetId } from './api';
import { renderSheet, sheetTitle } from './panels';
import { hasUniversity } from '../sim/research';
import { activeObjectives } from '../sim/objectives';
import { Minimap } from './minimap';

const WEATHER_ICON: Record<string, IconName> = {
  clear: 'sun',
  rain: 'rain',
  storm: 'storm',
  snow: 'snow',
  fog: 'fog',
};

/** Sheets whose contents change while they are open. */
/** Sheets rendered as a full page rather than a bottom drawer. */
const FULL_SHEETS = new Set<SheetId>(['research', 'economy']);

const LIVE_SHEETS = new Set<SheetId>([
  'research',
  'trade',
  'building',
  'village',
  'people',
  'villager',
]);

/**
 * The economy page is a wall of SVG. Rebuilding it twice a second would burn
 * frames for nothing — its curves only gain a point every half in-game day.
 */
const SLOW_LIVE_SHEETS = new Set<SheetId>(['economy']);

const DOCK: Array<{ id: SheetId; icon: IconName; label: string }> = [
  { id: 'build', icon: 'build', label: 'Bâtir' },
  { id: 'research', icon: 'research', label: 'Savoir' },
  { id: 'trade', icon: 'trade', label: 'Commerce' },
  { id: 'people', icon: 'people', label: 'Villageois' },
  { id: 'village', icon: 'village', label: 'Village' },
];

/** The persistent chrome: top bar, resource ticker, dock, toasts and sheets. */
export class UiShell {
  private root: HTMLElement;
  private api: GameApi;

  private vitals!: HTMLElement;
  private clock!: HTMLElement;
  private speeds!: HTMLElement;
  private resources!: HTMLElement;
  private dock!: HTMLElement;
  private toasts!: HTMLElement;
  private eventsStrip!: HTMLElement;
  private sheet!: HTMLElement;
  private sheetHead!: HTMLElement;
  private sheetBody!: HTMLElement;
  private buildBanner!: HTMLElement;
  private objectiveChip!: HTMLElement;
  private debug!: HTMLElement;
  minimap!: Minimap;

  private resChips = new Map<GoodId, { node: HTMLElement; value: HTMLElement }>();
  /** Rebuilt only when the pinned set changes, not on every frame. */
  private vitalNodes = new Map<string, HTMLElement>();
  private seenNotifications = 0;
  private refreshTimer = 0;
  private sheetDirty = true;
  private liveTimer = 0;
  private slowLiveTimer = 0;

  constructor(root: HTMLElement, api: GameApi) {
    this.root = root;
    this.api = api;
    this.build();
    api.world.emitter.on('notify', (n) => this.pushToast(n));
  }

  // ── Construction ────────────────────────────────────────────────────────
  private build(): void {
    clear(this.root);

    // Top bar -------------------------------------------------------------
    this.vitals = el('div', { class: 'vitals' });
    for (const [key, glyph] of [
      ['pop', 'people'],
      ['food', 'food'],
      ['happy', 'mood'],
      ['gold', 'coin'],
    ] as const) {
      const value = el('span', { class: 'vl', text: '0' });
      const node = el('div', { class: 'vital', 'data-k': key }, [
        icon(glyph as IconName, 'ic'),
        value,
      ]);
      // Money and morale are the two numbers the economy page explains, so
      // tapping them is the shortest route to the curves.
      if (key === 'gold' || key === 'happy') {
        node.classList.add('tappable');
        onTap(node, () => this.api.openSheet('economy'));
      }
      this.vitalNodes.set(key, value);
      this.vitals.append(node);
    }

    this.clock = el('div', { class: 'clock' });
    this.speeds = el('div', { class: 'speeds' });
    for (const s of [0, 1, 2, 4]) {
      const btn = el('button', {
        class: 'speed-btn',
        'data-speed': s,
        'aria-label': s === 0 ? 'Pause' : `Vitesse ${s}`,
      });
      if (s === 0) btn.append(icon('pause', 'ic'));
      else btn.append(el('span', { text: `${s}×` }));
      onTap(btn, () => this.api.setSpeed(s));
      this.speeds.append(btn);
    }
    const clockText = el('div', { class: 'clock-text' });
    this.clock.append(clockText, this.speeds);

    const topbar = el('div', { class: 'topbar' }, [this.vitals, this.clock]);

    // Resource ticker -----------------------------------------------------
    this.resources = el('div', { class: 'resources' });
    const hudTop = el('div', { class: 'hud-top' }, [topbar, this.resources]);

    // Dock ----------------------------------------------------------------
    this.dock = el('div', { class: 'dock' });
    for (const item of DOCK) {
      const btn = el('button', { class: 'dock-btn', 'data-sheet': item.id }, [
        icon(item.icon, 'ic'),
        el('span', { text: item.label }),
      ]);
      onTap(btn, () => {
        if (this.api.openSheetId === item.id) this.api.closeSheet();
        else this.api.openSheet(item.id);
      });
      this.dock.append(btn);
    }

    // Sheets --------------------------------------------------------------
    this.sheetHead = el('div', { class: 'sheet-head' });
    this.sheetBody = el('div', { class: 'sheet-body' });
    this.sheet = el('div', { class: 'sheet' }, [
      el('div', { class: 'sheet-grip' }),
      this.sheetHead,
      this.sheetBody,
    ]);

    this.toasts = el('div', { class: 'toasts' });
    this.eventsStrip = el('div', { class: 'events-strip' });
    this.objectiveChip = el('div', { class: 'objective-chip' });
    this.objectiveChip.style.display = 'none';
    onTap(this.objectiveChip, () => this.api.openSheet('village'));
    this.buildBanner = el('div', { class: 'build-banner' });
    this.buildBanner.style.display = 'none';
    this.debug = el('div', { class: 'debug' });
    this.debug.style.display = 'none';
    this.minimap = new Minimap(this.api);

    this.root.append(
      hudTop,
      this.toasts,
      this.objectiveChip,
      this.eventsStrip,
      this.buildBanner,
      this.minimap.root,
      this.dock,
      this.sheet,
      this.debug,
    );
  }

  markSheetDirty(): void {
    this.sheetDirty = true;
  }

  // ── Per-frame update ────────────────────────────────────────────────────
  update(dt: number, frameMs: number, fps: number): void {
    this.refreshTimer -= dt;
    if (this.refreshTimer > 0) return;
    this.refreshTimer = 0.2;

    this.minimap.update();
    this.updateVitals();
    this.updateClock();
    this.updateResources();
    this.updateDock();
    const placing = this.api.placementId !== null;
    this.dock.style.display = placing ? 'none' : 'flex';
    this.minimap.root.style.display = placing ? 'none' : 'block';
    this.updateEvents();
    this.updateObjective();
    this.updateBanner();
    this.updateDebug(frameMs, fps);

    // Panels that show running values — research timers, caravan ETAs, stocks —
    // redraw on their own so the player never has to close and reopen them.
    this.liveTimer -= dt;
    if (this.liveTimer <= 0) {
      this.liveTimer = 0.5;
      const open = this.api.openSheetId;
      if (open && LIVE_SHEETS.has(open)) this.sheetDirty = true;
      if (open && SLOW_LIVE_SHEETS.has(open)) {
        this.slowLiveTimer -= 0.5;
        if (this.slowLiveTimer <= 0) {
          this.slowLiveTimer = 3;
          this.sheetDirty = true;
        }
      }
    }
    if (this.sheetDirty) {
      this.sheetDirty = false;
      this.renderSheetContents();
    }
  }

  private updateVitals(): void {
    const s = this.api.world.stats;
    const w = this.api.world;

    const pop = this.vitalNodes.get('pop')!;
    setText(pop, `${s.population}/${s.housingCapacity}`);
    pop.parentElement!.classList.toggle('warn', s.housingCapacity <= s.population);

    const food = this.vitalNodes.get('food')!;
    setText(food, s.foodDays > 99 ? '99+ j' : `${s.foodDays.toFixed(1)} j`);
    food.parentElement!.classList.toggle('warn', s.foodDays < 4);
    food.parentElement!.classList.toggle('good', s.foodDays > 15);

    const happy = this.vitalNodes.get('happy')!;
    setText(happy, `${Math.round(s.happiness)}%`);
    happy.parentElement!.classList.toggle('warn', s.happiness < 40);
    happy.parentElement!.classList.toggle('good', s.happiness > 70);

    setText(this.vitalNodes.get('gold')!, formatNumber(w.treasury));
  }

  private updateClock(): void {
    const w = this.api.world;
    const hours = Math.floor(w.time.dayFraction * 24);
    const minutes = Math.floor((w.time.dayFraction * 24 - hours) * 60);
    const node = this.clock.querySelector('.clock-text') as HTMLElement;
    const line1 = `${SEASON_LABEL[w.time.season]} · an ${w.time.year}`;
    const line2 = `Jour ${w.time.day} — ${String(hours).padStart(2, '0')}:${String(
      Math.floor(minutes / 10) * 10,
    ).padStart(2, '0')}`;
    const wanted = `${line1}\n${line2}\n${w.weather}`;
    if (node.dataset.v !== wanted) {
      node.dataset.v = wanted;
      clear(node);
      node.append(
        el('div', { class: 'clock-line' }, [el('strong', { text: line1 })]),
        el('div', { class: 'clock-line' }, [
          el('span', { text: line2 }),
          icon(WEATHER_ICON[w.weather] ?? 'sun', 'ic weather'),
        ]),
      );
    }
    for (const btn of Array.from(this.speeds.children) as HTMLElement[]) {
      btn.classList.toggle('active', Number(btn.dataset.speed) === this.api.speed);
    }
  }

  /**
   * Four pinned goods and a storage gauge, on one line that never scrolls.
   * Tapping a chip unpins it; the gauge opens the full Ressources page.
   */
  private updateResources(): void {
    const w = this.api.world;
    const pins = pinnedGoods();
    const key = pins.join(',');
    if (this.resources.dataset.pins !== key) {
      this.resources.dataset.pins = key;
      clear(this.resources);
      this.resChips.clear();
      for (const good of pins) {
        const value = el('span', { class: 'v', text: '0' });
        const node = el('button', { class: 'res-chip', title: GOODS[good].name }, [
          pastille(GOODS[good].color),
          el('span', { class: 'n', text: GOODS[good].short }),
          value,
        ]);
        onTap(node, () => {
          togglePin(good);
          this.updateResources();
        });
        this.resources.append(node);
        this.resChips.set(good, { node, value });
      }
      // Icon and bar only: the exact figure lives on the Ressources page, and
      // three resource names plus a percentage do not fit on a 412-pixel line.
      const gauge = el('button', { class: 'res-gauge', 'aria-label': 'Ressources' }, [
        icon('stock', 'ic'),
        el('div', { class: 'gauge-track' }, [el('div', { class: 'gauge-fill' })]),
      ]);
      onTap(gauge, () => this.api.openSheet('stock'));
      this.resources.append(gauge);
    }

    for (const [good, chip] of this.resChips) {
      const amount = w.stockOf(good);
      setText(chip.value, formatNumber(amount));
      chip.node.classList.toggle('low', amount <= 0);
    }

    const gauge = this.resources.querySelector('.res-gauge') as HTMLElement | null;
    if (gauge) {
      const ratio = w.stockCapacity > 0 ? w.stockUsed / w.stockCapacity : 0;
      const fill = gauge.querySelector('.gauge-fill') as HTMLElement;
      fill.style.width = `${Math.min(100, ratio * 100).toFixed(0)}%`;
      gauge.title = `Entrepôts : ${Math.round(ratio * 100)} %`;
      // A full store stops every chain upstream, so it has to look alarming.
      gauge.classList.toggle('warn', ratio > 0.92);
    }
  }

  private updateDock(): void {
    const w = this.api.world;
    for (const btn of Array.from(this.dock.children) as HTMLElement[]) {
      const id = btn.dataset.sheet as SheetId;
      btn.classList.toggle('active', this.api.openSheetId === id);
      // A badge on Savoir whenever a research can be started right now.
      if (id === 'research') {
        // A badge whenever the desk is free and there is a university to use.
        const canStart =
          !w.research.active && w.research.queue.length === 0 && hasUniversity(w);
        let badge = btn.querySelector('.badge') as HTMLElement | null;
        if (canStart && !badge) {
          badge = el('span', { class: 'badge', text: '!' });
          btn.append(badge);
        } else if (!canStart && badge) {
          badge.remove();
        }
      }
    }
  }

  private updateEvents(): void {
    const events = this.api.world.activeEvents;
    const wanted = events.map((e) => `${e.id}`).join(',');
    if (this.eventsStrip.dataset.v === wanted) return;
    this.eventsStrip.dataset.v = wanted;
    clear(this.eventsStrip);
    for (const e of events.slice(-3)) {
      this.eventsStrip.append(
        el('div', { class: `event-chip ${e.tone}` }, [
          icon(e.icon as IconName, 'ic'),
          el('span', { text: e.title }),
        ]),
      );
    }
  }

  private updateObjective(): void {
    const [next] = activeObjectives(this.api.world);
    if (!next || this.api.placementId) {
      this.objectiveChip.style.display = 'none';
      return;
    }
    const [done, target] = next.progress(this.api.world);
    const key = `${next.id}:${Math.min(done, target)}/${target}`;
    if (this.objectiveChip.dataset.v !== key) {
      this.objectiveChip.dataset.v = key;
      clear(this.objectiveChip);
      const fill = el('div', { class: 'objective-fill' });
      fill.style.width = `${Math.min(100, (done / target) * 100)}%`;
      this.objectiveChip.append(
        icon(next.icon as IconName, 'ic'),
        el('div', { class: 'objective-body' }, [
          el('div', { class: 'objective-title', text: next.title }),
          el('div', { class: 'objective-bar' }, [fill]),
        ]),
        el('span', {
          class: 'objective-count',
          text: target > 1 ? `${Math.min(done, target)}/${target}` : '',
        }),
      );
    }
    this.objectiveChip.style.display = 'flex';
  }

  private updateBanner(): void {
    const id = this.api.placementId;
    if (!id) {
      this.buildBanner.style.display = 'none';
      this.buildBanner.dataset.v = '';
      return;
    }
    const def = BUILDINGS[id];
    const info = this.api.placementInfo;
    const painting = def.placement.kind === 'paint';
    const valid = info ? info.valid : false;

    const hint = painting
      ? 'Glissez le doigt sur le sol pour tracer.'
      : info
        ? info.valid
          ? info.label
            ? `${info.resources} ${info.label} à portée`
            : 'Emplacement valide'
          : info.reason
        : 'Visez un emplacement';

    const key = `${id}|${hint}|${valid}|${this.api.placementRotation}`;
    if (this.buildBanner.dataset.v === key) {
      this.buildBanner.style.display = 'flex';
      return;
    }
    this.buildBanner.dataset.v = key;
    clear(this.buildBanner);

    const head = el('div', { class: 'place-head' }, [
      buildingIcon(id, 'place-ic'),
      el('div', { class: 'grow' }, [
        el('div', { class: 'place-name', text: def.name }),
        el('div', { class: `place-hint ${valid || painting ? '' : 'bad'}`, text: hint }),
      ]),
    ]);

    // Costs, so the player never confirms a build they cannot afford.
    const costs = el('div', { class: 'cost-row' });
    const w = this.api.world;
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
      const dot = el('span', { class: 'dot' });
      dot.style.background = GOODS[good].color;
      costs.append(
        el('span', { class: `cost ${w.stockOf(good) < (n as number) ? 'missing' : ''}` }, [
          dot,
          el('span', { text: `${GOODS[good].short} ${n}` }),
        ]),
      );
    }

    const cancel = el('button', { class: 'btn', text: 'Annuler' });
    onTap(cancel, () => this.api.cancelPlacement());

    const row = el('div', { class: 'place-actions' });
    if (!painting) {
      const rotate = el('button', { class: 'btn', text: 'Pivoter' });
      onTap(rotate, () => this.api.rotatePlacement());
      const confirm = el('button', {
        class: 'btn primary grow',
        text: 'Construire ici',
      });
      (confirm as HTMLButtonElement).disabled = !valid;
      onTap(confirm, () => this.api.confirmPlacement());
      row.append(cancel, rotate, confirm);
    } else {
      const done = el('button', { class: 'btn primary grow', text: 'Terminer' });
      onTap(done, () => this.api.cancelPlacement());
      row.append(cancel, done);
    }

    this.buildBanner.append(head, costs, row);
    this.buildBanner.classList.toggle('invalid', !valid && !painting);
    this.buildBanner.style.display = 'flex';
  }

  private updateDebug(frameMs: number, fps: number): void {
    if (!this.api.showDebug) {
      this.debug.style.display = 'none';
      return;
    }
    const w = this.api.world;
    this.debug.style.display = 'block';
    this.debug.textContent =
      `${fps.toFixed(0)} fps  ${frameMs.toFixed(1)} ms\n` +
      `pop ${w.villagers.length}  bât ${w.buildingList.length}\n` +
      `nœuds ${w.nodes.size}  tâches ${w.haulJobs.length}\n` +
      `A* ${w.pathfinder.searches}`;
  }

  // ── Toasts ──────────────────────────────────────────────────────────────
  private pushToast(n: Notification): void {
    this.seenNotifications++;
    const node = el('div', { class: `toast ${n.tone}` }, [
      icon((n.icon || 'info') as IconName, 'ic'),
      el('span', { text: n.text }),
    ]);
    if (n.fx !== undefined && n.fy !== undefined) {
      onTap(node, () => this.api.focusOn(n.fx!, n.fy!));
    }
    this.toasts.append(node);
    while (this.toasts.children.length > 4) this.toasts.removeChild(this.toasts.firstChild!);
    setTimeout(() => {
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 400);
    }, 4200);
  }

  // ── Sheets ──────────────────────────────────────────────────────────────
  openSheet(id: SheetId): void {
    this.sheet.classList.add('open');
    // The knowledge tree needs the whole screen to stay readable.
    this.sheet.classList.toggle('full', FULL_SHEETS.has(id));
    this.renderSheetContents(id);
  }

  closeSheet(): void {
    this.sheet.classList.remove('open');
  }

  private renderSheetContents(id: SheetId | null = this.api.openSheetId): void {
    if (!id) return;
    const scroll = this.sheetBody.scrollTop;
    clear(this.sheetHead);
    const { title, sub } = sheetTitle(id, this.api);
    const close = el('button', { class: 'sheet-close', 'aria-label': 'Fermer' }, [icon('close')]);
    onTap(close, () => this.api.closeSheet());
    this.sheetHead.append(
      el('div', {}, [
        el('h2', { text: title }),
        sub ? el('div', { class: 'sub', text: sub }) : null,
      ]),
      close,
    );
    clear(this.sheetBody);
    renderSheet(id, this.api, this.sheetBody, () => this.markSheetDirty());
    this.sheetBody.scrollTop = scroll;
  }

  get tierLabel(): string {
    return TIER_NAMES[this.api.world.stats.tier] ?? 'Village';
  }
}
