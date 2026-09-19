import { DAY_SECONDS } from './clock';
import type { World } from './world';

/**
 * Where a coin came from, or went. Every movement of the treasury is tagged so
 * the economy page can answer the only question that matters — "why am I
 * losing money?" — instead of showing a bare balance.
 */
export type LedgerSource =
  | 'tax'
  | 'trade'
  | 'tavern'
  | 'gift'
  | 'build'
  | 'upgrade'
  | 'research'
  | 'purchase';

export const INCOME_SOURCES: LedgerSource[] = ['tax', 'trade', 'tavern', 'gift'];
export const EXPENSE_SOURCES: LedgerSource[] = ['build', 'upgrade', 'research', 'purchase'];

export const LEDGER_LABELS: Record<LedgerSource, string> = {
  tax: 'Impôts',
  trade: 'Ventes',
  tavern: 'Taverne',
  gift: 'Dons et trouvailles',
  build: 'Constructions',
  upgrade: 'Améliorations',
  research: 'Études',
  purchase: 'Achats',
};

/** Colours the curves and the breakdown legend share. */
export const LEDGER_COLORS: Record<LedgerSource, string> = {
  tax: '#d9b45f',
  trade: '#6fb0d4',
  tavern: '#e8a94a',
  gift: '#7fc06a',
  build: '#c2724f',
  upgrade: '#a0729c',
  research: '#6f8fae',
  purchase: '#e0705c',
};

export type Ledger = Record<LedgerSource, number>;

export function emptyLedger(): Ledger {
  return { tax: 0, trade: 0, tavern: 0, gift: 0, build: 0, upgrade: 0, research: 0, purchase: 0 };
}

/**
 * One point on every curve. Recorded twice a game day, which is what the
 * player can meaningfully act on: finer than that and the graph shows the
 * day/night work cycle rather than the trend.
 */
export interface HistorySample {
  /** Fractional day at the moment of the sample. */
  day: number;
  population: number;
  happiness: number;
  treasury: number;
  /** Coins per day, averaged over the slice this sample closes. */
  income: number;
  expense: number;
  foodDays: number;
  housing: number;
  employed: number;
}

/** Seconds of simulated time between two samples. */
export const SAMPLE_SECONDS = DAY_SECONDS / 2;
/** Samples kept. Forty-eight half-days is exactly one in-game year. */
export const HISTORY_LENGTH = 48;

/**
 * Rolling economic memory of the village. It lives in the simulation — the
 * renderer only reads it — so the headless tests can assert on it too.
 */
export class History {
  samples: HistorySample[] = [];
  /** Coins by source since the founding. */
  total: Ledger = emptyLedger();
  /** Coins by source inside the slice currently being filled. */
  slice: Ledger = emptyLedger();
  private timer = SAMPLE_SECONDS;

  record(source: LedgerSource, amount: number): void {
    if (!(amount > 0)) return;
    this.total[source] += amount;
    this.slice[source] += amount;
  }

  /**
   * Coins per day the still-open slice is running at. A slice that has only
   * just opened has nothing to average, so it reports the sample it closed
   * rather than a misleading zero.
   */
  private liveRate(sources: LedgerSource[], fallback: number): number {
    const elapsed = SAMPLE_SECONDS - this.timer;
    if (elapsed < SAMPLE_SECONDS * 0.15) return fallback;
    let sum = 0;
    for (const s of sources) sum += this.slice[s];
    return (sum / Math.max(1, elapsed)) * DAY_SECONDS;
  }

  liveIncome(): number {
    return this.liveRate(INCOME_SOURCES, this.samples[this.samples.length - 1]?.income ?? 0);
  }

  liveExpense(): number {
    return this.liveRate(EXPENSE_SOURCES, this.samples[this.samples.length - 1]?.expense ?? 0);
  }

  update(world: World, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer += SAMPLE_SECONDS;
    this.push(world);
  }

  /** Closes the current slice and starts a new one. */
  push(world: World): void {
    const s = world.stats;
    let income = 0;
    let expense = 0;
    for (const k of INCOME_SOURCES) income += this.slice[k];
    for (const k of EXPENSE_SOURCES) expense += this.slice[k];
    const perDay = DAY_SECONDS / SAMPLE_SECONDS;
    this.samples.push({
      day: world.time.day + world.time.dayFraction,
      population: s.population,
      happiness: s.happiness,
      treasury: world.treasury,
      income: income * perDay,
      expense: expense * perDay,
      foodDays: Math.min(99, s.foodDays),
      housing: s.housingCapacity,
      employed: s.employed,
    });
    while (this.samples.length > HISTORY_LENGTH) this.samples.shift();
    this.slice = emptyLedger();
  }

  /** Net coins per day over the last `count` closed samples. */
  netTrend(count = 6): number {
    const tail = this.samples.slice(-count);
    if (tail.length === 0) return 0;
    let sum = 0;
    for (const s of tail) sum += s.income - s.expense;
    return sum / tail.length;
  }

  toJSON(): { samples: HistorySample[]; total: Ledger; slice: Ledger; timer: number } {
    return { samples: this.samples, total: this.total, slice: this.slice, timer: this.timer };
  }

  static fromJSON(data: ReturnType<History['toJSON']> | undefined): History {
    const h = new History();
    if (!data) return h;
    h.samples = (data.samples ?? []).slice(-HISTORY_LENGTH);
    h.total = { ...emptyLedger(), ...(data.total ?? {}) };
    h.slice = { ...emptyLedger(), ...(data.slice ?? {}) };
    h.timer = typeof data.timer === 'number' ? data.timer : SAMPLE_SECONDS;
    return h;
  }
}
