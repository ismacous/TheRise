import type { ProfessionId } from '../data/professions';
import { RESEARCH, type ResearchId } from '../data/research';

export interface Modifiers {
  workSpeed: number;
  workSpeedBy: Partial<Record<ProfessionId, number>>;
  gatherYield: number;
  gatherYieldBy: Partial<Record<ProfessionId, number>>;
  craftYield: number;
  moveSpeed: number;
  carryCapacity: number;
  happiness: number;
  foodUpkeep: number;
  tradeTier: number;
  depositRichness: number;
  researchRate: number;
  fireRisk: number;
  diseaseResist: number;
  buildSpeed: number;
  storage: number;
}

export function emptyModifiers(): Modifiers {
  return {
    workSpeed: 1,
    workSpeedBy: {},
    gatherYield: 1,
    gatherYieldBy: {},
    craftYield: 1,
    moveSpeed: 1,
    carryCapacity: 1,
    happiness: 0,
    foodUpkeep: 1,
    tradeTier: 0,
    depositRichness: 1,
    researchRate: 1,
    fireRisk: 1,
    diseaseResist: 1,
    buildSpeed: 1,
    storage: 1,
  };
}

/** Folds every completed research into a single modifier bundle. */
export function computeModifiers(completed: Iterable<ResearchId>): Modifiers {
  const m = emptyModifiers();
  for (const id of completed) {
    const def = RESEARCH[id];
    if (!def) continue;
    for (const e of def.effects) {
      switch (e.kind) {
        case 'work_speed':
          if (e.profession) {
            m.workSpeedBy[e.profession] = (m.workSpeedBy[e.profession] ?? 1) * e.mul;
          } else m.workSpeed *= e.mul;
          break;
        case 'gather_yield':
          if (e.profession) {
            m.gatherYieldBy[e.profession] = (m.gatherYieldBy[e.profession] ?? 1) * e.mul;
          } else m.gatherYield *= e.mul;
          break;
        case 'craft_yield':
          m.craftYield *= e.mul;
          break;
        case 'move_speed':
          m.moveSpeed *= e.mul;
          break;
        case 'carry_capacity':
          m.carryCapacity *= e.mul;
          break;
        case 'happiness':
          m.happiness += e.add;
          break;
        case 'food_upkeep':
          m.foodUpkeep *= e.mul;
          break;
        case 'trade_tier':
          m.tradeTier = Math.max(m.tradeTier, e.value);
          break;
        case 'deposit_richness':
          m.depositRichness *= e.mul;
          break;
        case 'research_rate':
          m.researchRate *= e.mul;
          break;
        case 'fire_risk':
          m.fireRisk *= e.mul;
          break;
        case 'disease_resist':
          m.diseaseResist *= e.mul;
          break;
        case 'build_speed':
          m.buildSpeed *= e.mul;
          break;
        case 'storage':
          m.storage *= e.mul;
          break;
      }
    }
  }
  return m;
}

export function workSpeedFor(m: Modifiers, p: ProfessionId): number {
  return m.workSpeed * (m.workSpeedBy[p] ?? 1);
}

export function gatherYieldFor(m: Modifiers, p: ProfessionId): number {
  return m.gatherYield * (m.gatherYieldBy[p] ?? 1);
}
