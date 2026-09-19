/**
 * Tiny SVG chart kit. No library, no canvas: a handful of paths in an inline
 * `<svg>` scales crisply on a phone, costs nothing to redraw and inherits the
 * page's colours. Everything here is pure geometry — it never touches the
 * simulation.
 */

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export interface Series {
  label: string;
  color: string;
  values: number[];
  /** Shades the area under the curve. Used for the one series that matters. */
  fill?: boolean;
  /** Dashes the stroke, for the "what you spend" counterpart. */
  dashed?: boolean;
}

export interface ChartOptions {
  series: Series[];
  /** Labels under the first, middle and last points. */
  xLabels?: [string, string, string];
  height?: number;
  /** Formats the three axis ticks. */
  format?: (v: number) => string;
  /** Forces the vertical range to include these values (usually 0). */
  include?: number[];
  /** Draws a horizontal rule, e.g. the break-even line. */
  zeroLine?: boolean;
  /** Hard bounds the axis may never exceed, e.g. [0, 100] for a percentage. */
  clamp?: [number, number];
}

const W = 320;
const PAD_L = 40;
const PAD_R = 8;
const PAD_T = 10;

/**
 * Builds a responsive line chart. The viewBox is fixed and the element is
 * `width: 100%`, so one geometry serves every screen size.
 */
export function lineChart(opts: ChartOptions): SVGSVGElement {
  const h = opts.height ?? 120;
  const padB = 16;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${h}`,
    class: 'chart',
    preserveAspectRatio: 'none',
    role: 'img',
  });

  const all: number[] = [...(opts.include ?? [])];
  for (const s of opts.series) for (const v of s.values) if (Number.isFinite(v)) all.push(v);
  let min = all.length ? Math.min(...all) : 0;
  let max = all.length ? Math.max(...all) : 1;
  if (max - min < 1e-6) {
    max += 1;
    min -= 1;
  }
  // A little headroom so the peak never touches the frame, without ever
  // inventing a happiness of 112 % or a negative headcount.
  const span = max - min;
  max += span * 0.12;
  min -= span * 0.12;
  if (opts.clamp) {
    min = Math.max(min, opts.clamp[0]);
    max = Math.min(max, opts.clamp[1]);
  }

  const count = Math.max(...opts.series.map((s) => s.values.length), 2);
  const x = (i: number): number =>
    PAD_L + (count <= 1 ? 0 : (i / (count - 1)) * (W - PAD_L - PAD_R));
  const y = (v: number): number => PAD_T + (1 - (v - min) / (max - min)) * (h - PAD_T - padB);

  // ── Grid and axis ticks ──────────────────────────────────────────────────
  const fmt = opts.format ?? ((v: number) => String(Math.round(v)));
  for (let i = 0; i <= 2; i++) {
    const v = min + ((2 - i) / 2) * (max - min);
    const gy = y(v);
    svg.append(
      svgEl('line', { x1: PAD_L, y1: gy, x2: W - PAD_R, y2: gy, class: 'chart-grid' }),
    );
    const label = svgEl('text', { x: PAD_L - 5, y: gy + 3.5, class: 'chart-tick' });
    label.textContent = fmt(v);
    svg.append(label);
  }

  if (opts.zeroLine && min < 0 && max > 0) {
    svg.append(
      svgEl('line', { x1: PAD_L, y1: y(0), x2: W - PAD_R, y2: y(0), class: 'chart-zero' }),
    );
  }

  // ── Series ───────────────────────────────────────────────────────────────
  for (const s of opts.series) {
    if (s.values.length === 0) continue;
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    if (s.fill && s.values.length > 1) {
      const base = y(Math.max(min, Math.min(0, max)));
      svg.append(
        svgEl('path', {
          d: `M${x(0).toFixed(1)},${base.toFixed(1)} L${pts.join(' L')} L${x(
            s.values.length - 1,
          ).toFixed(1)},${base.toFixed(1)} Z`,
          fill: s.color,
          opacity: '0.16',
        }),
      );
    }
    if (s.values.length === 1) {
      svg.append(svgEl('circle', { cx: x(0), cy: y(s.values[0]), r: 2.5, fill: s.color }));
      continue;
    }
    svg.append(
      svgEl('path', {
        d: `M${pts.join(' L')}`,
        fill: 'none',
        stroke: s.color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'stroke-dasharray': s.dashed ? '5 4' : '',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
    // A dot on the latest value: the player's eye goes there first.
    const last = s.values.length - 1;
    svg.append(svgEl('circle', { cx: x(last), cy: y(s.values[last]), r: 2.6, fill: s.color }));
  }

  // ── X labels ─────────────────────────────────────────────────────────────
  if (opts.xLabels) {
    const positions: Array<[number, string]> = [
      [PAD_L, 'start'],
      [(PAD_L + W - PAD_R) / 2, 'middle'],
      [W - PAD_R, 'end'],
    ];
    opts.xLabels.forEach((text, i) => {
      const [px, anchor] = positions[i];
      const node = svgEl('text', {
        x: px,
        y: h - 3,
        class: 'chart-tick',
        'text-anchor': anchor,
      });
      node.textContent = text;
      svg.append(node);
    });
  }

  return svg;
}

export interface BarRow {
  label: string;
  value: number;
  color: string;
}

/** Horizontal breakdown bars, used for the income and expense splits. */
export function breakdownBars(rows: BarRow[], format: (v: number) => string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'breakdown';
  const max = Math.max(1, ...rows.map((r) => r.value));
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'breakdown-row';

    const key = document.createElement('span');
    key.className = 'breakdown-key';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = row.color;
    key.append(dot, document.createTextNode(row.label));

    const track = document.createElement('div');
    track.className = 'breakdown-track';
    const fill = document.createElement('div');
    fill.className = 'breakdown-fill';
    fill.style.width = `${(row.value / max) * 100}%`;
    fill.style.background = row.color;
    track.append(fill);

    const value = document.createElement('span');
    value.className = 'breakdown-value';
    value.textContent = format(row.value);

    line.append(key, track, value);
    wrap.append(line);
  }
  return wrap;
}

/** Small legend chip row shared by every chart on the page. */
export function chartLegend(entries: Array<{ label: string; color: string; dashed?: boolean }>): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chart-legend';
  for (const e of entries) {
    const chip = document.createElement('span');
    chip.className = 'legend-chip';
    const swatch = document.createElement('span');
    swatch.className = `legend-swatch${e.dashed ? ' dashed' : ''}`;
    swatch.style.background = e.dashed ? 'transparent' : e.color;
    swatch.style.borderColor = e.color;
    chip.append(swatch, document.createTextNode(e.label));
    wrap.append(chip);
  }
  return wrap;
}
