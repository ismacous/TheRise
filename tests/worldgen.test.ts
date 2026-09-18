import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/sim/worldgen';
import { TERRAIN } from '../src/sim/types';

describe('worldgen shape', () => {
  it('keeps water, forest and buildable land in a playable band', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'the-rise', 'vallee-1', 'vallee-2', 'vallee-3']) {
      const { map, nodes, startX, startY } = generateWorld({ seed });
      const total = map.width * map.height;
      let water = 0;
      let forest = 0;
      let grass = 0;
      let rock = 0;
      for (let i = 0; i < total; i++) {
        const t = map.terrain[i];
        if (t === TERRAIN.WATER) water++;
        else if (t === TERRAIN.FOREST) forest++;
        else if (t === TERRAIN.GRASS) grass++;
        else if (t === TERRAIN.ROCK) rock++;
      }
      const trees = nodes.filter((n) => n.kind === 'tree').length;
      const ores = nodes.filter((n) => n.kind === 'iron_vein' || n.kind === 'coal_vein').length;
      // Fishing and the shoreside workshops should be reachable from the start.
      const shore = map.touchesWater(startX - 20, startY - 20, 40, 40);
      console.log(
        `${seed}: water ${(water / total * 100).toFixed(0)}% forest ${(forest / total * 100).toFixed(0)}% ` +
        `grass ${(grass / total * 100).toFixed(0)}% rock ${(rock / total * 100).toFixed(0)}% ` +
        `trees ${trees} ore ${ores} waterNearStart=${shore}`,
      );
      expect(water / total).toBeGreaterThan(0.02);
      expect(water / total).toBeLessThan(0.35);
      expect(grass / total).toBeGreaterThan(0.1);
      expect(trees).toBeGreaterThan(2000);
      expect(ores).toBeGreaterThan(20);
      const gold = nodes.filter((n) => n.kind === 'gold_vein').length;
      expect(gold).toBeGreaterThan(0);
      expect(shore, `${seed} has no water near the start`).toBe(true);
    }
  }, 60000);
});
