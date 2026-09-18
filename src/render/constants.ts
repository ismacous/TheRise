/** World units per tile. Kept at 1 so sim and render coordinates match. */
export const TILE = 1;
/** Vertical exaggeration. Below 1 flattens the valley for a clearer 3/4 view. */
export const HEIGHT_SCALE = 0.55;
/** Terrain chunk edge, in tiles. */
export const CHUNK = 26;
/** Water surface height in world units. */
export const WATER_Y = 0.02;

export const LAYER_DEFAULT = 0;
export const LAYER_PICKING = 1;
