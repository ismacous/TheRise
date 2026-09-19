/**
 * The game's glyph set.
 *
 * Emoji were doing this job, and doing it badly: they render differently on
 * every Android version, they carry their own colours, and at HUD size half of
 * them are an unreadable smudge. Each icon here is a handful of shapes on a
 * 24×24 grid, drawn in `currentColor`, so the page's own palette tints them
 * and a 12-pixel chip stays legible.
 */

const NS = 'http://www.w3.org/2000/svg';

export type IconName =
  // vitals and currencies
  | 'people'
  | 'food'
  | 'mood'
  | 'coin'
  // navigation
  | 'build'
  | 'research'
  | 'trade'
  | 'village'
  | 'chart'
  | 'stock'
  | 'settings'
  // weather and time
  | 'sun'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fog'
  // tones and alerts
  | 'info'
  | 'warn'
  | 'good'
  | 'bad'
  // things that happen
  | 'fire'
  | 'illness'
  | 'harvest'
  | 'family'
  | 'merchant'
  | 'grave'
  | 'leave'
  | 'arrive'
  | 'save'
  | 'flag'
  | 'pencil'
  | 'bell'
  // places and work
  | 'home'
  | 'worker'
  | 'box'
  | 'tree'
  | 'wheat'
  | 'tool'
  | 'anvil'
  | 'pot'
  | 'cart'
  | 'water'
  | 'stone'
  | 'gem'
  | 'scroll'
  | 'heart'
  | 'star'
  | 'close'
  | 'pause'
  | 'plus'
  | 'minus'
  | 'check'
  | 'lock'
  | 'dot';

/**
 * Each entry is a list of SVG children. Strokes are 2 units wide on a 24 grid,
 * which reads correctly from 12 px up to 40 px.
 */
