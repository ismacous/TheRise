import type { GoodId } from '../data/goods';
import { planSupply } from './supply';
import type { Building } from './types';
import type { World } from './world';

/**
 * How much each building actually produces, per minute.
 *
 * The obvious way to answer "how many logs does a woodcutters' camp make?" is
 * to compute it: workers × work rate ÷ the recipe's cost. That number is a
 * lie for anything that gathers. A camp whose trees are forty tiles away
 * spends most of its day walking, and the theoretical figure would tell the
 * player their camp is keeping up with a sawmill it is in fact starving.
 *
 * So this measures instead. Every unit a building turns out is counted, and
 * once a window closes the count becomes a rate — which is exactly the number
 * the player wants when they are trying to work out whether their sawmill can
 * keep up with their woodcutters.
 */

/** Seconds of simulated time per measurement window. */
const WINDOW = 30;

/**
 * Weight of the newest window against the running figure. Low enough that one
 * unlucky window — a worker who stopped to eat — does not make the panel jump,
 * high enough that a camp whose forest has run out shows it within a minute.
 */
const SMOOTHING = 0.5;

export interface OutputMeter {
  /** Units produced since the window opened. */
  tally: Partial<Record<GoodId, number>>;
  /** Units per minute, smoothed. Empty until the first window closes. */
  rate: Partial<Record<GoodId, number>>;
  elapsed: number;
  /** False until a window has closed, so the UI can say "—" rather than "0". */
  measured: boolean;
}

export function emptyMeter(): OutputMeter {
  return { tally: {}, rate: {}, elapsed: 0, measured: false };
}

/** Books `amount` units of `good` against the building that made them. */
export function recordOutput(b: Building, good: GoodId, amount: number): void {
  if (amount <= 0) return;
  b.output.tally[good] = (b.output.tally[good] ?? 0) + amount;
}

/**
 * The once-a-second pass over the buildings: closes any measurement window
 * that is due, and keeps `idleTime` — how long a building has been stopped —
 * up to date.
 *
 * They share a walk because they are both cheap and both per-building, and a
 * second walk of a three-hundred-building city every second is not free.
 */
export function updateBuildingMeters(world: World, dt: number): void {
  // Who needs what, and from where. Once for the village, not once per worker.
  planSupply(world);
  for (const b of world.buildingList) {
    // A workshop pauses constantly in normal running: waiting a moment for a
    // delivery is not a fault. What matters is how long it has been waiting.
    b.idleTime = b.stall ? b.idleTime + dt : 0;

    const m = b.output;
    m.elapsed += dt;
    if (m.elapsed < WINDOW) continue;
    const perMinute = 60 / m.elapsed;
    // Every good the building has ever made has to be visited, not just the
    // ones in this window: a camp that stopped producing must decay to zero
    // rather than keep its last good number for ever.
    const goods = new Set<GoodId>([
      ...(Object.keys(m.tally) as GoodId[]),
      ...(Object.keys(m.rate) as GoodId[]),
    ]);
    for (const g of goods) {
      const sample = (m.tally[g] ?? 0) * perMinute;
      const next = m.measured ? (m.rate[g] ?? 0) * (1 - SMOOTHING) + sample * SMOOTHING : sample;
      if (next < 0.02) delete m.rate[g];
      else m.rate[g] = next;
    }
    m.tally = {};
    m.elapsed = 0;
    m.measured = true;
  }
}

/** Units per minute, highest first. Empty while nothing has been measured. */
export function outputRates(b: Building): Array<{ good: GoodId; perMinute: number }> {
  const out: Array<{ good: GoodId; perMinute: number }> = [];
  for (const [g, rate] of Object.entries(b.output.rate)) {
    out.push({ good: g as GoodId, perMinute: rate as number });
  }
  out.sort((a, b2) => b2.perMinute - a.perMinute);
  return out;
}
