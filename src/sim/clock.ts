/**
 * Time constants, alone in their own module.
 *
 * They live here rather than in `world.ts` because the history recorder needs
 * the day length to size its sampling window, and importing it from the world
 * closed a cycle: `world` imports `history`, `history` imported `world`, and
 * `DAY_SECONDS` was still undefined when the sampling interval was computed.
 * The result was a NaN timer that recorded a sample on every single tick.
 */

/** Twelve real minutes per in-game day at normal speed. */
export const DAY_SECONDS = 720;
export const DAYS_PER_SEASON = 3;

/** Start and end of daylight, as a fraction of the day: 70 % day, 30 % night. */
export const DAWN = 0.15;
export const DUSK = 0.85;
