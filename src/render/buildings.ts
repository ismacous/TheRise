import { BufferGeometry, Color } from 'three';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { BuildingState } from '../sim/types';
import { MeshBuilder } from './meshBuilder';
import { BUILDING_COLORS as C } from './palette';

export interface BuildingVisual {
  geometry: BufferGeometry;
  /**
   * Optional spinning part (windmill sails, water wheel, saw blade). The
   * geometry is authored in the XY plane and spins about its local Z; `yaw`
   * and `pitch` orient that plane in the building's local space.
   */
  rotor?: {
    geometry: BufferGeometry;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    speed: number;
  };
  /** Local position of the chimney, for smoke particles. */
  smoke?: { x: number; y: number; z: number };
  /** Local positions where a warm light should glow at night. */
  lights: Array<{ x: number; y: number; z: number; color: Color; intensity: number }>;
  height: number;
}

const cache = new Map<string, BuildingVisual>();

/**
 * Geometry is cached per (type, state, level), so a hundred cottages of the
 * same rank still share one buffer while a level II reads differently from a
 * level I at a glance.
 */
export function buildingVisual(
  defId: BuildingId,
  state: BuildingState,
  level = 1,
  stage = 0,
): BuildingVisual {
  const lv = Math.max(1, Math.min(MAX_VISUAL_LEVEL, Math.round(level)));
  const st = Math.max(0, Math.min(CROP_STAGES - 1, Math.round(stage)));
  const key = `${defId}:${state}:${lv}:${st}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const v = make(defId, state, lv, st);
  cache.set(key, v);
  return v;
}

/** Tilled, sprouting, growing, ripe, harvested. */
export const CROP_STAGES = 5;

/**
 * Where a field is in its cycle, from its progress toward the next harvest.
 * Progress restarts at zero the instant a crop comes in, so zero is stubble,
 * not bare earth.
 */
export function cropStage(progress: number): number {
  const t = Math.max(0, Math.min(0.999, progress));
  if (t < 0.1) return 4;
  if (t < 0.3) return 0;
  if (t < 0.55) return 1;
  if (t < 0.8) return 2;
  return 3;
}

/** Levels beyond this one reuse the top silhouette. */
export const MAX_VISUAL_LEVEL = 3;

function make(defId: BuildingId, state: BuildingState, lv: number, stage = 0): BuildingVisual {
  const def = BUILDINGS[defId];
  const [W, D] = def.size;
  const b = new MeshBuilder();
  const out: BuildingVisual = { geometry: null as never, lights: [], height: 1 };

  if (state === 'planned' || state === 'building') {
    buildScaffold(b, W, D, state === 'building' ? 0.6 : 0.2);
    out.geometry = b.build();
    out.height = 1.2;
    return out;
  }
  if (state === 'ruined') {
    buildRuin(b, W, D, defId);
    out.geometry = b.build();
    out.height = 1.0;
    return out;
  }

  switch (defId) {
    // ── Civic ────────────────────────────────────────────────────────────
    case 'town_hall':
      out.height = buildTownHall(b, W, D, out);
      break;
    case 'university':
      out.height = buildHall(b, W, D, C.wallPlaster, C.roofSlate, out, 1.15 + (lv - 1) * 0.12);
      addTradeSign(b, W, D, C.clothBlue, 'square');
      // An observatory turret, a reading bench and a lectern in the porch.
      b.cylinder(-W / 2 + 0.6, 0, -D / 2 + 0.6, 0.34, 1.9 + lv * 0.3, 8, C.wallPlaster);
      b.cone(-W / 2 + 0.6, 1.9 + lv * 0.3, -D / 2 + 0.6, 0.42, 0.55, 8, C.roofSlate);
      b.boxOn(W / 2 - 0.8, 0, D / 2 + 0.55, 0.9, 0.06, 0.28, C.wallWood);
      for (const sx of [-1, 1]) b.boxOn(W / 2 - 0.8 + sx * 0.34, 0, D / 2 + 0.55, 0.07, 0.3, 0.24, C.beam);
      break;

    // ── Housing ──────────────────────────────────────────────────────────
    case 'shack':
      out.height = buildHut(b, W, D, C.wallWoodDark, C.roofThatch, out, 1.0, true);
      // Patched-up poverty: a woodpile, a bucket, a wonky washing line.
      addLogPile(b, -W / 2 + 0.5, 0, D / 2 - 0.5);
      b.cylinder(W / 2 - 0.45, 0, D / 2 - 0.4, 0.13, 0.22, 7, C.wallWoodDark, 0.88);
      break;
    case 'cottage':
      out.height = buildHut(b, W, D, C.wallPlaster, C.roofThatch, out, 1.0, false);
      addChimney(b, out, W / 2 - 0.45, -D / 2 + 0.45, 0.6 + lv * 0.12, C.wallBrick);
      addFlowerBed(b, 0, D / 2 + 0.42, 1);
      if (lv >= 2) addBarrels(b, -W / 2 + 0.5, D / 2 - 0.5);
      break;
    case 'house':
      out.height = buildTwoStorey(b, W, D, C.wallStone, C.wallPlaster, C.roofTile, out);
      addChimney(b, out, W / 2 - 0.5, -D / 2 + 0.5, 0.9 + lv * 0.15, C.wallBrick);
      addFlowerBed(b, -W / 2 + 0.7, D / 2 + 0.45, 2);
      // A shuttered dormer breaks the roofline of a plain two-storey.
      b.boxOn(0, 2.0, D / 2 - 0.55, 0.5, 0.36, 0.4, C.wallPlaster);
      b.gableRoof(0, 2.36, D / 2 - 0.55, 0.5, 0.42, 0.22, C.roofTile, 0, 0.08);
      break;
    case 'manor':
      out.height = buildManor(b, W, D, out);
      addChimney(b, out, -W / 2 + 0.8, -D / 2 + 0.6, 1.3, C.wallBrick);
      addChimney(b, out, W / 2 - 0.8, -D / 2 + 0.6, 1.3, C.wallBrick);
      addFlowerBed(b, -0.8, D / 2 + 0.7, 0);
      addFlowerBed(b, 0.8, D / 2 + 0.7, 2);
      break;

    // ── Storage ──────────────────────────────────────────────────────────
    case 'storehouse':
      out.height = buildBarn(b, W, D, C.wallWood, C.roofThatch, out);
      addDepotGoods(b, -W / 2 + 0.7, D / 2 + 0.5, lv);
      addTradeSign(b, W, D, C.wallWoodDark, 'square');
      break;
    case 'warehouse':
      out.height = buildBarn(b, W, D, C.wallStone, C.roofSlate, out);
      addDepotGoods(b, -W / 2 + 0.8, D / 2 + 0.55, lv + 1);
      addCart(b, W / 2 - 0.9, D / 2 + 0.7);
      // A loading gantry with a pulley: this one moves goods, it does not
      // merely hold them.
      b.box(0, 2.1, D / 2 + 0.5, 0.14, 0.14, 1.3, C.beam);
      b.cylinder(0, 1.85, D / 2 + 1.0, 0.11, 0.1, 8, C.metal);
      b.box(0, 1.5, D / 2 + 1.0, 0.03, 0.6, 0.03, C.metal);
      if (lv >= 2) addCart(b, -W / 2 + 1.1, D / 2 + 0.9);
      break;
    case 'granary':
      out.height = buildGranary(b, W, D, out);
      addSacks(b, W / 2 - 0.6, D / 2 + 0.45, new Color('#cbbb8e').convertSRGBToLinear());
      addTradeSign(b, W, D, C.crop, 'tall');
      break;

    // ── Gathering ────────────────────────────────────────────────────────
    case 'woodcutter_camp':
      out.height = buildOpenCamp(b, W, D, C.wallWood, C.roofThatch, out);
      addLogPile(b, W / 2 - 0.6, 0, yardZ(D));
      // A chopping block with the axe still in it: the camp's whole trade.
      addChoppingBlock(b, -W / 2 + 0.6, yardZ(D));
      if (lv >= 2) addLogPile(b, 0, 0, yardZ(D) + 0.1);
      break;
    case 'lumber_camp':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out);
      addLogPile(b, -W / 2 + 0.7, 0, yardZ(D));
      addLogPile(b, W / 2 - 0.7, 0, yardZ(D));
      addChoppingBlock(b, 0, yardZ(D));
      addTradeSign(b, W, D, C.beam, 'wedge', workshopFront(D) + 0.06);
      break;
    case 'forester_hut':
      out.height = buildHut(b, W, D, C.wallWood, C.roofThatch, out, 0.8, false);
      addSaplings(b, W, D);
      // A nursery frame of seedlings in pots, and a watering barrel.
      addSeedlingFrame(b, -W / 2 + 0.7, -D / 2 + 0.7, lv);
      b.cylinder(W / 2 - 0.45, 0, D / 2 - 0.45, 0.16, 0.3, 8, C.wallWoodDark, 0.9);
      break;
    case 'gatherer_hut':
      out.height = buildOpenCamp(b, W, D, C.wallWood, C.roofThatch, out);
      // Baskets of berries, not an anonymous blob.
      addBaskets(b, W / 2 - 0.55, yardZ(D), lv);
      addFlowerBed(b, -W / 2 + 0.7, yardZ(D), 1);
      break;
    case 'hunter_camp':
      out.height = buildOpenCamp(b, W, D, C.wallWoodDark, C.roofThatch, out);
      addDryingRack(b, -W / 2 + 0.6, yardZ(D));
      // The tent and the camp fire, the two things that say "hunters" instantly.
      addTent(b, W / 2 - 0.6, yardZ(D), 0.95);
      addCampfire(b, out, 0, yardZ(D), 1);
      addCookPot(b, 0, yardZ(D));
      if (lv >= 2) addTent(b, W / 2 - 0.6, yardZ(D) - 0.7, 0.75, C.frame);
      break;
    case 'hunting_lodge':
      out.height = buildWorkshop(b, W, D, C.wallWoodDark, C.roofThatch, out);
      addDryingRack(b, -W / 2 + 0.7, yardZ(D));
      addTent(b, W / 2 - 0.7, yardZ(D), 1.0);
      addCampfire(b, out, 0, yardZ(D), 1.05);
      addAntlerTrophy(b, 0, yardZ(D) - 0.36, 1.35);
      break;
    case 'fisher_hut':
      out.height = buildPier(b, W, D, 0.8, out);
      addFishLine(b, -W / 2 + 0.7, -D * 0.05);
      b.cylinder(W / 2 - 0.5, 0, -D * 0.05, 0.16, 0.3, 8, C.wallWoodDark, 0.92);
      break;
    case 'fishing_pier':
      out.height = buildPier(b, W, D, 1.0, out);
      addNets(b, W, D);
      addFishLine(b, -W / 2 + 0.8, -D * 0.05);
      addBaskets(b, W / 2 - 0.6, -D * 0.05, 1);
      break;
    case 'fishing_dock':
      out.height = buildPier(b, W, D, 1.15, out);
      addNets(b, W, D);
      addBoat(b, W / 2 - 0.2, D / 2 - 0.6, 0.9);
      addFishLine(b, -W / 2 + 0.8, -D * 0.08);
      addBaskets(b, W / 2 - 0.7, -D * 0.08, 2);
      addTradeSign(b, W, D, C.clothBlue, 'wedge');
      break;
    case 'fishing_harbour':
      out.height = buildPier(b, W, D, 1.35, out);
      addNets(b, W, D);
      addBoat(b, W / 2 - 0.3, D / 2 - 0.8, 1.35);
      addBoat(b, -W / 2 + 0.6, D / 2 - 0.7, 1.15);
      addFishLine(b, -W / 2 + 0.9, -D * 0.1);
      addBaskets(b, W / 2 - 0.8, -D * 0.1, 3);
      // A harbour lamp on the quay, lit at night.
      b.cylinder(0, -0.02, D * 0.48, 0.06, 1.25, 6, C.beam);
      b.box(0, 1.35, D * 0.48, 0.2, 0.22, 0.2, C.metal);
      out.lights.push({ x: 0, y: 1.35, z: D * 0.48, color: new Color('#ffcf7a'), intensity: 1.3 });
      break;

    // ── Extraction ───────────────────────────────────────────────────────
    case 'quarry':
      out.height = buildQuarry(b, W, D, out);
      addStoneBlocks(b, -W / 2 + 0.7, D / 2 - 0.7, 1);
      break;
    case 'great_quarry':
      out.height = buildQuarry(b, W, D, out);
      addStoneBlocks(b, -W / 2 + 0.8, D / 2 - 0.8, 3);
      // A second, taller crane and a masons' lodge: this is an industry now.
      b.cylinder(W / 2 - 0.5, 0, D / 2 - 1.4, 0.1, 2.1, 5, C.beam);
      b.box(W / 2 - 1.0, 2.05, D / 2 - 1.4, 1.2, 0.11, 0.11, C.beam, 0, 0, -0.22);
      addGrindstone(b, -W / 2 + 0.7, -D / 2 + 0.8);
      break;
    case 'clay_pit':
      out.height = buildPit(b, W, D, new Color('#b0713f').convertSRGBToLinear(), out);
      // Wet clay in moulds, drying in rows: the pit's actual output.
      for (let i = 0; i < 4; i++) {
        b.boxOn(-W / 2 + 0.7 + i * 0.3, 0.02, D / 2 - 0.6, 0.24, 0.1, 0.44, new Color('#8f5a33').convertSRGBToLinear());
      }
      b.cylinder(W / 2 - 0.5, 0, D / 2 - 0.5, 0.2, 0.26, 8, new Color('#a8683c').convertSRGBToLinear());
      break;
    case 'coal_mine':
      out.height = buildMine(b, W, D, new Color('#3a3d43').convertSRGBToLinear(), out);
      addCharcoalHeap(b, -W / 2 + 0.7, D / 2 - 0.7);
      break;
    case 'iron_mine':
      out.height = buildMine(b, W, D, new Color('#8a5e42').convertSRGBToLinear(), out);
      // Raw ore sorted into a heap, rust-red so it reads apart from coal.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.blob(-W / 2 + 0.8 + Math.cos(a) * 0.2, 0.1, D / 2 - 0.8 + Math.sin(a) * 0.2, 0.14, 0.11, 0.14, new Color('#8a5e42').convertSRGBToLinear());
      }
      break;
    case 'gold_mine':
      out.height = buildMine(b, W, D, C.gold, out);
      // A sluice and a guarded strongbox: gold is never left lying about.
      b.boxOn(-W / 2 + 0.9, 0.24, D / 2 - 0.8, 1.0, 0.07, 0.34, C.wallWood, 0.12);
      for (const sx of [-1, 1]) b.boxOn(-W / 2 + 0.9 + sx * 0.4, 0, D / 2 - 0.8, 0.07, 0.26, 0.07, C.beam);
      b.boxOn(W / 2 - 0.6, 0, D / 2 - 0.6, 0.38, 0.3, 0.3, C.wallWoodDark);
      b.box(W / 2 - 0.6, 0.31, D / 2 - 0.6, 0.4, 0.06, 0.32, C.gold);
      break;
    case 'deep_mine':
      out.height = buildMine(b, W, D, new Color('#3a3d43').convertSRGBToLinear(), out);
      addHeadframe(b, 0, 0);
      addCharcoalHeap(b, -W / 2 + 0.8, D / 2 - 0.8);
      addWinchHouse(b, out, W / 2 - 0.8, -D / 2 + 0.8);
      break;

    // ── Farming ──────────────────────────────────────────────────────────
    case 'wheat_field':
      out.height = buildField(b, W, D, C.crop, out, stage, lv);
      break;
    case 'flax_field':
      out.height = buildField(b, W, D, new Color('#93b089').convertSRGBToLinear(), out, stage, lv);
      break;
    case 'chicken_coop':
      out.height = buildPasture(b, W, D, 'chicken', out, lv);
      // A raised henhouse with a ramp, and a feed trough.
      b.boxOn(W / 2 - 0.9, 0.3, -D / 2 + 0.8, 0.7, 0.5, 0.6, C.wallWoodDark);
      b.gableRoof(W / 2 - 0.9, 0.8, -D / 2 + 0.8, 0.7, 0.6, 0.28, C.roofThatch, 0, 0.1);
      b.box(W / 2 - 0.9, 0.16, -D / 2 + 1.25, 0.28, 0.05, 0.6, C.wallWood, 0, -0.5, 0);
      addTrough(b, 0, D / 2 - 0.8);
      break;
    case 'sheep_pasture':
      out.height = buildPasture(b, W, D, 'sheep', out, lv);
      addTrough(b, 0, D / 2 - 0.8);
      // Shears and a fleece on a rack: this is a wool pen, not a meat one.
      addDryingRack(b, -W / 2 + 0.9, D / 2 - 0.9);
      break;
    case 'cattle_pasture':
      out.height = buildPasture(b, W, D, 'cattle', out, lv);
      addTrough(b, 0, D / 2 - 0.9);
      // Hay: a stook by the shelter, and a cart to move it.
      b.cone(-W / 2 + 1.0, 0, D / 2 - 1.0, 0.44, 0.85, 7, C.crop);
      addCart(b, W / 2 - 1.0, D / 2 - 1.0);
      break;

    // ── Industry & crafting ──────────────────────────────────────────────
    case 'sawmill':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out, lv);
      addSawBlade(b, out, W, D);
      addLogPile(b, -W / 2 + 0.7, 0, -D / 2 + 0.7);
      // Logs go in, boards come out: show both, plus the trestle between them.
      addSawhorse(b, -W / 2 + 0.75, yardZ(D));
      addPlankStack(b, W / 2 - 0.75, yardZ(D), 4 + lv);
      addTradeSign(b, W, D, C.wallWood, 'wedge', workshopFront(D) + 0.06);
      break;
    case 'water_sawmill':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofSlate, out, lv);
      addWaterWheel(b, out, W, D);
      addSawhorse(b, -W / 2 + 0.75, yardZ(D));
      addPlankStack(b, 0, yardZ(D) + 0.06, 5 + lv, 0.4);
      addPlankStack(b, W / 2 - 0.75, yardZ(D), 4 + lv);
      addTradeSign(b, W, D, C.clothBlue, 'wedge');
      break;
    case 'charcoal_burner':
      out.height = buildKiln(b, W, D, out, new Color('#4b4642').convertSRGBToLinear());
      addCharcoalHeap(b, -W / 2 + 0.7, D / 2 - 0.7);
      addLogPile(b, W / 2 - 0.7, 0, D / 2 - 0.7);
      break;
    case 'brick_kiln':
      out.height = buildKiln(b, W, D, out, C.wallBrick);
      // Green bricks drying in rows before they meet the fire.
      for (let i = 0; i < 3; i++) {
        addPlankStack(b, -W / 2 + 0.8, D / 2 - 0.8 + i * 0.1, 3, 0.1);
      }
      b.boxOn(W / 2 - 0.7, 0, D / 2 - 0.7, 0.5, 0.3, 0.42, C.wallBrick, 0.2);
      break;
    case 'smelter':
      out.height = buildWorkshop(b, W, D, C.wallStone, C.roofSlate, out, lv);
      addChimney(b, out, W / 2 - 0.6, D / 2 - 0.6, 1.6 + (lv - 1) * 0.3, C.wallStoneDark);
      addForge(b, out, -W / 2 + 0.7, yardZ(D));
      addCharcoalHeap(b, W / 2 - 0.7, yardZ(D));
      // Fresh ingots stacked in the yard.
      b.boxOn(0, 0, yardZ(D), 0.4, 0.09, 0.22, C.metal);
      b.boxOn(0, 0.09, yardZ(D), 0.34, 0.09, 0.18, C.metal, 0.2);
      addTradeSign(b, W, D, C.wallStoneDark, 'wedge', workshopFront(D) + 0.06);
      break;
    case 'blacksmith':
      out.height = buildWorkshop(b, W, D, C.wallStone, C.roofTile, out, lv);
      addChimney(b, out, W / 2 - 0.5, -D / 2 + 0.5, 1.2 + (lv - 1) * 0.25, C.wallStoneDark);
      addAnvil(b, 0, yardZ(D));
      addForge(b, out, W / 2 - 0.7, yardZ(D));
      addQuenchTub(b, -W / 2 + 0.6, yardZ(D));
      addTradeSign(b, W, D, C.metal, 'cross', workshopFront(D) + 0.06);
      break;
    case 'goldsmith':
      out.height = buildWorkshop(b, W, D, C.wallBrick, C.roofTile, out, lv);
      addChimney(b, out, W / 2 - 0.4, -D / 2 + 0.4, 0.9, C.wallBrick);
      // A barred window and a small crucible bench: precious work, kept safe.
      addWorkbench(b, -W / 2 + 0.65, yardZ(D));
      b.cylinder(-W / 2 + 0.65, 0.5, yardZ(D), 0.09, 0.14, 7, C.gold, 0.8);
      for (let i = -1; i <= 1; i++) b.box(i * 0.14, 0.72, yardZ(D) - 0.42, 0.03, 0.3, 0.03, C.metal);
      addTradeSign(b, W, D, C.gold, 'round', workshopFront(D) + 0.06);
      break;
    case 'butcher':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out, lv);
      addDryingRack(b, -W / 2 + 0.55, yardZ(D));
      // A block, a cleaver and a hanging carcass.
      addChoppingBlock(b, W / 2 - 0.6, yardZ(D));
      b.box(0, 1.05, yardZ(D) - 0.16, 0.9, 0.05, 0.05, C.beam);
      for (const sx of [-1, 1]) {
        b.blob(sx * 0.26, 0.82, yardZ(D) - 0.16, 0.11, 0.2, 0.09, new Color('#9c4a3a').convertSRGBToLinear());
      }
      addTradeSign(b, W, D, C.clothRed, 'round', workshopFront(D) + 0.06);
      break;
    case 'smokehouse':
      out.height = buildKiln(b, W, D, out, C.wallWoodDark);
      addFishLine(b, -W / 2 + 0.65, D / 2 - 0.45);
      addLogPile(b, W / 2 - 0.65, 0, D / 2 - 0.45);
      break;
    case 'windmill':
      out.height = buildWindmill(b, W, D, out, lv);
      addSacks(b, -W / 2 + 0.7, D / 2 - 0.6, new Color('#cbbb8e').convertSRGBToLinear());
      addGrindstone(b, W / 2 - 0.7, D / 2 - 0.6);
      break;
    case 'bakery':
      out.height = buildWorkshop(b, W, D, C.wallPlaster, C.roofTile, out, lv);
      addChimney(b, out, W / 2 - 0.4, D / 2 - 0.4, 1.0 + (lv - 1) * 0.2, C.wallBrick);
      addOven(b, out, -W / 2 + 0.7, yardZ(D));
      addSacks(b, W / 2 - 0.75, yardZ(D), new Color('#e3d7b4').convertSRGBToLinear());
      addTradeSign(b, W, D, C.crop, 'round', workshopFront(D) + 0.06);
      break;
    case 'brewery':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out, lv);
      addBarrels(b, -W / 2 + 0.6, yardZ(D));
      // A copper mash tun with a steaming lid.
      b.cylinder(W / 2 - 0.7, 0, yardZ(D), 0.3, 0.55, 9, new Color('#b07a3c').convertSRGBToLinear(), 0.92);
      b.cylinder(W / 2 - 0.7, 0.55, yardZ(D), 0.26, 0.07, 9, C.metal);
      out.smoke = { x: W / 2 - 0.7, y: 0.75, z: yardZ(D) };
      if (lv >= 2) addBarrels(b, 0, yardZ(D) + 0.12);
      addTradeSign(b, W, D, new Color('#c08830').convertSRGBToLinear(), 'square', workshopFront(D) + 0.06);
      break;
    case 'weaver':
      out.height = buildWorkshop(b, W, D, C.wallPlaster, C.roofThatch, out, lv);
      addClothLine(b, W, D);
      addLoom(b, -W / 2 + 0.75, yardZ(D) - 0.2);
      // Fleeces waiting to be spun.
      for (let i = 0; i < 3; i++) {
        b.blob(W / 2 - 0.65, 0.16 + i * 0.2, yardZ(D), 0.19, 0.13, 0.19, new Color('#e2ddd3').convertSRGBToLinear());
      }
      addTradeSign(b, W, D, C.cloth, 'square', workshopFront(D) + 0.06);
      break;
    case 'tailor':
      out.height = buildWorkshop(b, W, D, C.wallPlaster, C.roofThatch, out, lv);
      addClothLine(b, W, D);
      // A cutting table with bolts of cloth and a dress form.
      addWorkbench(b, -W / 2 + 0.75, yardZ(D));
      for (let i = 0; i < 3; i++) {
        b.bar(-W / 2 + 0.75, 0.54 + i * 0.08, yardZ(D), 0.05, 0.6, 6, [C.clothRed, C.clothBlue, C.cloth][i], 'x');
      }
      b.cylinder(W / 2 - 0.55, 0, yardZ(D), 0.05, 0.6, 5, C.beam);
      b.blob(W / 2 - 0.55, 0.78, yardZ(D), 0.16, 0.24, 0.13, C.clothBlue);
      addTradeSign(b, W, D, C.clothBlue, 'tall', workshopFront(D) + 0.06);
      break;
    case 'tannery':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out, lv);
      addVats(b, W, D);
      // Hides stretched on frames, the trade's real signature.
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 - 0.5);
        for (const sz of [-1, 1]) b.boxOn(x + sz * 0.28, 0, yardZ(D), 0.05, 0.85, 0.05, C.beam);
        b.box(x, 0.5, yardZ(D), 0.55, 0.62, 0.03, new Color('#96714a').convertSRGBToLinear());
      }
      addTradeSign(b, W, D, new Color('#7c5230').convertSRGBToLinear(), 'square', workshopFront(D) + 0.06);
      break;
    case 'cobbler':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out, lv);
      addWorkbench(b, -W / 2 + 0.7, yardZ(D));
      // A last on the bench and a rack of finished boots.
      b.blob(-W / 2 + 0.7, 0.54, yardZ(D), 0.07, 0.06, 0.15, C.beam);
      for (let i = 0; i < 3; i++) {
        b.boxOn(W / 2 - 0.85 + i * 0.22, 0, yardZ(D), 0.14, 0.24, 0.24, new Color('#6b4a2f').convertSRGBToLinear());
      }
      addTradeSign(b, W, D, new Color('#6b4a2f').convertSRGBToLinear(), 'tall', workshopFront(D) + 0.06);
      break;
    case 'carpenter':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out, lv);
      addWorkbench(b, -W / 2 + 0.7, yardZ(D));
      addPlankStack(b, W / 2 - 0.7, yardZ(D) + 0.18, 4);
      // A half-built chair, so the trade reads without the sign.
      const chairZ = yardZ(D) - 0.22;
      b.boxOn(W / 2 - 0.7, 0.2, chairZ, 0.3, 0.05, 0.3, C.wallWood);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          b.boxOn(W / 2 - 0.7 + sx * 0.11, 0, chairZ + sz * 0.11, 0.04, 0.2, 0.04, C.beam);
        }
      }
      b.boxOn(W / 2 - 0.7, 0.25, chairZ - 0.12, 0.3, 0.3, 0.04, C.wallWood);
      addTradeSign(b, W, D, C.wallWood, 'square', workshopFront(D) + 0.06);
      break;
    case 'fletcher':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out, lv);
      addWorkbench(b, -W / 2 + 0.7, yardZ(D));
      // A quiver of shafts and a strung bow on the wall.
      b.cylinder(W / 2 - 0.7, 0, yardZ(D), 0.13, 0.4, 7, new Color('#7c5230').convertSRGBToLinear());
      for (let i = 0; i < 5; i++) {
        b.cylinder(W / 2 - 0.7 + (i - 2) * 0.035, 0.38, yardZ(D), 0.012, 0.42, 4, C.beam, 1, 0);
      }
      b.box(0, 1.0, yardZ(D) - 0.3, 0.05, 0.75, 0.05, C.frame, 0, 0, 0.12);
      addTradeSign(b, W, D, new Color('#a8925f').convertSRGBToLinear(), 'tall', workshopFront(D) + 0.06);
      break;
    case 'chandlery':
      out.height = buildWorkshop(b, W, D, C.wallPlaster, C.roofThatch, out, lv);
      addChimney(b, out, W / 2 - 0.4, D / 2 - 0.4, 0.8, C.wallBrick);
      // A dipping vat and a rack of tapers, lit.
      addCandleRack(b, out, -W / 2 + 0.7, yardZ(D));
      b.cylinder(W / 2 - 0.7, 0, yardZ(D), 0.22, 0.38, 8, C.wallWoodDark, 0.94);
      addTradeSign(b, W, D, new Color('#f2e3a8').convertSRGBToLinear(), 'tall', workshopFront(D) + 0.06);
      break;

    // ── Services ─────────────────────────────────────────────────────────
    case 'market':
      out.height = buildMarket(b, W, D, out, lv);
      break;
    case 'grand_market':
      out.height = buildMarket(b, W, D, out, lv + 1);
      // A covered hall over the middle of the square, and a market cross.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          b.boxOn((sx * W) / 2 + sx * -0.5, 0, (sz * D) / 2 + sz * -0.5, 0.16, 1.9, 0.16, C.beam);
        }
      }
      b.gableRoof(0, 1.9, 0, W - 0.8, D - 0.8, 0.7, C.roofTile, 0, 0.3);
      b.cylinder(0, 0, 0, 0.16, 1.0, 8, C.wallStone);
      b.blob(0, 1.1, 0, 0.16, 0.16, 0.16, C.gold);
      out.height = 2.7;
      break;
    case 'trade_post':
      out.height = buildWorkshop(b, W, D, C.wallPlaster, C.roofTile, out, lv);
      addCart(b, -W / 2 + 0.85, yardZ(D));
      addDepotGoods(b, W / 2 - 0.8, yardZ(D), lv);
      // Scales on a post: the universal sign of a place that buys and sells.
      b.cylinder(0, 0, D / 2 + 0.75, 0.06, 0.95, 6, C.beam);
      b.box(0, 1.0, D / 2 + 0.75, 0.62, 0.04, 0.04, C.metal);
      for (const sx of [-1, 1]) {
        b.box(sx * 0.28, 0.9, D / 2 + 0.75, 0.02, 0.16, 0.02, C.metal);
        b.cylinder(sx * 0.28, 0.8, D / 2 + 0.75, 0.09, 0.05, 8, C.metal);
      }
      if (lv >= 2) addCart(b, W / 2 - 1.0, D / 2 + 0.9);
      break;
    case 'chapel':
      out.height = buildChapel(b, W, D, out, lv);
      break;
    case 'tavern':
      out.height = buildTavern(b, W, D, out, lv);
      break;
    case 'well':
      out.height = buildWell(b, out, lv);
      break;
    case 'firewatch':
      out.height = buildTower(b, W, D, out, lv);
      break;
    case 'healer_hut':
      out.height = buildHut(b, W, D, C.wallPlaster, C.roofThatch, out, 0.9, false);
      addHerbs(b, W, D);
      // Bundles drying under the eaves and a mortar on a stump: the herbalist
      // was previously a cottage with a few green dots.
      for (let i = -1; i <= 1; i++) {
        b.cone(i * 0.28, 0.6, D / 2 + 0.07, 0.07, 0.28, 5, new Color('#6f8a5a').convertSRGBToLinear(), Math.PI);
      }
      b.cylinder(-W / 2 + 0.5, 0, D / 2 - 0.5, 0.15, 0.3, 7, C.beam);
      b.cylinder(-W / 2 + 0.5, 0.3, D / 2 - 0.5, 0.11, 0.14, 8, C.wallStone, 0.8);
      addFlowerBed(b, W / 2 - 0.7, D / 2 + 0.42, 0);
      addTradeSign(b, W, D, new Color('#5f8a76').convertSRGBToLinear(), 'cross');
      break;

    // ── Ornament and leisure ─────────────────────────────────────────────
    case 'flower_bed':
      addFlowerBed(b, 0, 0, 0);
      addFlowerBed(b, 0, -0.34, 2);
      out.lights = [];
      out.height = 0.4;
      break;
    case 'bench': {
      const slatColor = lv >= 2 ? C.wallWood : C.frame;
      b.boxOn(0, 0.28, 0, 1.0, 0.07, 0.3, slatColor);
      b.boxOn(0, 0.44, -0.14, 1.0, 0.28, 0.06, slatColor);
      for (const sx of [-1, 1]) {
        b.boxOn(sx * 0.38, 0, 0, 0.07, 0.3, 0.26, C.beam);
        b.boxOn(sx * 0.38, 0.28, -0.14, 0.07, 0.46, 0.06, C.beam);
      }
      if (lv >= 3) addFlowerBed(b, 0, 0.42, 1);
      out.lights = [];
      out.height = 0.8;
      break;
    }
    case 'lamp_post':
      b.cylinder(0, 0, 0, 0.16, 0.14, 8, C.wallStone);
      b.cylinder(0, 0.14, 0, 0.055, 1.5 + (lv - 1) * 0.2, 6, C.metal);
      b.box(0, 1.72 + (lv - 1) * 0.2, 0, 0.26, 0.3, 0.26, C.metal);
      b.blob(0, 1.72 + (lv - 1) * 0.2, 0, 0.09, 0.1, 0.09, new Color('#ffd16a').convertSRGBToLinear());
      b.cone(0, 1.87 + (lv - 1) * 0.2, 0, 0.19, 0.16, 4, C.metal, Math.PI / 4);
      out.lights = [
        {
          x: 0,
          y: 1.72 + (lv - 1) * 0.2,
          z: 0,
          color: new Color('#ffcf7a'),
          intensity: 1.5 + (lv - 1) * 0.3,
        },
      ];
      out.height = 2.1;
      break;
    case 'fountain': {
      const r = Math.min(W, D) * 0.42;
      b.cylinder(0, 0, 0, r, 0.34, 10, C.wallStone);
      b.cylinder(0, 0.3, 0, r - 0.12, 0.08, 10, new Color('#4a8ba8').convertSRGBToLinear());
      b.cylinder(0, 0.34, 0, 0.16, 0.5 + (lv - 1) * 0.2, 8, C.wallStoneDark);
      b.cylinder(0, 0.84 + (lv - 1) * 0.2, 0, r * 0.5, 0.07, 10, C.wallStone);
      // The jet, as a tapered spike of pale water.
      b.cone(0, 0.9 + (lv - 1) * 0.2, 0, 0.09, 0.42, 6, new Color('#9fd6e8').convertSRGBToLinear());
      if (lv >= 3) {
        for (const sx of [-1, 1]) addFlowerBed(b, sx * (r + 0.45), 0, 1);
      }
      out.lights = [];
      out.height = 1.5;
      break;
    }
    case 'statue':
      b.boxOn(0, 0, 0, 0.7, 0.24, 0.7, C.wallStoneDark);
      b.boxOn(0, 0.24, 0, 0.5, 0.42, 0.5, C.wallStone);
      // A figure, roughed out: legs, robe, shoulders, head.
      b.cylinder(0, 0.66, 0, 0.19, 0.62, 7, C.wallStone, 0.78);
      b.box(0, 1.4, 0, 0.44, 0.1, 0.18, C.wallStone);
      b.blob(0, 1.52, 0, 0.12, 0.14, 0.12, C.wallStone);
      if (lv >= 2) b.blob(0, 1.66, 0, 0.13, 0.05, 0.13, C.gold);
      if (lv >= 3) {
        for (const sx of [-1, 1]) b.cylinder(sx * 0.55, 0, 0, 0.06, 0.6, 6, C.beam);
      }
      out.lights = [];
      out.height = 1.8;
      break;
    case 'village_green': {
      const w = W - 0.3;
      const d = D - 0.3;
      b.box(0, -0.03, 0, w, 0.08, d, new Color('#7fb04c').convertSRGBToLinear());
      // A lime tree in the middle, benches round the edge.
      b.cylinder(0, 0, 0, 0.16, 1.0, 6, C.beam);
      b.blob(0, 1.5, 0, 0.9, 0.7, 0.9, new Color('#4f9140').convertSRGBToLinear(), 1);
      b.blob(0.45, 1.15, -0.3, 0.5, 0.42, 0.5, new Color('#589b46').convertSRGBToLinear(), 1);
      for (const sz of [-1, 1]) {
        b.boxOn(0, 0.26, (sz * d) / 2 - sz * 0.35, 1.1, 0.07, 0.28, C.wallWood);
        for (const sx of [-1, 1]) {
          b.boxOn(sx * 0.42, 0, (sz * d) / 2 - sz * 0.35, 0.07, 0.28, 0.24, C.beam);
        }
      }
      addFlowerBed(b, -w / 2 + 0.6, d / 2 - 0.5, 0);
      addFlowerBed(b, w / 2 - 0.6, -d / 2 + 0.5, 2);
      if (lv >= 2) b.cylinder(-w / 2 + 0.5, 0, -d / 2 + 0.5, 0.05, 1.3, 6, C.beam);
      out.lights.push({ x: 0, y: 0.5, z: 0, color: new Color('#ffcf7a'), intensity: 0.6 });
      out.height = 2.3;
      break;
    }
    case 'theatre': {
      const w = W - 0.4;
      const d = D - 0.4;
      // A trestle stage, a painted backdrop and bunting.
      b.boxOn(0, 0.45, -d * 0.1, w, 0.1, d * 0.6, C.wallWood);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          b.boxOn(sx * (w / 2 - 0.2), 0, -d * 0.1 + sz * (d * 0.26), 0.1, 0.45, 0.1, C.beam);
        }
      }
      b.boxOn(0, 0.55, -d / 2 + 0.2, w, 1.5 + (lv - 1) * 0.25, 0.1, C.clothBlue);
      for (const sx of [-1, 1]) {
        b.boxOn(sx * (w / 2 - 0.1), 0.55, -d / 2 + 0.3, 0.12, 1.6, 0.5, C.clothRed);
        b.cylinder(sx * (w / 2 + 0.1), 0, d / 2 - 0.3, 0.06, 2.0, 6, C.beam);
      }
      // Bunting between the poles, and benches for the audience.
      for (let i = -2; i <= 2; i++) {
        b.cone(i * (w / 5), 1.75, d / 2 - 0.3, 0.09, 0.2, 3, [C.clothRed, C.gold, C.clothBlue][(i + 2) % 3], Math.PI);
      }
      for (let row = 0; row < 2; row++) {
        b.boxOn(0, 0.22, d / 2 - 0.7 - row * 0.5, w * 0.8, 0.07, 0.24, C.wallWood);
        for (const sx of [-1, 1]) {
          b.boxOn(sx * w * 0.32, 0, d / 2 - 0.7 - row * 0.5, 0.07, 0.24, 0.2, C.beam);
        }
      }
      out.lights.push({ x: 0, y: 0.9, z: 0, color: new Color('#ffb04a'), intensity: 1.4 });
      out.height = 2.4 + (lv - 1) * 0.25;
      break;
    }

    default:
      out.height = buildHut(b, W, D, C.wallWood, C.roofThatch, out, 0.9, false);
      break;
  }

  // Rank is legible from any angle: a stone plinth, then pennants on the
  // ridge, then a gilded finial. Without a cue that does not depend on
  // recognising the building, "bigger" is the only difference a player sees.
  addRankMarks(b, out, defId, W, D, out.height, lv);

  out.geometry = b.build();
  return out;
}

// ── Archetypes ─────────────────────────────────────────────────────────────

function buildHut(
  b: MeshBuilder,
  W: number,
  D: number,
  wall: Color,
  roof: Color,
  out: BuildingVisual,
  scale: number,
  crooked: boolean,
): number {
  const w = W - 0.35;
  const d = D - 0.35;
  const wallH = 0.92 * scale;
  const roofH = 0.5 * scale;
  const tilt = crooked ? 0.035 : 0;
  b.boxOn(0, 0, 0, w, wallH, d, wall, tilt);
  // Corner posts read well even at a distance.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.boxOn((w / 2 - 0.06) * sx, 0, (d / 2 - 0.06) * sz, 0.12, wallH + 0.04, 0.12, C.beam);
    }
  }
  b.gableRoof(0, wallH, 0, w, d, roofH, roof, 0, 0.12);
  b.boxOn(0, 0, d / 2 - 0.02, 0.34, wallH * 0.7, 0.08, C.beam);
  out.lights.push({ x: 0, y: wallH * 0.5, z: d / 2, color: new Color('#ffb861'), intensity: 0.6 });
  return wallH + roofH;
}

function buildOpenCamp(
  b: MeshBuilder,
  W: number,
  D: number,
  wall: Color,
  roof: Color,
  out: BuildingVisual,
): number {
  const yard = yardDepth(D);
  const w = W - 0.4;
  const d = D - 0.4 - yard;
  const zc = -yard / 2;
  const h = 0.72;
  // Lean-to: back wall plus a slanted roof on posts. It covers only the back
  // of the plot — a roof spanning the whole footprint hid every prop under it.
  b.boxOn(0, 0, zc - d / 2, w, h, 0.12, wall);
  for (const sx of [-1, 1]) b.boxOn((w / 2 - 0.08) * sx, 0, zc + d / 2 - 0.08, 0.12, h * 0.85, 0.12, C.beam);
  b.box(0, h + 0.18, zc, w + 0.24, 0.09, d + 0.2, roof, 0, -0.22, 0);
  // Gear under the lean-to, so the shelter is not an empty canopy.
  b.boxOn(-w / 2 + 0.3, 0, zc - d / 2 + 0.28, 0.34, 0.26, 0.3, C.wallWoodDark, 0.2);
  out.lights.push({ x: 0, y: 0.3, z: zc, color: new Color('#ff9a4a'), intensity: 0.35 });
  return h + 0.4;
}

/**
 * Depth of the yard a workshop keeps in front of itself, and the z of its
 * centre. Props used to be placed at the plot's edge and ended up *inside* the
 * walls, invisible: the shop took nearly the whole footprint. Pulling the
 * building back leaves a strip the size of a cart where an oven, a loom or a
 * stack of planks can actually be seen.
 */
export function yardDepth(D: number): number {
  return Math.min(1.0, Math.max(0.55, D * 0.26));
}

/** Centre of that yard, in the building's local space. */
export function yardZ(D: number): number {
  return D / 2 - yardDepth(D) * 0.52;
}

/** The workshop's own front wall, where its sign hangs. */
export function workshopFront(D: number): number {
  return D / 2 - 0.2 - yardDepth(D);
}

function buildWorkshop(
  b: MeshBuilder,
  W: number,
  D: number,
  wall: Color,
  roof: Color,
  out: BuildingVisual,
  lv = 1,
): number {
  const yard = yardDepth(D);
  const w = W - 0.4;
  const d = D - 0.4 - yard;
  // The shop sits at the back of its plot, facing its own yard.
  const zc = -yard / 2;
  const front = zc + d / 2;
  // Rank grows the workshop upward: a taller shop at II, a jettied loft at III.
  const wallH = 1.0 + (lv - 1) * 0.3;
  b.boxOn(0, 0, zc, w, wallH, d, wall);
  for (const sx of [-1, 1]) {
    b.boxOn((w / 2 - 0.07) * sx, 0, front - 0.07, 0.14, wallH, 0.14, C.beam);
    b.boxOn((w / 2 - 0.07) * sx, 0, zc - d / 2 + 0.07, 0.14, wallH, 0.14, C.beam);
  }
  // Half-timbering, the signature of the style.
  b.box(0, wallH * 0.55, front + 0.001, w, 0.1, 0.03, C.beam);
  let roofBase = wallH;
  let roofW = w;
  let roofD = d;
  if (lv >= 3) {
    roofBase = wallH + 0.55;
    roofW = w + 0.2;
    roofD = d + 0.2;
    b.boxOn(0, wallH, zc, roofW, 0.55, roofD, C.wallPlaster);
    b.box(0, wallH + 0.3, zc + roofD / 2 + 0.002, roofW, 0.09, 0.03, C.beam);
    for (const sx of [-1, 1]) {
      b.box(sx * roofW * 0.26, wallH + 0.28, zc + roofD / 2 + 0.03, 0.2, 0.24, 0.03, new Color('#3c4a52').convertSRGBToLinear());
    }
  }
  b.gableRoof(0, roofBase, zc, roofW, roofD, 0.7, roof, 0);
  b.boxOn(0, 0, front - 0.01, 0.42, Math.min(wallH * 0.72, 0.95), 0.09, C.beam);
  // A shop window beside the door once the trade is doing well.
  if (lv >= 2) {
    b.box(w * 0.28, wallH * 0.52, front + 0.02, 0.3, 0.3, 0.03, new Color('#3c4a52').convertSRGBToLinear());
    b.box(w * 0.28, wallH * 0.52, front + 0.04, 0.32, 0.04, 0.02, C.beam);
  }
  // A low fence closing the yard, so it reads as part of the plot.
  for (const sx of [-1, 1]) {
    b.boxOn(sx * (w / 2), 0, D / 2 - 0.12, 0.07, 0.34, 0.07, C.beam);
    b.box(sx * (w / 2 - 0.02), 0.26, yardZ(D) + 0.1, 0.05, 0.05, yard * 0.8, C.beam);
  }
  out.lights.push({ x: 0, y: wallH * 0.55, z: front, color: new Color('#ffa24a'), intensity: 0.7 });
  return roofBase + 0.7;
}

function buildBarn(
  b: MeshBuilder,
  W: number,
  D: number,
  wall: Color,
  roof: Color,
  out: BuildingVisual,
): number {
  const w = W - 0.3;
  const d = D - 0.3;
  const wallH = 1.15;
  b.boxOn(0, 0, 0, w, wallH, d, wall);
  b.gableRoof(0, wallH, 0, w, d, 0.85, roof, 0, 0.26);
  // Big double doors.
  b.boxOn(0, 0, d / 2 + 0.01, w * 0.5, wallH * 0.8, 0.08, C.beam);
  b.box(0, wallH * 0.45, d / 2 + 0.05, 0.06, wallH * 0.75, 0.03, C.wallWoodDark);
  // Crates outside so it reads as a depot.
  b.boxOn(-w / 2 + 0.35, 0, d / 2 + 0.45, 0.32, 0.3, 0.32, C.wallWood, 0.3);
  b.boxOn(-w / 2 + 0.72, 0, d / 2 + 0.38, 0.26, 0.24, 0.26, C.wallWoodDark, -0.2);
  out.lights.push({ x: 0, y: wallH * 0.6, z: d / 2, color: new Color('#ffb861'), intensity: 0.5 });
  return wallH + 0.85;
}

function buildGranary(b: MeshBuilder, W: number, D: number, out: BuildingVisual): number {
  const w = W - 0.5;
  const d = D - 0.5;
  // Raised on staddle stones to keep vermin out — a nice readable detail.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.cylinder((w / 2 - 0.2) * sx, 0, (d / 2 - 0.2) * sz, 0.13, 0.3, 6, C.wallStone);
      b.cylinder((w / 2 - 0.2) * sx, 0.3, (d / 2 - 0.2) * sz, 0.2, 0.09, 6, C.wallStone);
    }
  }
  b.boxOn(0, 0.39, 0, w, 0.95, d, C.wallWood);
  b.gableRoof(0, 1.34, 0, w, d, 0.6, C.roofThatch, 0);
  b.box(0, 0.2, d / 2 + 0.25, 0.4, 0.05, 0.6, C.beam, 0, -0.5, 0);
  out.lights.push({ x: 0, y: 0.9, z: d / 2, color: new Color('#ffb861'), intensity: 0.4 });
  return 1.95;
}

function buildTwoStorey(
  b: MeshBuilder,
  W: number,
  D: number,
  lower: Color,
  upper: Color,
  roof: Color,
  out: BuildingVisual,
): number {
  const w = W - 0.4;
  const d = D - 0.4;
  b.boxOn(0, 0, 0, w, 1.0, d, lower);
  // Jettied upper floor, slightly wider than the ground floor.
  b.boxOn(0, 1.0, 0, w + 0.22, 0.85, d + 0.22, upper);
  for (const sx of [-1, 1]) {
    b.boxOn(((w + 0.22) / 2 - 0.08) * sx, 1.0, (d + 0.22) / 2 - 0.08, 0.13, 0.85, 0.13, C.beam);
    b.boxOn(((w + 0.22) / 2 - 0.08) * sx, 1.0, -(d + 0.22) / 2 + 0.08, 0.13, 0.85, 0.13, C.beam);
  }
  b.box(0, 1.42, (d + 0.22) / 2 + 0.002, w, 0.09, 0.03, C.beam);
  b.gableRoof(0, 1.85, 0, w + 0.22, d + 0.22, 0.75, roof, 0);
  b.boxOn(0, 0, d / 2 + 0.01, 0.44, 0.78, 0.08, C.beam);
  // Windows.
  for (const sx of [-1, 1]) {
    b.box(sx * w * 0.26, 1.42, (d + 0.22) / 2 + 0.03, 0.22, 0.26, 0.03, new Color('#3c4a52').convertSRGBToLinear());
  }
  out.lights.push({ x: 0, y: 1.4, z: d / 2, color: new Color('#ffb861'), intensity: 0.9 });
  return 2.6;
}

function buildManor(b: MeshBuilder, W: number, D: number, out: BuildingVisual): number {
  const h = buildTwoStorey(b, W, D, C.wallStone, C.wallPlaster, C.roofSlate, out);
  const w = W - 0.4;
  const d = D - 0.4;
  // A stair tower to separate it from an ordinary house.
  b.cylinder(-w / 2 + 0.2, 0, -d / 2 + 0.2, 0.4, 2.5, 6, C.wallStone);
  b.cone(-w / 2 + 0.2, 2.5, -d / 2 + 0.2, 0.46, 0.7, 6, C.roofSlate);
  b.boxOn(0, 0, d / 2 + 0.2, 1.0, 0.12, 0.4, C.wallStone);
  return Math.max(h, 3.2);
}

function buildHall(
  b: MeshBuilder,
  W: number,
  D: number,
  wall: Color,
  roof: Color,
  out: BuildingVisual,
  scale: number,
): number {
  const w = W - 0.35;
  const d = D - 0.35;
  const wallH = 1.5 * scale;
  b.boxOn(0, 0, 0, w, wallH, d, wall);
  // A stone plinth grounds the building instead of letting walls float.
  b.boxOn(0, 0, 0, w + 0.24, 0.16, d + 0.24, C.wallStoneDark);
  b.gableRoof(0, wallH, 0, w, d, 0.68 * scale, roof, 0, 0.14);
  // Porch: two columns carrying the roof overhang, no floating slab.
  for (const sx of [-1, 1]) {
    b.cylinder(sx * w * 0.3, 0.16, d / 2 + 0.16, 0.11, wallH - 0.16, 6, C.wallStone);
    b.cylinder(sx * w * 0.3, wallH - 0.06, d / 2 + 0.16, 0.15, 0.1, 6, C.wallStoneDark);
  }
  b.boxOn(0, 0.16, d / 2 + 0.02, w * 0.3, wallH * 0.62, 0.1, C.beam);
  for (let i = -1; i <= 1; i += 2) {
    b.box(i * w * 0.34, wallH * 0.62, d / 2 + 0.002, 0.26, 0.46, 0.03, new Color('#33414a').convertSRGBToLinear());
  }
  out.lights.push({ x: 0, y: wallH * 0.6, z: d / 2, color: new Color('#ffd28a'), intensity: 1.1 });
  return wallH + 0.8 * scale;
}

function buildTownHall(b: MeshBuilder, W: number, D: number, out: BuildingVisual): number {
  const h = buildHall(b, W, D, C.wallStone, C.roofTile, out, 1.35);
  const w = W - 0.35;
  const d = D - 0.35;
  // Bell tower.
  b.boxOn(w / 2 - 0.55, 0.16, -d / 2 + 0.55, 0.85, 2.9, 0.85, C.wallStone);
  b.boxOn(w / 2 - 0.55, 2.9, -d / 2 + 0.55, 1.0, 0.18, 1.0, C.wallStoneDark);
  b.cone(w / 2 - 0.55, 3.08, -d / 2 + 0.55, 0.62, 0.95, 4, C.roofSlate, Math.PI / 4);
  b.box(w / 2 - 0.55, 4.12, -d / 2 + 0.55, 0.07, 0.35, 0.07, C.metal);
  // Banner over the entrance.
  b.box(0, 1.5, d / 2 + 0.35, 0.5, 0.7, 0.03, C.clothRed);
  out.lights.push({ x: w / 2 - 0.55, y: 2.6, z: -d / 2 + 0.55, color: new Color('#ffd28a'), intensity: 1.2 });
  return Math.max(h, 4.5);
}

function buildPier(b: MeshBuilder, W: number, D: number, scale: number, out: BuildingVisual): number {
  const w = W - 0.4;
  const d = D - 0.4;
  // Decking over the water edge.
  b.boxOn(0, -0.12, d * 0.22, w, 0.1, d * 0.55, C.wallWood);
  for (let i = -2; i <= 2; i++) {
    b.cylinder((i * w) / 5, -0.55, d * 0.42, 0.07, 0.6, 5, C.beam);
  }
  const hutW = w * 0.62;
  const hutD = d * 0.45;
  const wallH = 0.8 * scale;
  b.boxOn(0, 0, -d * 0.2, hutW, wallH, hutD, C.wallWood);
  b.gableRoof(0, wallH, -d * 0.2, hutW, hutD, 0.5 * scale, C.roofThatch, 0);
  out.lights.push({ x: 0, y: wallH * 0.6, z: -d * 0.2 + hutD / 2, color: new Color('#ffb861'), intensity: 0.5 });
  return wallH + 0.5 * scale;
}

function buildQuarry(b: MeshBuilder, W: number, D: number, out: BuildingVisual): number {
  const w = W - 0.3;
  const d = D - 0.3;
  // Terraced pit.
  b.box(0, -0.12, 0, w, 0.25, d, C.wallStoneDark);
  b.box(0, -0.02, 0, w * 0.7, 0.2, d * 0.7, C.wallStone);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.blob(Math.cos(a) * w * 0.34, 0.14, Math.sin(a) * d * 0.34, 0.24, 0.18, 0.22, C.wallStone);
  }
  // Timber crane.
  b.cylinder(-w / 2 + 0.4, 0, -d / 2 + 0.4, 0.09, 1.5, 5, C.beam);
  b.box(-w / 2 + 0.85, 1.45, -d / 2 + 0.4, 1.0, 0.1, 0.1, C.beam, 0, 0, -0.25);
  b.boxOn(w / 2 - 0.45, 0, d / 2 - 0.45, 0.5, 0.45, 0.5, C.wallStone);
  out.lights.push({ x: 0, y: 0.4, z: 0, color: new Color('#ffb861'), intensity: 0.25 });
  return 1.6;
}

function buildPit(b: MeshBuilder, W: number, D: number, fill: Color, out: BuildingVisual): number {
  const w = W - 0.3;
  const d = D - 0.3;
  b.box(0, -0.1, 0, w, 0.2, d, fill);
  b.box(0, 0.02, 0, w * 0.62, 0.12, d * 0.62, fill.clone().multiplyScalar(0.8));
  b.boxOn(w / 2 - 0.45, 0, -d / 2 + 0.45, 0.5, 0.55, 0.5, C.wallWood);
  b.gableRoof(w / 2 - 0.45, 0.55, -d / 2 + 0.45, 0.5, 0.5, 0.3, C.roofThatch, 0);
  out.lights.push({ x: 0, y: 0.3, z: 0, color: new Color('#ffb861'), intensity: 0.2 });
  return 1.0;
}

function buildMine(b: MeshBuilder, W: number, D: number, ore: Color, out: BuildingVisual): number {
  const w = W - 0.3;
  const d = D - 0.3;
  // Spoil heap with a timbered adit.
  b.blob(0, 0.1, -d * 0.2, w * 0.45, 0.55, d * 0.4, C.wallStoneDark);
  b.blob(w * 0.25, 0.05, -d * 0.1, w * 0.22, 0.3, d * 0.2, ore);
  b.boxOn(0, 0, d * 0.08, 0.75, 0.75, 0.16, C.beam);
  b.box(0, 0.3, d * 0.1, 0.55, 0.6, 0.12, new Color('#1c1c1e').convertSRGBToLinear());
  b.box(0, 0.82, d * 0.08, 0.95, 0.14, 0.2, C.beam);
  // Cart and rails.
  b.boxOn(w / 2 - 0.5, 0, d / 2 - 0.5, 0.42, 0.28, 0.32, C.wallWoodDark, 0.4);
  for (let i = 0; i < 4; i++) b.box(0.2 + i * 0.3, 0.03, d * 0.45, 0.06, 0.05, 0.5, C.beam);
  out.lights.push({ x: 0, y: 0.35, z: d * 0.12, color: new Color('#ff9a3a'), intensity: 0.5 });
  return 1.4;
}

function addHeadframe(b: MeshBuilder, x: number, z: number): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(x + sx * 0.4, 1.1, z + sz * 0.4, 0.09, 2.2, 0.09, C.beam, 0, sz * 0.12, -sx * 0.12);
    }
  }
  b.box(x, 2.25, z, 0.95, 0.12, 0.95, C.beam);
  b.cylinder(x, 2.35, z, 0.28, 0.12, 8, C.metal);
}

/**
 * A field through its year: turned earth, shoots, green stalks, heavy ripe
 * ears, then stubble and stooks after the harvest. It used to be a single
 * frozen image of a ripe crop whatever the field was actually doing, which
 * made the whole farming chain read as a number in a panel.
 */
function buildField(
  b: MeshBuilder,
  W: number,
  D: number,
  crop: Color,
  out: BuildingVisual,
  stage: number,
  lv: number,
): number {
  const w = W - 0.2;
  const d = D - 0.2;
  const soil = stage === 0 ? C.dirt : C.dirt.clone().multiplyScalar(0.94);
  b.box(0, -0.04, 0, w, 0.1, d, soil);

  const rows = Math.max(3, Math.floor(d / 0.55));
  const rowZ = (i: number): number => -d / 2 + 0.3 + (i * (d - 0.6)) / Math.max(1, rows - 1);
  const young = C.cropYoung;

  for (let i = 0; i < rows; i++) {
    const z = rowZ(i);
    switch (stage) {
      case 0:
        // Ploughed: nothing but ridges of turned soil.
        b.boxOn(0, 0.01, z, w - 0.2, 0.09, 0.26, C.dirt.clone().multiplyScalar(1.12));
        break;
      case 1:
        // Shoots, a hand high.
        b.boxOn(0, 0.01, z, w - 0.2, 0.06, 0.24, C.dirt.clone().multiplyScalar(1.1));
        for (let k = 0; k < 5; k++) {
          const x = -w / 2 + 0.35 + (k * (w - 0.7)) / 4;
          b.cone(x, 0.05, z, 0.07, 0.16, 4, young);
        }
        break;
      case 2:
        // Green and growing, not yet turned.
        b.boxOn(0, 0.02, z, w - 0.25, 0.34, 0.2, young);
        b.boxOn(0, 0.02, z, w - 0.25, 0.44, 0.07, young.clone().multiplyScalar(1.08));
        break;
      case 3:
        // Ripe: taller, golden, with heads that catch the light.
        b.boxOn(0, 0.02, z, w - 0.25, 0.46, 0.22, crop);
        b.boxOn(0, 0.02, z, w - 0.25, 0.6, 0.08, crop.clone().multiplyScalar(1.12));
        for (let k = 0; k < 4; k++) {
          const x = -w / 2 + 0.45 + (k * (w - 0.9)) / 3;
          b.blob(x, 0.66, z, 0.06, 0.1, 0.06, crop.clone().multiplyScalar(1.2));
        }
        break;
      default:
        // Harvested: stubble, and the straw gathered into stooks.
        b.boxOn(0, 0.01, z, w - 0.25, 0.1, 0.18, crop.clone().multiplyScalar(0.8));
        break;
    }
  }

  if (stage === 4) {
    for (let k = 0; k < 3; k++) {
      const x = -w / 2 + 0.7 + (k * (w - 1.4)) / 2;
      b.cone(x, 0, d / 2 - 0.6, 0.26, 0.62, 6, crop.clone().multiplyScalar(0.95));
    }
  }

  // A scarecrow reads instantly as "this is a farm".
  b.cylinder(w / 2 - 0.4, 0, -d / 2 + 0.4, 0.05, 0.85, 4, C.beam);
  b.box(w / 2 - 0.4, 0.62, -d / 2 + 0.4, 0.6, 0.06, 0.06, C.beam);
  b.blob(w / 2 - 0.4, 0.92, -d / 2 + 0.4, 0.14, 0.14, 0.14, C.roofThatch);
  // Rank shows as a fenced, tended field with a water butt and a cart track.
  if (lv >= 2) {
    for (const sz of [-1, 1]) {
      for (let k = -2; k <= 2; k++) {
        b.boxOn((k * w) / 5, 0, (sz * d) / 2, 0.06, 0.34, 0.06, C.beam);
      }
      b.box(0, 0.26, (sz * d) / 2, w, 0.04, 0.04, C.beam);
    }
    b.cylinder(-w / 2 + 0.4, 0, -d / 2 + 0.4, 0.18, 0.34, 8, C.wallWoodDark, 0.94);
  }
  if (lv >= 3) {
    b.boxOn(-w / 2 + 0.45, 0, d / 2 - 0.5, 0.75, 0.3, 0.45, C.wallWood, 0.2);
    b.gableRoof(-w / 2 + 0.45, 0.3, d / 2 - 0.5, 0.75, 0.45, 0.24, C.roofThatch, 0, 0.1);
  }
  out.lights = [];
  return 0.9;
}

function buildPasture(
  b: MeshBuilder,
  W: number,
  D: number,
  animal: 'chicken' | 'sheep' | 'cattle',
  out: BuildingVisual,
  lv = 1,
): number {
  const w = W - 0.2;
  const d = D - 0.2;
  b.box(0, -0.03, 0, w, 0.08, d, new Color('#7fa04c').convertSRGBToLinear());
  // Fence.
  const posts = Math.max(4, Math.round(w / 0.7));
  for (let i = 0; i <= posts; i++) {
    const t = -w / 2 + (i * w) / posts;
    for (const sz of [-1, 1]) {
      b.boxOn(t, 0, (sz * d) / 2, 0.07, 0.42, 0.07, C.beam);
    }
  }
  const postsZ = Math.max(4, Math.round(d / 0.7));
  for (let i = 0; i <= postsZ; i++) {
    const t = -d / 2 + (i * d) / postsZ;
    for (const sx of [-1, 1]) {
      b.boxOn((sx * w) / 2, 0, t, 0.07, 0.42, 0.07, C.beam);
    }
  }
  for (const sz of [-1, 1]) b.box(0, 0.3, (sz * d) / 2, w, 0.05, 0.05, C.beam);
  for (const sx of [-1, 1]) b.box((sx * w) / 2, 0.3, 0, 0.05, 0.05, d, C.beam);

  // Shelter.
  const sw = Math.min(1.6, w * 0.45);
  b.boxOn(-w / 2 + sw / 2 + 0.2, 0, -d / 2 + sw / 2 + 0.2, sw, 0.6, sw, C.wallWood);
  b.gableRoof(-w / 2 + sw / 2 + 0.2, 0.6, -d / 2 + sw / 2 + 0.2, sw, sw, 0.36, C.roofThatch, 0);

  // Livestock, laid out deterministically so the pen never looks random.
  // More rank, more livestock: a pasture reads its level off its herd.
  const count = (animal === 'chicken' ? 7 : animal === 'sheep' ? 5 : 4) + (lv - 1) * 2;
  const body =
    animal === 'chicken'
      ? new Color('#e8e2d4')
      : animal === 'sheep'
        ? new Color('#e4ded0')
        : new Color('#8c6a4a');
  body.convertSRGBToLinear();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.6;
    const r = Math.min(w, d) * (0.24 + (i % 2) * 0.12);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r + d * 0.12;
    if (animal === 'chicken') {
      b.blob(x, 0.12, z, 0.1, 0.1, 0.13, body);
      b.blob(x, 0.24, z + 0.08, 0.055, 0.06, 0.055, body);
      b.box(x, 0.26, z + 0.13, 0.03, 0.03, 0.05, new Color('#d08a2a').convertSRGBToLinear());
    } else if (animal === 'sheep') {
      b.blob(x, 0.22, z, 0.2, 0.17, 0.26, body);
      b.blob(x, 0.26, z + 0.24, 0.1, 0.1, 0.1, new Color('#3a3630').convertSRGBToLinear());
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          b.boxOn(x + sx * 0.1, 0, z + sz * 0.13, 0.05, 0.14, 0.05, new Color('#3a3630').convertSRGBToLinear());
        }
      }
    } else {
      b.box(x, 0.32, z, 0.34, 0.26, 0.56, body);
      b.blob(x, 0.36, z + 0.36, 0.13, 0.12, 0.13, body.clone().multiplyScalar(0.85));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          b.boxOn(x + sx * 0.13, 0, z + sz * 0.2, 0.07, 0.2, 0.07, new Color('#6b4f36').convertSRGBToLinear());
        }
      }
    }
  }
  out.lights = [];
  return 1.0;
}

function buildKiln(b: MeshBuilder, W: number, D: number, out: BuildingVisual, shell: Color): number {
  const r = Math.min(W, D) * 0.34;
  b.cylinder(0, 0, 0, r, 0.9, 8, shell, 0.65);
  b.cone(0, 0.9, 0, r * 0.68, 0.45, 8, shell.clone().multiplyScalar(0.85));
  b.box(0, 0.22, r * 0.62, 0.34, 0.36, 0.2, new Color('#2a1c14').convertSRGBToLinear());
  b.boxOn(W / 2 - 0.5, 0, -D / 2 + 0.5, 0.45, 0.4, 0.45, C.wallWood, 0.3);
  out.smoke = { x: 0, y: 1.4, z: 0 };
  out.lights.push({ x: 0, y: 0.25, z: r * 0.6, color: new Color('#ff7a2a'), intensity: 1.2 });
  return 1.45;
}

function buildWindmill(b: MeshBuilder, W: number, D: number, out: BuildingVisual, lv = 1): number {
  const r = Math.min(W, D) * 0.3;
  b.cylinder(0, 0, 0, r, 2.0, 8, C.wallPlaster, 0.72);
  b.cylinder(0, 2.0, 0, r * 0.75, 0.16, 8, C.beam);
  b.cone(0, 2.16, 0, r * 0.8, 0.55, 8, C.roofSlate);
  b.boxOn(0, 0, r * 0.85, 0.36, 0.7, 0.1, C.beam);
  // Balcony.
  b.cylinder(0, 1.1, 0, r * 1.12, 0.07, 8, C.beam);

  // Sails as a separate rotor.
  const rotor = new MeshBuilder();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const len = 1.5 + (lv - 1) * 0.28;
    rotor.box(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5, 0, 0.1, len, 0.06, C.beam, 0, 0, a);
    rotor.box(
      Math.cos(a) * len * 0.62,
      Math.sin(a) * len * 0.62,
      0.04,
      0.34,
      len * 0.55,
      0.03,
      C.cloth,
      0,
      0,
      a,
    );
  }
  out.rotor = {
    geometry: rotor.build(),
    x: 0,
    y: 2.05,
    z: r * 0.95,
    yaw: 0,
    pitch: 0,
    speed: 0.55,
  };
  out.lights.push({ x: 0, y: 0.9, z: r * 0.8, color: new Color('#ffb861'), intensity: 0.5 });
  return 2.8;
}

function buildMarket(b: MeshBuilder, W: number, D: number, out: BuildingVisual, lv = 1): number {
  const w = W - 0.3;
  const d = D - 0.3;
  b.box(0, -0.03, 0, w, 0.08, d, new Color('#9a8a6a').convertSRGBToLinear());
  const stallColors = [C.clothRed, C.clothBlue, C.cloth, C.roofThatch];
  const cols = Math.max(2, Math.floor(w / 1.5));
  const rows = Math.max(2, Math.floor(d / 1.5));
  let n = 0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // A busier market fills in the gaps between its stalls.
      if ((i + j) % 2 === 1 && lv < 2) continue;
      const x = -w / 2 + 0.75 + (i * (w - 1.5)) / Math.max(1, cols - 1);
      const z = -d / 2 + 0.75 + (j * (d - 1.5)) / Math.max(1, rows - 1);
      const col = stallColors[n++ % stallColors.length];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          b.boxOn(x + sx * 0.42, 0, z + sz * 0.34, 0.06, 0.8, 0.06, C.beam);
        }
      }
      b.box(x, 0.88, z, 1.0, 0.07, 0.86, col, 0, 0.12, 0);
      b.boxOn(x, 0.42, z + 0.28, 0.9, 0.08, 0.3, C.wallWood);
      b.boxOn(x - 0.2, 0.5, z + 0.28, 0.16, 0.12, 0.16, C.crop);
      b.boxOn(x + 0.2, 0.5, z + 0.28, 0.14, 0.14, 0.14, C.clothRed);
    }
  }
  out.lights.push({ x: 0, y: 0.8, z: 0, color: new Color('#ffc070'), intensity: 0.9 });
  return 1.1;
}

function buildChapel(b: MeshBuilder, W: number, D: number, out: BuildingVisual, lv = 1): number {
  const w = W - 0.5;
  const d = D - 0.4;
  b.boxOn(0, 0, 0, w, 1.35, d, C.wallStone);
  b.gableRoof(0, 1.35, 0, w, d, 0.8, C.roofSlate, 0);
  // Bell tower over the entrance.
  b.boxOn(0, 0, d / 2 - 0.05, w * 0.42, 2.4, w * 0.42, C.wallStone);
  b.cone(0, 2.4, d / 2 - 0.05, w * 0.32, 1.0, 4, C.roofSlate, Math.PI / 4);
  b.box(0, 3.55, d / 2 - 0.05, 0.06, 0.45, 0.06, C.metal);
  b.box(0, 3.62, d / 2 - 0.05, 0.28, 0.06, 0.06, C.metal);
  // Arched window (approximated with a slab plus a blob).
  b.box(0, 1.35, -d / 2 - 0.01, 0.32, 0.5, 0.04, new Color('#4a6f96').convertSRGBToLinear());
  b.blob(0, 1.6, -d / 2 - 0.01, 0.16, 0.16, 0.02, new Color('#4a6f96').convertSRGBToLinear());
  out.lights.push({ x: 0, y: 1.2, z: -d / 2, color: new Color('#ffd9a0'), intensity: 1.0 });
  // Buttresses, then a rose window and a lych-gate: the parish is prospering.
  if (lv >= 2) {
    for (const sx of [-1, 1]) {
      for (const oz of [-0.4, 0.4]) {
        b.boxOn(sx * (w / 2 + 0.1), 0, oz * d, 0.22, 1.1, 0.3, C.wallStone);
      }
    }
  }
  if (lv >= 3) {
    b.disc(0, 2.0, -d / 2 - 0.02, 0.28, 0.04, 10, new Color('#4a6f96').convertSRGBToLinear());
    b.disc(0, 2.0, -d / 2 - 0.05, 0.2, 0.04, 8, C.gold);
    for (const sx of [-1, 1]) b.cylinder(sx * 0.7, 0, d / 2 + 0.9, 0.08, 1.15, 6, C.beam);
    b.gableRoof(0, 1.15, d / 2 + 0.9, 1.6, 0.6, 0.3, C.roofSlate, 0, 0.14);
  }
  return 4.1;
}

function buildTavern(b: MeshBuilder, W: number, D: number, out: BuildingVisual, lv = 1): number {
  const h = buildTwoStorey(b, W, D, C.wallWood, C.wallPlaster, C.roofThatch, out);
  const d = D - 0.4;
  // Hanging sign and outdoor benches.
  b.box(W / 2 - 0.1, 1.55, d / 2 + 0.05, 0.08, 0.08, 0.5, C.beam);
  b.box(W / 2 - 0.1, 1.28, d / 2 + 0.3, 0.05, 0.42, 0.42, C.clothRed);
  for (const sx of [-1, 1]) {
    b.boxOn(sx * 0.8, 0, d / 2 + 0.7, 0.9, 0.06, 0.28, C.wallWood);
    b.boxOn(sx * 0.8, 0, d / 2 + 0.7, 0.08, 0.28, 0.24, C.beam);
  }
  out.lights.push({ x: 0, y: 0.9, z: d / 2 + 0.5, color: new Color('#ffb04a'), intensity: 1.3 });
  // The terrace grows with the trade: barrels, then a trestle and lanterns.
  addBarrels(b, -W / 2 + 0.6, -D / 2 + 0.7);
  if (lv >= 2) {
    b.boxOn(0, 0.4, d / 2 + 1.25, 1.8, 0.07, 0.6, C.wallWood);
    for (const sx of [-1, 1]) b.boxOn(sx * 0.7, 0, d / 2 + 1.25, 0.09, 0.4, 0.5, C.beam);
  }
  if (lv >= 3) {
    for (const sx of [-1, 1]) {
      b.cylinder(sx * 1.3, 0, d / 2 + 1.0, 0.05, 1.3, 6, C.beam);
      b.blob(sx * 1.3, 1.36, d / 2 + 1.0, 0.11, 0.13, 0.11, new Color('#f2c455').convertSRGBToLinear());
      out.lights.push({ x: sx * 1.3, y: 1.36, z: d / 2 + 1.0, color: new Color('#ffb04a'), intensity: 1.0 });
    }
  }
  return h;
}

function buildWell(b: MeshBuilder, out: BuildingVisual, lv = 1): number {
  b.cylinder(0, 0, 0, 0.36, 0.42, 8, C.wallStone);
  b.cylinder(0, 0.42, 0, 0.3, 0.04, 8, new Color('#2a3a44').convertSRGBToLinear());
  for (const sx of [-1, 1]) b.boxOn(sx * 0.3, 0.42, 0, 0.07, 0.75, 0.07, C.beam);
  b.gableRoof(0, 1.17, 0, 0.9, 0.7, 0.3, C.roofThatch, 0, 0.12);
  b.bar(0, 1.05, 0, 0.06, 0.6, 6, C.beam, 'x');
  b.box(0, 0.75, 0, 0.14, 0.16, 0.14, C.wallWood);
  // A dressed kerb, then a trough and a lantern: a village square forming.
  if (lv >= 2) {
    b.cylinder(0, -0.04, 0, 0.62, 0.08, 10, C.wallStoneDark);
    addTrough(b, 0.85, 0.2);
  }
  if (lv >= 3) {
    b.cylinder(-0.85, 0, -0.2, 0.06, 1.15, 6, C.beam);
    b.box(-0.85, 1.22, -0.2, 0.18, 0.2, 0.18, C.metal);
    out.lights.push({ x: -0.85, y: 1.22, z: -0.2, color: new Color('#ffcf7a'), intensity: 1.1 });
    addFlowerBed(b, 0, 0.95, 1);
  }
  return 1.5;
}

function buildTower(b: MeshBuilder, W: number, D: number, out: BuildingVisual, lv = 1): number {
  const w = Math.min(W, D) - 0.5;
  // Rank raises the watch: a taller frame sees further, which is exactly what
  // a level does to the building's radius.
  const legH = 2.6 + (lv - 1) * 0.55;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box((w / 2) * sx, legH / 2, (w / 2) * sz, 0.12, legH, 0.12, C.beam, 0, sz * 0.06, -sx * 0.06);
    }
  }
  b.box(0, legH / 2, 0, w * 1.05, 0.08, w * 1.05, C.beam);
  b.boxOn(0, legH, 0, w + 0.45, 0.65, w + 0.45, C.wallWood);
  b.gableRoof(0, legH + 0.65, 0, w + 0.45, w + 0.45, 0.45, C.roofThatch, 0);
  // Water barrels at the base.
  for (const sx of [-1, 1]) {
    b.cylinder(sx * (w / 2 + 0.25), 0, w / 2 + 0.25, 0.18, 0.36, 8, C.wallWoodDark);
  }
  b.box(0, legH + 0.35, w / 2 + 0.3, 0.3, 0.3, 0.05, C.clothRed);
  // A bell to raise the alarm, and a beacon brazier once it is properly manned.
  b.cylinder(w / 2 + 0.05, legH + 0.5, 0, 0.11, 0.18, 6, C.metal, 0.6);
  if (lv >= 3) {
    b.cylinder(0, legH + 1.1, 0, 0.2, 0.18, 8, C.metal, 0.8);
    b.cone(0, legH + 1.24, 0, 0.15, 0.26, 5, C.ember);
    out.lights.push({ x: 0, y: legH + 1.3, z: 0, color: new Color('#ff8a32'), intensity: 1.6 });
  }
  out.lights.push({ x: 0, y: legH + 0.3, z: 0, color: new Color('#ffb04a'), intensity: 1.1 });
  return legH + 1.2;
}

// ── Small details ──────────────────────────────────────────────────────────

function addLogPile(b: MeshBuilder, x: number, y: number, z: number): void {
  for (let i = 0; i < 3; i++) {
    b.bar(x, y + 0.11 + i * 0.17, z - 0.02 * i, 0.09, 0.62, 6, C.beam, 'x');
    if (i < 2) b.bar(x, y + 0.11 + i * 0.17, z + 0.2, 0.09, 0.62, 6, C.frame, 'x');
  }
}

function addSaplings(b: MeshBuilder, W: number, D: number): void {
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + 0.5 + (i % 2) * 0.45;
    const z = D / 2 - 0.5 - Math.floor(i / 2) * 0.4;
    b.cylinder(x, 0, z, 0.03, 0.22, 4, C.beam);
    b.cone(x, 0.18, z, 0.11, 0.26, 5, new Color('#4f9140').convertSRGBToLinear());
  }
}

function addDryingRack(b: MeshBuilder, x: number, z: number): void {
  for (const sx of [-1, 1]) b.boxOn(x + sx * 0.32, 0, z, 0.06, 0.8, 0.06, C.beam);
  b.box(x, 0.78, z, 0.72, 0.05, 0.05, C.beam);
  for (let i = -1; i <= 1; i++) {
    b.box(x + i * 0.22, 0.56, z, 0.12, 0.34, 0.04, new Color('#9c4a3a').convertSRGBToLinear());
  }
}

function addNets(b: MeshBuilder, W: number, D: number): void {
  for (const sx of [-1, 1]) {
    b.boxOn(sx * (W / 2 - 0.5), 0, D / 2 - 0.6, 0.06, 0.9, 0.06, C.beam);
    b.box(sx * (W / 2 - 0.5), 0.55, D / 2 - 0.6, 0.4, 0.5, 0.03, C.cloth);
  }
}

function addBoat(b: MeshBuilder, x: number, z: number, scale: number): void {
  b.box(x, -0.05, z, 0.42 * scale, 0.18 * scale, 1.05 * scale, C.wallWoodDark, 0.25);
  b.box(x, 0.06, z, 0.3 * scale, 0.06 * scale, 0.9 * scale, C.wallWood, 0.25);
  b.cylinder(x, 0.08, z, 0.035 * scale, 0.85 * scale, 4, C.beam);
  b.box(x + 0.02, 0.6 * scale, z, 0.03, 0.55 * scale, 0.45 * scale, C.cloth, 0.25);
}

function addChimney(
  b: MeshBuilder,
  out: BuildingVisual,
  x: number,
  z: number,
  h: number,
  col: Color,
): void {
  b.boxOn(x, 0.8, z, 0.28, h, 0.28, col);
  b.boxOn(x, 0.8 + h, z, 0.36, 0.08, 0.36, col.clone().multiplyScalar(0.85));
  out.smoke = { x, y: 0.95 + h, z };
}

function addAnvil(b: MeshBuilder, x: number, z: number): void {
  b.cylinder(x, 0, z, 0.13, 0.28, 6, C.beam);
  b.box(x, 0.36, z, 0.32, 0.12, 0.16, C.metal);
  b.box(x, 0.3, z, 0.16, 0.1, 0.13, C.metal);
}

function addBarrels(b: MeshBuilder, x: number, z: number): void {
  for (let i = 0; i < 3; i++) {
    const ox = (i % 2) * 0.4;
    const oz = Math.floor(i / 2) * 0.4;
    b.cylinder(x + ox, 0, z - oz, 0.18, 0.4, 8, C.wallWoodDark, 0.92);
    b.cylinder(x + ox, 0.14, z - oz, 0.19, 0.05, 8, C.metal);
  }
}

function addClothLine(b: MeshBuilder, W: number, D: number): void {
  const colors = [C.clothRed, C.clothBlue, C.cloth];
  for (const sx of [-1, 1]) b.boxOn(sx * (W / 2 - 0.35), 0, D / 2 - 0.4, 0.05, 1.0, 0.05, C.beam);
  for (let i = 0; i < 3; i++) {
    b.box(-0.5 + i * 0.5, 0.72, D / 2 - 0.4, 0.34, 0.42, 0.02, colors[i % 3]);
  }
}

function addVats(b: MeshBuilder, W: number, D: number): void {
  for (let i = 0; i < 3; i++) {
    const x = -W / 2 + 0.55 + i * 0.5;
    b.cylinder(x, 0, D / 2 - 0.5, 0.21, 0.32, 8, C.wallWoodDark);
    b.cylinder(x, 0.3, D / 2 - 0.5, 0.18, 0.04, 8, new Color('#5a4630').convertSRGBToLinear());
  }
}

function addWorkbench(b: MeshBuilder, x: number, z: number): void {
  b.boxOn(x, 0.42, z, 0.8, 0.07, 0.4, C.wallWood);
  for (const sx of [-1, 1]) b.boxOn(x + sx * 0.32, 0, z, 0.06, 0.42, 0.06, C.beam);
  b.boxOn(x - 0.2, 0.49, z, 0.16, 0.1, 0.16, C.frame);
}

function addCart(b: MeshBuilder, x: number, z: number): void {
  b.boxOn(x, 0.22, z, 0.75, 0.3, 0.45, C.wallWood, 0.3);
  for (const sx of [-1, 1]) {
    b.bar(x + sx * 0.3, 0.2, z, 0.2, 0.07, 8, C.beam, 'x');
  }
  b.box(x + 0.45, 0.3, z, 0.5, 0.05, 0.05, C.beam, 0.3);
}

function addHerbs(b: MeshBuilder, W: number, D: number): void {
  for (let i = 0; i < 5; i++) {
    const x = -W / 2 + 0.4 + (i % 3) * 0.35;
    const z = D / 2 - 0.4 - Math.floor(i / 3) * 0.32;
    b.blob(x, 0.1, z, 0.11, 0.1, 0.11, new Color('#5f8a76').convertSRGBToLinear());
  }
}

function addSawBlade(b: MeshBuilder, out: BuildingVisual, W: number, D: number): void {
  const rotor = new MeshBuilder();
  rotor.disc(0, 0, 0, 0.42, 0.05, 12, C.metal);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rotor.box(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0, 0.09, 0.09, 0.05, C.metal, 0, 0, a);
  }
  // The blade lies flat, so tip the rotor plane onto its back.
  out.rotor = { geometry: rotor.build(), x: W / 2 - 0.15, y: 0.62, z: 0, yaw: 0, pitch: Math.PI / 2, speed: 4.2 };
  b.boxOn(W / 2 - 0.15, 0, 0, 0.3, 0.55, D * 0.6, C.wallWood);
}

function addWaterWheel(b: MeshBuilder, out: BuildingVisual, W: number, D: number): void {
  const rotor = new MeshBuilder();
  rotor.disc(0, 0, 0, 0.85, 0.1, 12, C.beam);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rotor.box(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0, 0.2, 0.34, 0.5, C.wallWoodDark, 0, 0, a);
  }
  // The wheel faces along +X, on the river side of the mill.
  out.rotor = { geometry: rotor.build(), x: W / 2 - 0.1, y: 0.7, z: D * 0.25, yaw: Math.PI / 2, pitch: 0, speed: 1.1 };
  b.boxOn(W / 2 - 0.35, 0, D * 0.25, 0.2, 1.2, 0.3, C.beam);
}

// ── Construction and ruins ─────────────────────────────────────────────────

function buildScaffold(b: MeshBuilder, W: number, D: number, progress: number): void {
  const w = W - 0.35;
  const d = D - 0.35;
  b.box(0, -0.03, 0, w + 0.3, 0.08, d + 0.3, C.dirt);
  const h = 0.3 + progress * 0.9;
  b.boxOn(0, 0, 0, w * 0.92, h, d * 0.92, C.wallStone.clone().multiplyScalar(0.85));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.boxOn((w / 2) * sx, 0, (d / 2) * sz, 0.07, 1.35, 0.07, C.scaffold);
    }
  }
  for (const sx of [-1, 1]) {
    b.box((w / 2) * sx, 0.7, 0, 0.05, 0.05, d, C.scaffold);
    b.box(0, 0.7, (d / 2) * sx, w, 0.05, 0.05, C.scaffold);
  }
  b.box(0, 1.3, 0, w * 0.5, 0.05, 0.4, C.scaffold);
  // Material pile on site.
  b.boxOn(w / 2 + 0.25, 0, -d / 2 - 0.1, 0.3, 0.2, 0.3, C.wallWood, 0.4);
}

function buildRuin(b: MeshBuilder, W: number, D: number, defId: BuildingId): void {
  const w = W - 0.4;
  const d = D - 0.4;
  const seed = defId.length;
  b.box(0, -0.03, 0, w + 0.2, 0.08, d + 0.2, C.dirt);

  // Standing wall fragments, deliberately uneven so each ruin has a profile.
  const heights = [0.95, 0.45, 0.72, 0.3];
  b.boxOn(-w / 2 + 0.1, 0, 0, 0.2, heights[seed % 4], d * 0.85, C.ruin);
  b.boxOn(w / 2 - 0.1, 0, d * 0.22, 0.2, heights[(seed + 1) % 4], d * 0.42, C.ruin);
  b.boxOn(0, 0, -d / 2 + 0.1, w * 0.62, heights[(seed + 2) % 4], 0.2, C.ruin);
  // A lone corner post still upright, the classic silhouette of an abandoned house.
  b.boxOn(w / 2 - 0.14, 0, -d / 2 + 0.14, 0.15, 1.25, 0.15, C.beam);

  // Collapsed roof beams leaning into the rubble.
  b.box(0.2, 0.34, 0.1, 0.1, 0.1, 1.3, C.beam, 0, 0.55, 0.35);
  b.box(-0.3, 0.2, -0.2, 0.1, 0.1, 0.95, C.beam, 0.7, 0.35, 0);
  b.box(0.05, 0.5, -0.4, 0.09, 0.09, 0.8, C.beam, 1.1, -0.4, 0.2);

  // Scattered stone and rotten thatch.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + seed;
    b.blob(Math.cos(a) * w * 0.3, 0.09, Math.sin(a) * d * 0.3, 0.18, 0.12, 0.17, C.ruin);
  }
  b.blob(0, 0.1, d * 0.18, 0.4, 0.09, 0.32, C.roofThatchDark);
}

// ── Rank marks ─────────────────────────────────────────────────────────────

/** Pennant colours cycle so two neighbouring workshops never look identical. */
const PENNANTS = [C.clothRed, C.clothBlue, C.gold, new Color('#5f8a76').convertSRGBToLinear()];

/**
 * The universal "what level is this?" cue. Fields, pastures, wells and roads
 * have no roof to fly a banner from, so they are left alone and read their
 * rank from their own growth instead.
 */
function addRankMarks(
  b: MeshBuilder,
  out: BuildingVisual,
  defId: BuildingId,
  W: number,
  D: number,
  height: number,
  lv: number,
): void {
  if (lv <= 1) return;
  const def = BUILDINGS[defId];
  if (def.category === 'farming' || def.placement.kind === 'paint') return;
  if (defId === 'well') return;

  const pennant = PENNANTS[defId.length % PENNANTS.length];
  const x = W / 2 - 0.35;
  const z = -D / 2 + 0.35;

  // A dressed-stone kerb around the plot. It used to be a full-width slab,
  // which read as a dark platform the building was sitting on top of.
  for (const sz of [-1, 1]) b.boxOn(0, -0.03, (sz * (D - 0.22)) / 2, W - 0.22, 0.09, 0.14, C.wallStone);
  for (const sx of [-1, 1]) b.boxOn((sx * (W - 0.22)) / 2, -0.03, 0, 0.14, 0.09, D - 0.22, C.wallStone);

  const poleH = 0.55 + (lv - 2) * 0.25;
  b.cylinder(x, height, z, 0.035, poleH, 4, C.beam);
  b.box(x + 0.16, height + poleH - 0.16, z, 0.32, 0.22, 0.02, pennant);
  if (lv >= 3) {
    b.cylinder(-x, height, -z, 0.035, poleH, 4, C.beam);
    b.box(-x + 0.16, height + poleH - 0.16, -z, 0.32, 0.22, 0.02, pennant);
    // Gilded finial on the ridge, unmistakable even from the minimap zoom.
    b.cone(0, height, 0, 0.13, 0.3, 6, C.gold);
    b.blob(0, height + 0.36, 0, 0.09, 0.09, 0.09, C.gold);
  }
  out.lights.push({
    x,
    y: height + poleH * 0.5,
    z,
    color: new Color('#ffd28a'),
    intensity: 0.35 * lv,
  });
}

// ── Character props ────────────────────────────────────────────────────────

/** A hide tent on poles. The hunters' camp is unmistakable with one. */
function addTent(b: MeshBuilder, x: number, z: number, scale = 1, hide = C.wallWoodDark): void {
  const r = 0.46 * scale;
  const h = 0.85 * scale;
  b.cone(x, 0, z, r, h, 7, hide);
  // Poles crossing above the apex, and a dark doorway flap.
  for (const s of [-1, 1]) {
    b.box(x + s * 0.1, h * 0.62, z, 0.04, h * 1.25, 0.04, C.beam, 0, 0, s * 0.18);
  }
  b.box(x, h * 0.26, z + r * 0.86, 0.2 * scale, h * 0.5, 0.03, new Color('#2b2119').convertSRGBToLinear());
}

/** Stone ring, crossed logs, a flame — and the light and smoke that sell it. */
function addCampfire(b: MeshBuilder, out: BuildingVisual, x: number, z: number, scale = 1): void {
  const r = 0.3 * scale;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.blob(x + Math.cos(a) * r, 0.04, z + Math.sin(a) * r, 0.09, 0.06, 0.09, C.wallStone);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    b.box(x, 0.11, z, 0.07, 0.07, r * 1.7, C.beam, a, 0.42, 0);
  }
  b.cone(x, 0.14, z, 0.16 * scale, 0.34 * scale, 5, C.ember);
  b.cone(x, 0.22, z, 0.09 * scale, 0.2 * scale, 5, new Color('#f2c455').convertSRGBToLinear());
  out.smoke = { x, y: 0.5, z };
  out.lights.push({ x, y: 0.22, z, color: new Color('#ff8a32'), intensity: 1.4 });
}

/** A cooking pot on a tripod, next to the fire. */
function addCookPot(b: MeshBuilder, x: number, z: number): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(x + Math.cos(a) * 0.14, 0.22, z + Math.sin(a) * 0.14, 0.035, 0.46, 0.035, C.beam, 0, Math.cos(a) * 0.3, Math.sin(a) * 0.3);
  }
  b.cylinder(x, 0.2, z, 0.13, 0.16, 7, C.metal, 0.85);
}

/** Sawn boards stacked with spacers — the sawmill's whole point, made visible. */
function addPlankStack(b: MeshBuilder, x: number, z: number, count = 5, ry = 0): void {
  for (let i = 0; i < count; i++) {
    b.boxOn(x, 0.04 * i, z, 0.9, 0.035, 0.42, i % 2 ? C.wallWood : C.frame, ry + (i % 2 ? 0.03 : -0.02));
  }
}

/** Trestle, a half-cut log and a pile of sawdust. */
function addSawhorse(b: MeshBuilder, x: number, z: number): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(x + sx * 0.22, 0.18, z + sz * 0.12, 0.05, 0.38, 0.05, C.beam, 0, sz * 0.22, -sx * 0.22);
    }
  }
  b.box(x, 0.38, z, 0.6, 0.07, 0.09, C.beam);
  b.bar(x, 0.46, z, 0.11, 0.7, 6, C.frame, 'x');
  b.blob(x + 0.45, 0.05, z + 0.22, 0.22, 0.07, 0.2, new Color('#d8c08a').convertSRGBToLinear());
}

/**
 * A hanging trade sign. Half the workshops share one archetype, so the plaque
 * over the door is what actually tells a bakery from a tannery at play zoom.
 */
function addTradeSign(
  b: MeshBuilder,
  W: number,
  D: number,
  plaque: Color,
  emblem: 'round' | 'square' | 'tall' | 'cross' | 'wedge',
  z = D / 2 + 0.06,
): void {
  const x = W / 2 - 0.22;
  b.cylinder(x, 0.95, z - 0.14, 0.04, 0.42, 5, C.beam);
  b.box(x, 1.32, z, 0.05, 0.05, 0.4, C.beam);
  b.box(x, 1.12, z + 0.14, 0.03, 0.34, 0.34, plaque);
  const e = new Color('#f3e9d6').convertSRGBToLinear();
  switch (emblem) {
    case 'round':
      b.blob(x - 0.02, 1.12, z + 0.14, 0.02, 0.1, 0.1, e);
      break;
    case 'square':
      b.box(x - 0.02, 1.12, z + 0.14, 0.02, 0.16, 0.16, e);
      break;
    case 'tall':
      b.box(x - 0.02, 1.12, z + 0.14, 0.02, 0.22, 0.08, e);
      break;
    case 'cross':
      b.box(x - 0.02, 1.12, z + 0.14, 0.02, 0.22, 0.06, e);
      b.box(x - 0.02, 1.12, z + 0.14, 0.02, 0.06, 0.22, e);
      break;
    case 'wedge':
      b.cone(x - 0.02, 1.0, z + 0.14, 0.11, 0.24, 3, e);
      break;
  }
}

/** Grindstone on a frame: millers, masons and smiths all keep one. */
function addGrindstone(b: MeshBuilder, x: number, z: number): void {
  for (const sx of [-1, 1]) b.boxOn(x + sx * 0.2, 0, z, 0.05, 0.34, 0.05, C.beam);
  b.disc(x, 0.38, z, 0.22, 0.08, 10, C.wallStone);
  b.bar(x, 0.38, z, 0.03, 0.5, 5, C.metal, 'x');
}

/** Flour sacks, leaning as sacks do. */
function addSacks(b: MeshBuilder, x: number, z: number, tone: Color): void {
  const offsets: Array<[number, number, number]> = [
    [0, 0, 0.26],
    [0.34, 0.06, 0.23],
    [0.16, -0.3, 0.2],
  ];
  for (const [ox, oz, r] of offsets) {
    b.blob(x + ox, r * 0.82, z + oz, r * 0.75, r, r * 0.7, tone);
  }
}

/** A brick-and-stone oven with its mouth glowing. */
function addOven(b: MeshBuilder, out: BuildingVisual, x: number, z: number): void {
  b.boxOn(x, 0, z, 0.72, 0.34, 0.66, C.wallStone);
  b.cylinder(x, 0.34, z, 0.34, 0.34, 8, C.wallBrick, 0.72);
  b.cone(x, 0.68, z, 0.3, 0.22, 8, C.wallBrick);
  b.box(x, 0.44, z + 0.33, 0.26, 0.2, 0.05, new Color('#ff7a2a').convertSRGBToLinear());
  b.box(x + 0.44, 0.5, z + 0.1, 0.55, 0.04, 0.12, C.beam, 0, 0, 0.25);
  out.lights.push({ x, y: 0.44, z: z + 0.36, color: new Color('#ff8f3a'), intensity: 1.2 });
}

/** A loom, unmistakably a loom even at four hundred triangles. */
function addLoom(b: MeshBuilder, x: number, z: number): void {
  for (const sx of [-1, 1]) {
    b.boxOn(x + sx * 0.3, 0, z, 0.06, 0.78, 0.06, C.beam);
    b.boxOn(x + sx * 0.3, 0, z + 0.38, 0.06, 0.62, 0.06, C.beam);
    b.box(x + sx * 0.3, 0.7, z + 0.19, 0.05, 0.05, 0.44, C.beam, 0, 0.3, 0);
  }
  b.box(x, 0.76, z, 0.62, 0.05, 0.05, C.beam);
  // The warp: a taut sheet between the beams.
  b.box(x, 0.46, z + 0.1, 0.56, 0.6, 0.02, C.cloth, 0, 0.35, 0);
  b.box(x, 0.2, z + 0.34, 0.5, 0.04, 0.28, C.wallWood);
}

/** Bellows and a glowing forge hearth. */
function addForge(b: MeshBuilder, out: BuildingVisual, x: number, z: number): void {
  b.boxOn(x, 0, z, 0.56, 0.42, 0.5, C.wallStoneDark);
  b.box(x, 0.46, z, 0.4, 0.1, 0.36, new Color('#ff6a22').convertSRGBToLinear());
  // Bellows: two tapered boards with a nozzle.
  b.box(x - 0.48, 0.42, z, 0.44, 0.1, 0.3, C.wallWoodDark, 0, 0, 0.16);
  b.box(x - 0.48, 0.32, z, 0.44, 0.09, 0.28, C.frame, 0, 0, -0.1);
  b.bar(x - 0.2, 0.4, z, 0.03, 0.22, 5, C.metal, 'x');
  out.lights.push({ x, y: 0.5, z, color: new Color('#ff6a22'), intensity: 1.5 });
}

/** Charcoal heap plus the turf that covers it. */
function addCharcoalHeap(b: MeshBuilder, x: number, z: number): void {
  b.blob(x, 0.16, z, 0.36, 0.2, 0.34, new Color('#2f2c29').convertSRGBToLinear());
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.box(x + Math.cos(a) * 0.3, 0.14, z + Math.sin(a) * 0.3, 0.07, 0.3, 0.07, C.beam, 0, 0, Math.cos(a) * 0.5);
  }
}

/** Beehive skeps on a bench — quiet, but instantly says "someone lives here". */
function addFlowerBed(b: MeshBuilder, x: number, z: number, seed: number): void {
  const blooms = [
    new Color('#d96a7a').convertSRGBToLinear(),
    new Color('#e6c452').convertSRGBToLinear(),
    new Color('#8f7fc4').convertSRGBToLinear(),
  ];
  b.box(x, 0.04, z, 0.78, 0.1, 0.34, new Color('#6b4f36').convertSRGBToLinear());
  for (let i = 0; i < 7; i++) {
    const ox = -0.32 + (i / 6) * 0.64;
    const oz = ((i + seed) % 3) * 0.08 - 0.08;
    b.cylinder(x + ox, 0.08, z + oz, 0.012, 0.14, 4, new Color('#4f8a3c').convertSRGBToLinear());
    b.blob(x + ox, 0.25, z + oz, 0.05, 0.05, 0.05, blooms[(i + seed) % 3]);
  }
}

/** Fish drying on a line, for the piers. */
function addFishLine(b: MeshBuilder, x: number, z: number): void {
  for (const sx of [-1, 1]) b.boxOn(x + sx * 0.36, 0, z, 0.05, 0.72, 0.05, C.beam);
  b.box(x, 0.7, z, 0.76, 0.03, 0.03, C.beam);
  for (let i = -2; i <= 2; i++) {
    b.blob(x + i * 0.16, 0.56, z, 0.05, 0.1, 0.03, new Color('#9fb4bd').convertSRGBToLinear());
  }
}

/** Crates and sacks by a depot door, scaled with its rank. */
function addDepotGoods(b: MeshBuilder, x: number, z: number, lv: number): void {
  b.boxOn(x, 0, z, 0.34, 0.32, 0.34, C.wallWood, 0.25);
  b.boxOn(x + 0.4, 0, z - 0.1, 0.28, 0.26, 0.28, C.wallWoodDark, -0.18);
  if (lv >= 2) {
    b.boxOn(x, 0.32, z, 0.3, 0.26, 0.3, C.frame, -0.12);
    b.cylinder(x - 0.42, 0, z - 0.06, 0.17, 0.36, 8, C.wallWoodDark, 0.92);
  }
  if (lv >= 3) addSacks(b, x + 0.78, z + 0.1, new Color('#c9b98d').convertSRGBToLinear());
}

/** A chopping block with the axe left standing in it. */
function addChoppingBlock(b: MeshBuilder, x: number, z: number): void {
  b.cylinder(x, 0, z, 0.2, 0.32, 8, C.beam);
  b.box(x, 0.52, z, 0.04, 0.38, 0.04, C.frame, 0, 0, 0.22);
  b.box(x + 0.09, 0.68, z, 0.05, 0.14, 0.16, C.metal, 0, 0, 0.22);
  for (let i = 0; i < 3; i++) {
    b.box(x - 0.34 - i * 0.02, 0.05, z + 0.24 - i * 0.14, 0.2, 0.09, 0.1, C.frame, 0.4 + i);
  }
}

/** A frame of potted seedlings — the forester's nursery. */
function addSeedlingFrame(b: MeshBuilder, x: number, z: number, lv: number): void {
  const rows = 2 + lv;
  b.boxOn(x, 0, z, 0.9, 0.26, 0.5, C.wallWoodDark);
  for (let i = 0; i < rows; i++) {
    const ox = -0.32 + (i / Math.max(1, rows - 1)) * 0.64;
    b.cylinder(x + ox, 0.26, z, 0.07, 0.11, 6, new Color('#8a5a34').convertSRGBToLinear());
    b.cone(x + ox, 0.36, z, 0.09, 0.24, 5, new Color('#4f9140').convertSRGBToLinear());
  }
}

/** Wicker baskets, filled. Used by gatherers and by the fishing piers. */
function addBaskets(b: MeshBuilder, x: number, z: number, count: number): void {
  const fills = [
    new Color('#7b4a8a').convertSRGBToLinear(),
    new Color('#a8453c').convertSRGBToLinear(),
    new Color('#9fb4bd').convertSRGBToLinear(),
  ];
  for (let i = 0; i < Math.max(1, count); i++) {
    const ox = (i % 2) * 0.36;
    const oz = Math.floor(i / 2) * -0.34;
    b.cylinder(x + ox, 0, z + oz, 0.17, 0.26, 8, new Color('#b89a62').convertSRGBToLinear(), 1.18);
    b.blob(x + ox, 0.3, z + oz, 0.17, 0.07, 0.17, fills[i % 3]);
  }
}

/** Antlers mounted over a door. Nothing else says "hunting lodge" so fast. */
function addAntlerTrophy(b: MeshBuilder, x: number, z: number, y: number): void {
  const bone = new Color('#d8cdb4').convertSRGBToLinear();
  b.blob(x, y, z, 0.12, 0.14, 0.08, new Color('#6b4f3a').convertSRGBToLinear());
  for (const sx of [-1, 1]) {
    b.box(x + sx * 0.16, y + 0.16, z, 0.05, 0.34, 0.03, bone, 0, 0, -sx * 0.5);
    b.box(x + sx * 0.3, y + 0.3, z, 0.04, 0.22, 0.03, bone, 0, 0, -sx * 0.9);
    b.box(x + sx * 0.24, y + 0.34, z, 0.04, 0.18, 0.03, bone, 0, 0, -sx * 0.2);
  }
}

/** Dressed blocks waiting on the quarry apron. */
function addStoneBlocks(b: MeshBuilder, x: number, z: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const ox = (i % 2) * 0.46;
    const oz = Math.floor(i / 2) * -0.42;
    b.boxOn(x + ox, 0, z + oz, 0.4, 0.3, 0.36, i % 2 ? C.wallStone : C.wallStoneDark, (i % 3) * 0.08);
  }
}

/** Winding house over a deep shaft, with its drum and cable. */
function addWinchHouse(b: MeshBuilder, out: BuildingVisual, x: number, z: number): void {
  b.boxOn(x, 0, z, 0.8, 0.7, 0.7, C.wallWood);
  b.gableRoof(x, 0.7, z, 0.8, 0.7, 0.34, C.roofSlate, 0, 0.12);
  b.bar(x, 0.45, z, 0.18, 0.5, 8, C.beam, 'x');
  b.box(x - 0.45, 0.45, z, 0.32, 0.04, 0.04, C.metal);
  out.lights.push({ x, y: 0.45, z: z + 0.36, color: new Color('#ffb861'), intensity: 0.5 });
}

/** A stone water trough. Pastures, wells and squares all want one. */
function addTrough(b: MeshBuilder, x: number, z: number): void {
  b.boxOn(x, 0, z, 0.9, 0.22, 0.34, C.wallStone);
  b.box(x, 0.24, z, 0.78, 0.04, 0.24, new Color('#4a8ba8').convertSRGBToLinear());
}

/** The smith's slack tub, steaming faintly. */
function addQuenchTub(b: MeshBuilder, x: number, z: number): void {
  b.cylinder(x, 0, z, 0.2, 0.3, 8, C.wallWoodDark, 0.94);
  b.cylinder(x, 0.3, z, 0.17, 0.03, 8, new Color('#3f5a68').convertSRGBToLinear());
  b.cylinder(x, 0.12, z, 0.21, 0.04, 8, C.metal);
}

/** A rack of finished tapers, each one alight. */
function addCandleRack(b: MeshBuilder, out: BuildingVisual, x: number, z: number): void {
  b.boxOn(x, 0, z, 0.72, 0.5, 0.3, C.wallWood);
  const wax = new Color('#f2e3a8').convertSRGBToLinear();
  for (let i = 0; i < 5; i++) {
    const ox = -0.26 + (i / 4) * 0.52;
    b.cylinder(x + ox, 0.5, z, 0.028, 0.2, 5, wax);
    b.blob(x + ox, 0.73, z, 0.022, 0.035, 0.022, new Color('#ffd16a').convertSRGBToLinear());
  }
  out.lights.push({ x, y: 0.72, z, color: new Color('#ffd16a'), intensity: 0.8 });
}
