import { ALL_GOOD_IDS, GOODS, type GoodCategory, type GoodId } from '../data/goods';

/**
 * Which goods the player keeps in the HUD.
 *
 * The bar used to list every resource the village had ever seen and scrolled
 * sideways: twenty-eight chips, three rows deep on a phone, and the one number
 * you actually wanted was always off-screen. Three pinned goods and a storage
 * gauge are what fits on one line of a 412-pixel screen with the names still
 * readable; everything else lives on the Ressources page.
 */
export const MAX_PINNED = 3;

const KEY = 'therise.pinned.v1';

const DEFAULT_PINS: GoodId[] = ['logs', 'planks', 'bread'];

let cache: GoodId[] | null = null;

export function pinnedGoods(): GoodId[] {
  if (cache) return cache;
  cache = readPins();
  return cache;
}

function readPins(): GoodId[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [...DEFAULT_PINS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_PINS];
    const valid = parsed.filter((g): g is GoodId => typeof g === 'string' && g in GOODS);
    return valid.slice(0, MAX_PINNED);
  } catch {
    // Private browsing, cleared site data, a WebView with storage disabled:
    // a missing preference must never take the HUD down with it.
    return [...DEFAULT_PINS];
  }
}

function writePins(pins: GoodId[]): void {
  cache = pins;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    /* The pins still apply for this session. */
  }
}

export function isPinned(good: GoodId): boolean {
  return pinnedGoods().includes(good);
}

/** Pins or unpins a good. Pinning past the limit drops the oldest one. */
export function togglePin(good: GoodId): void {
  const pins = [...pinnedGoods()];
  const i = pins.indexOf(good);
  if (i !== -1) pins.splice(i, 1);
  else {
    pins.push(good);
    while (pins.length > MAX_PINNED) pins.shift();
  }
  writePins(pins);
}

export const CATEGORY_ORDER: GoodCategory[] = ['food', 'raw', 'building', 'refined', 'comfort'];

export const CATEGORY_LABEL: Record<GoodCategory, string> = {
  food: 'Nourriture',
  raw: 'Matières premières',
  building: 'Matériaux',
  refined: 'Produits transformés',
  comfort: 'Confort',
};

export function goodsOfCategory(category: GoodCategory): GoodId[] {
  return ALL_GOOD_IDS.filter((g) => GOODS[g].category === category);
}
