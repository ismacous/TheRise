import { formatNumber } from '../core/util';
import { BUILDINGS } from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import { TIER_NAMES } from '../sim/economy';
import { SEASON_LABEL, type Notification } from '../sim/types';
import { clear, el, onTap, setText } from './dom';
import type { GameApi, SheetId } from './api';
import { renderSheet, sheetTitle } from './panels';
import { activeObjectives } from '../sim/objectives';

const WEATHER_ICON: Record<string, string> = {
  clear: '☀️',
  rain: '🌧️',
  storm: '⛈️',
  snow: '❄️',
  fog: '🌫️',
};

/** Goods always shown in the ticker, in this order. */
const PRIMARY_GOODS: GoodId[] = [
  'logs',
  'planks',
  'stone',
  'bricks',
  'coal',
  'charcoal',
  'iron_ingot',
  'gold_ingot',
  'tools',
  'bread',
  'meat',
  'fish',
  'smoked_fish',
  'berries',
  'eggs',
  'wheat',
  'flour',
  'cloth',
  'leather',
  'wool',
  'hide',
  'clothes',
  'boots',
  'furniture',
  'ale',
  'candles',
  'arrows',
  'jewellery',
];

const DOCK: Array<{ id: SheetId; icon: string; label: string }> = [
  { id: 'build', icon: '🔨', label: 'Bâtir' },
  { id: 'research', icon: '📜', label: 'Savoir' },
  { id: 'trade', icon: '⚖️', label: 'Commerce' },
  { id: 'people', icon: '👥', label: 'Villageois' },
  { id: 'village', icon: '🏰', label: 'Village' },
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

  private resChips = new Map<GoodId, { node: HTMLElement; value: HTMLElement }>();
  private vitalNodes = new Map<string, HTMLElement>();
  private seenNotifications = 0;
  private refreshTimer = 0;
  private sheetDirty = true;

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
    for (const [key, icon] of [
      ['pop', '👥'],
      ['food', '🍞'],
      ['happy', '😊'],
      ['gold', '🪙'],
      ['research', '📜'],
    ] as const) {
      const value = el('span', { class: 'vl', text: '0' });
      const node = el('div', { class: 'vital', 'data-k': key }, [
        el('span', { class: 'ic', text: icon }),
        value,
      ]);
      this.vitalNodes.set(key, value);
      this.vitals.append(node);
    }

    this.clock = el('div', { class: 'clock' });
    this.speeds = el('div', { class: 'speeds' });
    for (const s of [0, 1, 2, 4]) {
      const btn = el('button', {
        class: 'speed-btn',
        'data-speed': s,
        text: s === 0 ? '⏸' : `${s}×`,
        'aria-label': s === 0 ? 'Pause' : `Vitesse ${s}`,
      });
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
        el('span', { class: 'ic', text: item.icon }),
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

    this.root.append(
      hudTop,
      this.toasts,
      this.objectiveChip,
      this.eventsStrip,
      this.buildBanner,
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

    this.updateVitals();
    this.updateClock();
    this.updateResources();
    this.updateDock();
    this.updateEvents();
    this.updateObjective();
    this.updateBanner();
    this.updateDebug(frameMs, fps);
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
    setText(this.vitalNodes.get('research')!, formatNumber(w.research.points));
  }

  private updateClock(): void {
    const w = this.api.world;
    const hours = Math.floor(w.time.dayFraction * 24);
    const minutes = Math.floor((w.time.dayFraction * 24 - hours) * 60);
    const node = this.clock.querySelector('.clock-text') as HTMLElement;
    const line1 = `${SEASON_LABEL[w.time.season]} · an ${w.time.year}`;
    const line2 = `Jour ${w.time.day} — ${String(hours).padStart(2, '0')}:${String(
      Math.floor(minutes / 10) * 10,
    ).padStart(2, '0')} ${WEATHER_ICON[w.weather] ?? ''}`;
    const wanted = `${line1}\n${line2}`;
    if (node.dataset.v !== wanted) {
      node.dataset.v = wanted;
      clear(node);
      node.append(
        el('div', { class: 'clock-line', html: `<strong>${line1}</strong>` }),
        el('div', { class: 'clock-line', text: line2 }),
      );
    }
    for (const btn of Array.from(this.speeds.children) as HTMLElement[]) {
      btn.classList.toggle('active', Number(btn.dataset.speed) === this.api.speed);
    }
  }

  private updateResources(): void {
    const w = this.api.world;
    for (const good of PRIMARY_GOODS) {
      const amount = w.stockOf(good);
      const known = this.resChips.get(good);
      // Only show a resource once the village has actually seen some of it.
      if (amount <= 0 && !known) continue;
      if (!known) {
        const value = el('span', { class: 'v', text: '0' });
        const dot = el('span', { class: 'dot' });
        dot.style.background = GOODS[good].color;
        const node = el('div', { class: 'res-chip', title: GOODS[good].name }, [
          dot,
          el('span', { class: 'n', text: GOODS[good].short }),
          value,
        ]);
        this.resources.append(node);
        this.resChips.set(good, { node, value });
      }
      const chip = this.resChips.get(good)!;
      setText(chip.value, formatNumber(amount));
      chip.node.classList.toggle('low', amount <= 0);
    }
  }

  private updateDock(): void {
    const w = this.api.world;
    for (const btn of Array.from(this.dock.children) as HTMLElement[]) {
      const id = btn.dataset.sheet as SheetId;
      btn.classList.toggle('active', this.api.openSheetId === id);
      // A badge on Savoir whenever a research can be started right now.
      if (id === 'research') {
        const canStart = !w.research.active && w.research.points > 8;
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
          el('span', { text: e.icon }),
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
        el('span', { class: 'ic', text: next.icon }),
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
      return;
    }
    const def = BUILDINGS[id];
    if (this.buildBanner.dataset.v !== id) {
      this.buildBanner.dataset.v = id;
      clear(this.buildBanner);
      const rotate = el('button', { class: 'icon-btn', text: '⟳', 'aria-label': 'Pivoter' });
      onTap(rotate, () => this.api.rotatePlacement());
      const cancel = el('button', { class: 'icon-btn', text: '✕', 'aria-label': 'Annuler' });
      onTap(cancel, () => this.api.cancelPlacement());
      this.buildBanner.append(
        el('div', { class: 'grow' }, [
          el('div', { class: 'name', text: def.name }),
          el('div', {
            class: 'hint',
            text: def.placement.kind === 'paint'
              ? 'Touchez et glissez pour tracer. ✕ pour terminer.'
              : 'Touchez le sol pour poser le bâtiment.',
          }),
        ]),
        def.placement.kind === 'paint' ? cancel : rotate,
        def.placement.kind === 'paint' ? el('span') : cancel,
      );
    }
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
      el('span', { text: n.icon }),
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
    this.renderSheetContents(id);
  }

  closeSheet(): void {
    this.sheet.classList.remove('open');
  }

  private renderSheetContents(id: SheetId | null = this.api.openSheetId): void {
    if (!id) return;
    clear(this.sheetHead);
    const { title, sub } = sheetTitle(id, this.api);
    const close = el('button', { class: 'sheet-close', text: '✕', 'aria-label': 'Fermer' });
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
  }

  get tierLabel(): string {
    return TIER_NAMES[this.api.world.stats.tier] ?? 'Village';
  }
}
