import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/sim/simulation';
import { STUCK_LIMIT } from '../src/sim/villagers';

describe('unreachable buildings', () => {
  it('refuses a footprint with no way in', () => {
    const sim = createNewGame({ seed: 'access' });
    const w = sim.world;
    // Wall a 1-tile gap in completely and check the placement is rejected.
    const cx = Math.floor(w.startX) + 20;
    const cy = Math.floor(w.startY) + 20;
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        if (i === 0 && j === 0) continue;
        w.map.blocker[w.map.idx(cx + i, cy + j)] = 999999;
      }
    }
    const check = w.canPlace('well', cx, cy);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('accès');
  });

  it('frees a villager whose destination becomes unreachable', () => {
    const sim = createNewGame({ seed: 'trapped' });
    const w = sim.world;
    const v = w.villagers.find((x) => x.profession !== 'child')!;
    expect(v).toBeTruthy();
    v.task = { kind: 'haul', fromId: -1, toId: -1, good: 'logs', phase: 1, amount: 4 };
    v.carrying = 'logs';
    v.carryAmount = 4;
    v.stuckTimer = STUCK_LIMIT + 1;
    for (let i = 0; i < 20; i++) sim.tick(0.1);
    expect(v.carrying).toBeNull();
    expect(v.task.kind).not.toBe('haul');
  });
});
