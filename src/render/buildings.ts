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

export function buildingVisual(defId: BuildingId, state: BuildingState): BuildingVisual {
  const key = `${defId}:${state}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const v = make(defId, state);
  cache.set(key, v);
  return v;
}

export function clearBuildingCache(): void {
  for (const v of cache.values()) {
    v.geometry.dispose();
    v.rotor?.geometry.dispose();
  }
  cache.clear();
}

function make(defId: BuildingId, state: BuildingState): BuildingVisual {
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
    case 'scholars_hall':
      out.height = buildHall(b, W, D, C.wallPlaster, C.roofSlate, out, 1.15);
      break;

    // ── Housing ──────────────────────────────────────────────────────────
    case 'shack':
      out.height = buildHut(b, W, D, C.wallWoodDark, C.roofThatch, out, 1.0, true);
      break;
    case 'cottage':
      out.height = buildHut(b, W, D, C.wallPlaster, C.roofThatch, out, 1.0, false);
      break;
    case 'house':
      out.height = buildTwoStorey(b, W, D, C.wallStone, C.wallPlaster, C.roofTile, out);
      break;
    case 'manor':
      out.height = buildManor(b, W, D, out);
      break;

    // ── Storage ──────────────────────────────────────────────────────────
    case 'storehouse':
      out.height = buildBarn(b, W, D, C.wallWood, C.roofThatch, out);
      break;
    case 'warehouse':
      out.height = buildBarn(b, W, D, C.wallStone, C.roofSlate, out);
      break;
    case 'granary':
      out.height = buildGranary(b, W, D, out);
      break;

    // ── Gathering ────────────────────────────────────────────────────────
    case 'woodcutter_camp':
      out.height = buildOpenCamp(b, W, D, C.wallWood, C.roofThatch, out);
      addLogPile(b, W / 2 - 0.6, 0, -D / 2 + 0.6);
      break;
    case 'lumber_camp':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out);
      addLogPile(b, W / 2 - 0.7, 0, -D / 2 + 0.7);
      addLogPile(b, -W / 2 + 0.7, 0, D / 2 - 0.7);
      break;
    case 'forester_hut':
      out.height = buildHut(b, W, D, C.wallWood, C.roofThatch, out, 0.8, false);
      addSaplings(b, W, D);
      break;
    case 'gatherer_hut':
      out.height = buildOpenCamp(b, W, D, C.wallWood, C.roofThatch, out);
      b.blob(W / 2 - 0.5, 0.2, D / 2 - 0.5, 0.26, 0.2, 0.26, C.cloth);
      break;
    case 'hunter_camp':
      out.height = buildOpenCamp(b, W, D, C.wallWoodDark, C.roofThatch, out);
      addDryingRack(b, -W / 2 + 0.6, D / 2 - 0.6);
      break;
    case 'hunting_lodge':
      out.height = buildWorkshop(b, W, D, C.wallWoodDark, C.roofThatch, out);
      addDryingRack(b, -W / 2 + 0.8, D / 2 - 0.8);
      addDryingRack(b, W / 2 - 0.8, D / 2 - 0.8);
      break;
    case 'fisher_hut':
      out.height = buildPier(b, W, D, 0.8, out);
      break;
    case 'fishing_pier':
      out.height = buildPier(b, W, D, 1.0, out);
      addNets(b, W, D);
      break;
    case 'fishing_dock':
      out.height = buildPier(b, W, D, 1.15, out);
      addNets(b, W, D);
      addBoat(b, W / 2 - 0.2, D / 2 - 0.6, 0.9);
      break;
    case 'fishing_harbour':
      out.height = buildPier(b, W, D, 1.35, out);
      addNets(b, W, D);
      addBoat(b, W / 2 - 0.3, D / 2 - 0.8, 1.35);
      addBoat(b, -W / 2 + 0.6, D / 2 - 0.7, 1.15);
      break;

    // ── Extraction ───────────────────────────────────────────────────────
    case 'quarry':
    case 'great_quarry':
      out.height = buildQuarry(b, W, D, out);
      break;
    case 'clay_pit':
      out.height = buildPit(b, W, D, new Color('#b0713f').convertSRGBToLinear(), out);
      break;
    case 'coal_mine':
      out.height = buildMine(b, W, D, new Color('#3a3d43').convertSRGBToLinear(), out);
      break;
    case 'iron_mine':
      out.height = buildMine(b, W, D, new Color('#8a5e42').convertSRGBToLinear(), out);
      break;
    case 'gold_mine':
      out.height = buildMine(b, W, D, C.gold, out);
      break;
    case 'deep_mine':
      out.height = buildMine(b, W, D, new Color('#3a3d43').convertSRGBToLinear(), out);
      addHeadframe(b, 0, 0);
      break;

    // ── Farming ──────────────────────────────────────────────────────────
    case 'wheat_field':
      out.height = buildField(b, W, D, C.crop, out);
      break;
    case 'flax_field':
      out.height = buildField(b, W, D, new Color('#93b089').convertSRGBToLinear(), out);
      break;
    case 'chicken_coop':
      out.height = buildPasture(b, W, D, 'chicken', out);
      break;
    case 'sheep_pasture':
      out.height = buildPasture(b, W, D, 'sheep', out);
      break;
    case 'cattle_pasture':
      out.height = buildPasture(b, W, D, 'cattle', out);
      break;

    // ── Industry & crafting ──────────────────────────────────────────────
    case 'sawmill':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out);
      addSawBlade(b, out, W, D);
      addLogPile(b, -W / 2 + 0.7, 0, -D / 2 + 0.7);
      break;
    case 'water_sawmill':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofSlate, out);
      addWaterWheel(b, out, W, D);
      break;
    case 'charcoal_burner':
      out.height = buildKiln(b, W, D, out, new Color('#4b4642').convertSRGBToLinear());
      break;
    case 'brick_kiln':
      out.height = buildKiln(b, W, D, out, C.wallBrick);
      break;
    case 'smelter':
      out.height = buildWorkshop(b, W, D, C.wallStone, C.roofSlate, out);
      addChimney(b, out, W / 2 - 0.6, D / 2 - 0.6, 1.6, C.wallStoneDark);
      break;
    case 'blacksmith':
      out.height = buildWorkshop(b, W, D, C.wallStone, C.roofTile, out);
      addChimney(b, out, W / 2 - 0.5, -D / 2 + 0.5, 1.2, C.wallStoneDark);
      addAnvil(b, -W / 2 + 0.7, D / 2 - 0.7);
      break;
    case 'goldsmith':
      out.height = buildWorkshop(b, W, D, C.wallBrick, C.roofTile, out);
      addChimney(b, out, W / 2 - 0.4, -D / 2 + 0.4, 0.9, C.wallBrick);
      break;
    case 'butcher':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out);
      addDryingRack(b, -W / 2 + 0.5, D / 2 - 0.5);
      break;
    case 'smokehouse':
      out.height = buildKiln(b, W, D, out, C.wallWoodDark);
      break;
    case 'windmill':
      out.height = buildWindmill(b, W, D, out);
      break;
    case 'bakery':
      out.height = buildWorkshop(b, W, D, C.wallPlaster, C.roofTile, out);
      addChimney(b, out, W / 2 - 0.4, D / 2 - 0.4, 1.0, C.wallBrick);
      break;
    case 'brewery':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out);
      addBarrels(b, -W / 2 + 0.6, D / 2 - 0.6);
      break;
    case 'weaver':
    case 'tailor':
      out.height = buildWorkshop(b, W, D, C.wallPlaster, C.roofThatch, out);
      addClothLine(b, W, D);
      break;
    case 'tannery':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out);
      addVats(b, W, D);
      break;
    case 'cobbler':
    case 'carpenter':
    case 'fletcher':
      out.height = buildWorkshop(b, W, D, C.wallWood, C.roofThatch, out);
      addWorkbench(b, -W / 2 + 0.7, D / 2 - 0.7);
      break;
    case 'chandlery':
      out.height = buildWorkshop(b, W, D, C.wallPlaster, C.roofThatch, out);
      addChimney(b, out, W / 2 - 0.4, D / 2 - 0.4, 0.8, C.wallBrick);
      break;

    // ── Services ─────────────────────────────────────────────────────────
    case 'market':
    case 'grand_market':
      out.height = buildMarket(b, W, D, out);
      break;
    case 'trade_post':
      out.height = buildWorkshop(b, W, D, C.wallPlaster, C.roofTile, out);
      addCart(b, -W / 2 + 0.9, D / 2 - 0.8);
      break;
    case 'chapel':
      out.height = buildChapel(b, W, D, out);
      break;
    case 'tavern':
      out.height = buildTavern(b, W, D, out);
      break;
    case 'well':
      out.height = buildWell(b, out);
      break;
    case 'firewatch':
      out.height = buildTower(b, W, D, out);
      break;
    case 'healer_hut':
      out.height = buildHut(b, W, D, C.wallPlaster, C.roofThatch, out, 0.9, false);
      addHerbs(b, W, D);
      break;

    default:
      out.height = buildHut(b, W, D, C.wallWood, C.roofThatch, out, 0.9, false);
      break;
  }

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
  const w = W - 0.4;
  const d = D - 0.4;
  const h = 0.72;
  // Lean-to: back wall plus a slanted roof on posts.
  b.boxOn(0, 0, -d / 2, w, h, 0.12, wall);
  for (const sx of [-1, 1]) b.boxOn((w / 2 - 0.08) * sx, 0, d / 2 - 0.08, 0.12, h * 0.85, 0.12, C.beam);
  b.box(0, h + 0.18, 0, w + 0.24, 0.09, d + 0.2, roof, 0, -0.22, 0);
  out.lights.push({ x: 0, y: 0.3, z: 0, color: new Color('#ff9a4a'), intensity: 0.35 });
  return h + 0.4;
}

function buildWorkshop(
  b: MeshBuilder,
  W: number,
  D: number,
  wall: Color,
  roof: Color,
  out: BuildingVisual,
): number {
  const w = W - 0.4;
  const d = D - 0.4;
  const wallH = 1.0;
  b.boxOn(0, 0, 0, w, wallH, d, wall);
  for (const sx of [-1, 1]) {
    b.boxOn((w / 2 - 0.07) * sx, 0, d / 2 - 0.07, 0.14, wallH, 0.14, C.beam);
    b.boxOn((w / 2 - 0.07) * sx, 0, -d / 2 + 0.07, 0.14, wallH, 0.14, C.beam);
  }
  // Half-timbering, the signature of the style.
  b.box(0, wallH * 0.55, d / 2 + 0.001, w, 0.1, 0.03, C.beam);
  b.gableRoof(0, wallH, 0, w, d, 0.7, roof, 0);
  b.boxOn(0, 0, d / 2 - 0.01, 0.42, wallH * 0.72, 0.09, C.beam);
  out.lights.push({ x: 0, y: wallH * 0.55, z: d / 2, color: new Color('#ffa24a'), intensity: 0.7 });
  return wallH + 0.7;
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

function buildField(b: MeshBuilder, W: number, D: number, crop: Color, out: BuildingVisual): number {
  const w = W - 0.2;
  const d = D - 0.2;
  b.box(0, -0.04, 0, w, 0.1, d, C.dirt);
  const rows = Math.max(3, Math.floor(d / 0.55));
  for (let i = 0; i < rows; i++) {
    const z = -d / 2 + 0.3 + (i * (d - 0.6)) / Math.max(1, rows - 1);
    b.boxOn(0, 0.02, z, w - 0.25, 0.22, 0.2, crop);
    b.boxOn(0, 0.02, z, w - 0.25, 0.3, 0.07, crop.clone().multiplyScalar(1.1));
  }
  // A scarecrow reads instantly as "this is a farm".
  b.cylinder(w / 2 - 0.4, 0, -d / 2 + 0.4, 0.05, 0.85, 4, C.beam);
  b.box(w / 2 - 0.4, 0.62, -d / 2 + 0.4, 0.6, 0.06, 0.06, C.beam);
  b.blob(w / 2 - 0.4, 0.92, -d / 2 + 0.4, 0.14, 0.14, 0.14, C.roofThatch);
  out.lights = [];
  return 0.5;
}

function buildPasture(
  b: MeshBuilder,
  W: number,
  D: number,
  animal: 'chicken' | 'sheep' | 'cattle',
  out: BuildingVisual,
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
  const count = animal === 'chicken' ? 7 : animal === 'sheep' ? 5 : 4;
  const body =
    animal === 'chicken'
      ? new Color('#e8e2d4')
      : animal === 'sheep'
        ? new Color('#e4ded0')
        : new Color('#8c6a4a');
  body.convertSRGBToLinear();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.6;
    const r = Math.min(w, d) * 0.28;
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

function buildWindmill(b: MeshBuilder, W: number, D: number, out: BuildingVisual): number {
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
    const len = 1.5;
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

function buildMarket(b: MeshBuilder, W: number, D: number, out: BuildingVisual): number {
  const w = W - 0.3;
  const d = D - 0.3;
  b.box(0, -0.03, 0, w, 0.08, d, new Color('#9a8a6a').convertSRGBToLinear());
  const stallColors = [C.clothRed, C.clothBlue, C.cloth, C.roofThatch];
  const cols = Math.max(2, Math.floor(w / 1.5));
  const rows = Math.max(2, Math.floor(d / 1.5));
  let n = 0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if ((i + j) % 2 === 1) continue;
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

function buildChapel(b: MeshBuilder, W: number, D: number, out: BuildingVisual): number {
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
  return 4.1;
}

function buildTavern(b: MeshBuilder, W: number, D: number, out: BuildingVisual): number {
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
  return h;
}

function buildWell(b: MeshBuilder, out: BuildingVisual): number {
  b.cylinder(0, 0, 0, 0.36, 0.42, 8, C.wallStone);
  b.cylinder(0, 0.42, 0, 0.3, 0.04, 8, new Color('#2a3a44').convertSRGBToLinear());
  for (const sx of [-1, 1]) b.boxOn(sx * 0.3, 0.42, 0, 0.07, 0.75, 0.07, C.beam);
  b.gableRoof(0, 1.17, 0, 0.9, 0.7, 0.3, C.roofThatch, 0, 0.12);
  b.bar(0, 1.05, 0, 0.06, 0.6, 6, C.beam, 'x');
  b.box(0, 0.75, 0, 0.14, 0.16, 0.14, C.wallWood);
  out.lights = [];
  return 1.5;
}

function buildTower(b: MeshBuilder, W: number, D: number, out: BuildingVisual): number {
  const w = Math.min(W, D) - 0.5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box((w / 2) * sx, 1.3, (w / 2) * sz, 0.12, 2.6, 0.12, C.beam, 0, sz * 0.06, -sx * 0.06);
    }
  }
  b.box(0, 1.3, 0, w * 1.05, 0.08, w * 1.05, C.beam);
  b.boxOn(0, 2.6, 0, w + 0.45, 0.65, w + 0.45, C.wallWood);
  b.gableRoof(0, 3.25, 0, w + 0.45, w + 0.45, 0.45, C.roofThatch, 0);
  // Water barrels at the base.
  for (const sx of [-1, 1]) {
    b.cylinder(sx * (w / 2 + 0.25), 0, w / 2 + 0.25, 0.18, 0.36, 8, C.wallWoodDark);
  }
  b.box(0, 2.95, w / 2 + 0.3, 0.3, 0.3, 0.05, C.clothRed);
  out.lights.push({ x: 0, y: 2.9, z: 0, color: new Color('#ffb04a'), intensity: 1.1 });
  return 3.8;
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