const SHAPES: Record<IconName, string> = {
  people:
    '<circle cx="9" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.4"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M15 14.4c2.6-.3 5 1.6 5 4.6"/>',
  food: '<path d="M4 13c0-4 3.6-7 8-7s8 3 8 7z"/><path d="M3 16h18"/><path d="M5 19h14"/>',
  mood: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/><path d="M8.4 14.2c1 1.4 2.2 2.1 3.6 2.1s2.6-.7 3.6-2.1"/>',
  coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.4"/>',

  build: '<path d="M4 20l7.5-7.5"/><path d="M13 5.5l5.5 5.5"/><path d="M10.5 8l5.5-5.5 5 5-5.5 5.5z"/>',
  research: '<path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z"/><path d="M18 20a2 2 0 0 0 2-2V6"/><path d="M9.5 8.5h6"/><path d="M9.5 12h6"/><path d="M9.5 15.5h3.5"/>',
  trade: '<path d="M12 4v16"/><path d="M5 7h14"/><path d="M5 7l-2.5 5h5z"/><path d="M19 7l-2.5 5h5z"/><path d="M8.5 20h7"/>',
  village:
    '<path d="M4 20V10l4-3 4 3v10z"/><path d="M12 20V7l4-3 4 3v13z"/><path d="M7 20v-4h2v4"/><path d="M15 12h2"/>',
  chart: '<path d="M4 4v16h16"/><path d="M7.5 15.5l3.5-4.5 3 3 4.5-6"/>',
  stock: '<path d="M4 8l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',

  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8"/>',
  rain: '<path d="M7 14a4.5 4.5 0 0 1 .6-9 6 6 0 0 1 11.2 2.2A3.9 3.9 0 0 1 18 14z"/><path d="M8.5 17.5l-1 3M13 17.5l-1 3M17.5 17.5l-1 3"/>',
  storm:
    '<path d="M7 13a4.5 4.5 0 0 1 .6-9 6 6 0 0 1 11.2 2.2A3.9 3.9 0 0 1 18 13z"/><path d="M13 15l-3 4h3l-1.5 4"/>',
  snow: '<path d="M12 3v18M4 7.5l16 9M20 7.5l-16 9"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',

  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor"/>',
  warn: '<path d="M12 3.5l9 16H3z"/><path d="M12 9.5v5"/><circle cx="12" cy="17" r="1" fill="currentColor"/>',
  good: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16 9.5"/>',
  bad: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',

  fire: '<path d="M12 21c3.6 0 6-2.4 6-5.6 0-4.4-4.4-6-4.4-9.4-2.6 1.2-3.6 3.6-3.6 5.2 0 1.2.5 2 .5 2.6 0 .8-.6 1.4-1.4 1.4-1 0-1.6-.9-1.7-2C6.6 14.6 6 15.8 6 17c0 2.4 2.4 4 6 4z"/>',
  illness:
    '<path d="M12 4a6 6 0 0 1 6 6v3l1.5 3H4.5L6 13v-3a6 6 0 0 1 6-6z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/><path d="M9.5 10.5h5"/>',
  harvest:
    '<path d="M12 21V9"/><path d="M12 12c-3 0-4.5-2-4.5-5 3 0 4.5 2 4.5 5z"/><path d="M12 12c3 0 4.5-2 4.5-5-3 0-4.5 2-4.5 5z"/><path d="M12 9c0-3 1.5-5 3-6-1 2.2-1 4-1 6"/>',
  family:
    '<circle cx="8" cy="7.5" r="2.6"/><circle cx="16" cy="8" r="2.2"/><circle cx="12" cy="14" r="1.8"/><path d="M3.5 18c0-2.6 2-4.4 4.5-4.4"/><path d="M16 13.6c2.5 0 4.5 1.8 4.5 4.4"/><path d="M9 21c0-1.8 1.3-3 3-3s3 1.2 3 3"/>',
  merchant:
    '<path d="M5 9h14l-1.2 10.5a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 9V6.5a3 3 0 0 1 6 0V9"/>',
  grave: '<path d="M7 21V11a5 5 0 0 1 10 0v10z"/><path d="M12 9.5v5"/><path d="M9.5 12h5"/>',
  leave: '<path d="M13.5 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h7.5"/><path d="M16 8.5l3.5 3.5L16 15.5"/><path d="M19 12h-9"/>',
  arrive: '<path d="M10.5 4H18a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20h-7.5"/><path d="M8 8.5L4.5 12 8 15.5"/><path d="M5 12h9"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8.5 4v5h7V4"/><path d="M8.5 20v-6h7v6"/>',
  pencil: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  flag: '<path d="M6 21V4"/><path d="M6 5h11l-2 3.5L17 12H6z"/>',
  bell: '<path d="M12 4a5.5 5.5 0 0 1 5.5 5.5c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5A5.5 5.5 0 0 1 12 4z"/><path d="M10 18a2 2 0 0 0 4 0"/>',

  home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  worker: '<circle cx="12" cy="7" r="3"/><path d="M5 20v-1.5C5 15 8 13 12 13s7 2 7 5.5V20"/>',
  box: '<path d="M4 7.5l8-3.5 8 3.5v9L12 20l-8-3.5z"/><path d="M4 7.5l8 3.5 8-3.5"/><path d="M12 11v9"/>',
  tree: '<path d="M12 3.5l5 7h-3.2l4 6H6.2l4-6H7z"/><path d="M12 16.5V21"/>',
  wheat: '<path d="M12 21V8"/><path d="M12 11c-2.4 0-3.6-1.6-3.6-4 2.4 0 3.6 1.6 3.6 4z"/><path d="M12 11c2.4 0 3.6-1.6 3.6-4-2.4 0-3.6 1.6-3.6 4z"/><path d="M12 15c-2.4 0-3.6-1.6-3.6-4 2.4 0 3.6 1.6 3.6 4z"/><path d="M12 15c2.4 0 3.6-1.6 3.6-4-2.4 0-3.6 1.6-3.6 4z"/>',
  tool: '<path d="M16.5 3.5a4.5 4.5 0 0 0-5.3 6.1L4 16.8 7.2 20l7.2-7.2a4.5 4.5 0 0 0 6.1-5.3L17.8 10 14 6.2z"/>',
  anvil: '<path d="M4 9h9l3 3h4c0 2.4-2 4.4-4.6 4.4H9.6C6.6 16.4 4 13.6 4 10z"/><path d="M9 16.4V19"/><path d="M6 21h9"/>',
  pot: '<path d="M5 10h14v5a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z"/><path d="M3.5 10h17"/><path d="M9 7c0-1.5 3-1.5 3-3.5"/>',
  cart: '<path d="M4 6h3l2.5 9h8l2-6H8"/><circle cx="10" cy="19" r="1.8"/><circle cx="17" cy="19" r="1.8"/>',
  water: '<path d="M12 3.5s6 6.5 6 10.3A6 6 0 0 1 6 13.8C6 10 12 3.5 12 3.5z"/>',
  stone: '<path d="M4.5 13.5L8 7h8l3.5 6.5L16 19H8z"/>',
  gem: '<path d="M7 4h10l4 5.5-9 10.5L3 9.5z"/><path d="M3 9.5h18"/><path d="M12 20L8.5 9.5 11 4"/><path d="M12 20l3.5-10.5L13 4"/>',
  scroll:
    '<path d="M7 4h10v14a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18h10"/><path d="M17 4a2.5 2.5 0 0 1 2.5 2.5V18"/><path d="M8 8.5h6M8 12h6"/>',
  heart: '<path d="M12 20S4 15 4 9.8A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 20 9.8C20 15 12 20 12 20z"/>',
  star: '<path d="M12 3.5l2.6 5.6 6 .7-4.5 4.2 1.2 6L12 17.2 6.7 20l1.2-6L3.4 9.8l6-.7z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  lock: '<path d="M6.5 11h11v9h-11z"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
};

/** Builds one icon. `size` is a CSS length; the stroke scales with it. */
export function icon(name: IconName, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.innerHTML = SHAPES[name] ?? SHAPES.dot;
  return svg;
}

/** A coloured pastille, the lightest way to identify a good or a profession. */
export function pastille(color: string, cls = ''): HTMLElement {
  const node = document.createElement('span');
  node.className = `pastille ${cls}`.trim();
  node.style.background = color;
  return node;
}
