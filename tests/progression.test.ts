import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/sim/simulation';
import { ALL_RESEARCH_IDS } from '../src/data/research';
import { taxHappiness, taxIncome } from '../src/sim/economy';
import { maxLevelOf, storageCapacity, upgradeTargetOf } from '../src/sim/levels';
import { computeModifiers } from '../src/sim/modifiers';
import { outputRates, recordOutput, updateOutputMeters } from '../src/sim/output';
import { researchSpeed } from '../src/sim/research';
import type { World } from '../src/sim/world';

function study(w: World, ...ids: string[]): void {
  for (const id of ids) w.research.completed.add(id as (typeof ALL_RESEARCH_IDS)[number]);
  w.modifiers = computeModifiers(w.research.completed);
}

/**
 * Everything the player can reach used to be reachable from turn one: the tax
 * slider was already there, and every building could be improved to III
 * without a single study. These pin the three gates that changed that.
 */
describe('what the tree holds back', () => {
  it('collects no tax at all before the register is studied', () => {
    const sim = createNewGame({ seed: 'tax' });
    const w = sim.world;

    expect(w.taxRate).toBe(0);
    expect(taxIncome(w)).toBe(0);
    // And no mood swing either: a village that is not taxed is not grateful
    // about it, it simply has nothing to feel.
    expect(taxHappiness(w)).toBe(0);

    study(w, 'r_taxation');
    w.taxRate = 0.5;
    expect(taxIncome(w)).toBeGreaterThan(0);
  });

  it('refuses a second level until the builders have been studied', () => {
    const sim = createNewGame({ seed: 'levels' });
    const w = sim.world;
    const hall = w.buildingList.find((b) => b.def === 'town_hall')!;

    expect(maxLevelOf('town_hall', w.modifiers.buildingLevel)).toBe(1);
    expect(upgradeTargetOf(hall, w.modifiers.buildingLevel)).toBeNull();
    expect(w.canUpgrade(hall).reason).toBe('Étude manquante');

    study(w, 'r_master_builders');
    expect(upgradeTargetOf(hall, w.modifiers.buildingLevel)?.toLevel).toBe(2);

    // II is as far as it goes until the great works are studied in turn.
    hall.level = 2;
    expect(upgradeTargetOf(hall, w.modifiers.buildingLevel)).toBeNull();
    study(w, 'r_grand_works');
    expect(upgradeTargetOf(hall, w.modifiers.buildingLevel)?.toLevel).toBe(3);
  });

  it('keeps the town hall at two hundred places whatever its level', () => {
    const sim = createNewGame({ seed: 'hall' });
    const w = sim.world;
    const hall = w.buildingList.find((b) => b.def === 'town_hall')!;

    expect(storageCapacity(hall)).toBe(200);
    // The hall is a helping hand for the opening hour, not a warehouse that
    // grows with the village: improving it must not buy storage.
    hall.level = 3;
    expect(storageCapacity(hall)).toBe(200);
  });

  it('studies nothing while the university stands empty', () => {
    const sim = createNewGame({ seed: 'scholars' });
    const w = sim.world;
    study(w, ...ALL_RESEARCH_IDS);
    w.treasury = 20000;

    let hall = null;
    for (let r = 3; r < 60 && !hall; r++) {
      for (let a = 0; a < 48; a++) {
        const x = Math.round(w.startX + Math.cos((a / 48) * Math.PI * 2) * r);
        const y = Math.round(w.startY + Math.sin((a / 48) * Math.PI * 2) * r);
        if (!w.canPlace('university', x, y).ok) continue;
        hall = w.place('university', x, y, 0, true);
        if (hall) break;
      }
    }
    expect(hall).toBeTruthy();

    hall!.workers = [];
    expect(researchSpeed(w)).toBe(0);

    const scholar = w.villagers[0];
    w.assignWorker(hall!.id);
    // Either the assignment took, or nobody was free — in which case the
    // point still stands: no scholar, no study.
    if (hall!.workers.length === 0) expect(researchSpeed(w)).toBe(0);
    else expect(researchSpeed(w)).toBeGreaterThan(0);
    expect(scholar).toBeTruthy();
  });
});

/**
 * "Ma scierie suit-elle mes bûcherons ?" is not answerable from the recipe: a
 * camp whose trees are far away spends its day walking. So the rate shown is
 * measured, and this pins what measuring means.
 */
describe('the output meter', () => {
  it('turns what a building actually made into units per minute', () => {
    const sim = createNewGame({ seed: 'meter' });
    const w = sim.world;
    const b = w.buildingList[0];

    // Nothing measured yet: the panel says so rather than claiming zero.
    expect(b.output.measured).toBe(false);
    expect(outputRates(b)).toEqual([]);

    recordOutput(b, 'logs', 15);
    updateOutputMeters(w, 30);

    expect(b.output.measured).toBe(true);
    expect(outputRates(b)[0]).toEqual({ good: 'logs', perMinute: 30 });

    // A building that stops decays towards zero instead of keeping its last
    // good figure for ever.
    updateOutputMeters(w, 30);
    expect(outputRates(b)[0].perMinute).toBe(15);
    for (let i = 0; i < 12; i++) updateOutputMeters(w, 30);
    expect(outputRates(b)).toEqual([]);
  });
});
