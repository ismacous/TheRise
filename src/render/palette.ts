import { Color } from 'three';
import type { Season } from '../sim/types';

export interface SeasonPalette {
  grass: Color;
  grassAlt: Color;
  forestFloor: Color;
  rock: Color;
  rockAlt: Color;
  sand: Color;
  dirt: Color;
  waterShallow: Color;
  waterDeep: Color;
  foliage: Color[];
  trunk: Color;
  sky: Color;
  fog: Color;
  sunColor: Color;
  ambient: Color;
  /** 0..1 amount of snow dusting on roofs and ground. */
  snow: number;
}

const c = (hex: string): Color => new Color(hex).convertSRGBToLinear();

export const PALETTES: Record<Season, SeasonPalette> = {
  spring: {
    grass: c('#6d9e48'),
    grassAlt: c('#7cab52'),
    forestFloor: c('#4f7d3c'),
    rock: c('#8d9099'),
    rockAlt: c('#7a7d86'),
    sand: c('#d8c79c'),
    dirt: c('#987a54'),
    waterShallow: c('#5aa0b4'),
    waterDeep: c('#2d6480'),
    foliage: [c('#4f9140'), c('#5aa049'), c('#year'), c('#68a84e')],
    trunk: c('#6b4a2c'),
    sky: c('#8fc4e0'),
    fog: c('#b9d6e4'),
    sunColor: c('#fff3dc'),
    ambient: c('#8fb4d0'),
    snow: 0,
  },
  summer: {
    grass: c('#76a84a'),
    grassAlt: c('#84b155'),
    forestFloor: c('#4a7a36'),
    rock: c('#93959c'),
    rockAlt: c('#7f828a'),
    sand: c('#e0cfa2'),
    dirt: c('#a08258'),
    waterShallow: c('#59a8bd'),
    waterDeep: c('#2b6c8a'),
    foliage: [c('#478236'), c('#4e8d3c'), c('#3f7530'), c('#559644')],
    trunk: c('#6b4a2c'),
    sky: c('#9fd2ea'),
    fog: c('#cbe2ec'),
    sunColor: c('#fff6e0'),
    ambient: c('#9cc0d8'),
    snow: 0,
  },
  autumn: {
    grass: c('#94a04c'),
    grassAlt: c('#a2a854'),
    forestFloor: c('#6e6a36'),
    rock: c('#8a8c92'),
    rockAlt: c('#777a82'),
    sand: c('#d4c094'),
    dirt: c('#93744c'),
    waterShallow: c('#548fa0'),
    waterDeep: c('#2b5a72'),
    foliage: [c('#c07a28'), c('#b0591f'), c('#9c7a2a'), c('#c9942f')],
    trunk: c('#5f4227'),
    sky: c('#b8c7cc'),
    fog: c('#ccd3d2'),
    sunColor: c('#ffe8c0'),
    ambient: c('#a8b0b6'),
    snow: 0,
  },
  winter: {
    grass: c('#cdd8dc'),
    grassAlt: c('#dbe4e7'),
    forestFloor: c('#a8b6b4'),
    rock: c('#9aa0a6'),
    rockAlt: c('#868c93'),
    sand: c('#d3d2c8'),
    dirt: c('#8f857a'),
    waterShallow: c('#6f97a6'),
    waterDeep: c('#33586b'),
    foliage: [c('#3d5c42'), c('#456449'), c('#375239'), c('#4c6b4f')],
    trunk: c('#54402c'),
    sky: c('#c6d4de'),
    fog: c('#dbe5ea'),
    sunColor: c('#e8eef6'),
    ambient: c('#b4c4d2'),
    snow: 1,
  },
};

// One entry above was mistyped; fix it in a single place.
PALETTES.spring.foliage[2] = c('#469339');

export function seasonPalette(season: Season): SeasonPalette {
  return PALETTES[season];
}

/** Blends two season palettes so the transition is not a hard cut. */
export function blendPalettes(a: SeasonPalette, b: SeasonPalette, t: number): SeasonPalette {
  const mix = (x: Color, y: Color): Color => x.clone().lerp(y, t);
  return {
    grass: mix(a.grass, b.grass),
    grassAlt: mix(a.grassAlt, b.grassAlt),
    forestFloor: mix(a.forestFloor, b.forestFloor),
    rock: mix(a.rock, b.rock),
    rockAlt: mix(a.rockAlt, b.rockAlt),
    sand: mix(a.sand, b.sand),
    dirt: mix(a.dirt, b.dirt),
    waterShallow: mix(a.waterShallow, b.waterShallow),
    waterDeep: mix(a.waterDeep, b.waterDeep),
    foliage: a.foliage.map((col, i) => mix(col, b.foliage[i] ?? col)),
    trunk: mix(a.trunk, b.trunk),
    sky: mix(a.sky, b.sky),
    fog: mix(a.fog, b.fog),
    sunColor: mix(a.sunColor, b.sunColor),
    ambient: mix(a.ambient, b.ambient),
    snow: a.snow + (b.snow - a.snow) * t,
  };
}

export const BUILDING_COLORS = {
  wallWood: c('#b08048'),
  wallWoodDark: c('#8a6034'),
  wallPlaster: c('#d8cdb4'),
  wallStone: c('#9a9a96'),
  wallStoneDark: c('#7e7e7a'),
  wallBrick: c('#a8543a'),
  roofThatch: c('#c4a24e'),
  roofThatchDark: c('#a3833a'),
  roofTile: c('#9c4b38'),
  roofSlate: c('#5c636b'),
  beam: c('#6b4a2c'),
  frame: c('#7a5330'),
  cloth: c('#c9bfa6'),
  clothRed: c('#a8453c'),
  clothBlue: c('#4a6f96'),
  metal: c('#8f949b'),
  gold: c('#d8b13c'),
  dirt: c('#8b6f4b'),
  crop: c('#c8b24a'),
  cropYoung: c('#7fa347'),
  water: c('#4a8ba8'),
  ember: c('#e06a2a'),
  ruin: c('#8d8577'),
  scaffold: c('#c9a56b'),
};
