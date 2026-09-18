export type Attrs = Record<string, string | number | boolean | undefined> & {
  class?: string;
  text?: string;
  html?: string;
};

/** Tiny hyperscript helper; the UI is plain DOM, no framework. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Array<Node | string | null | undefined> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k === 'class') node.className = String(v);
    else if (k.startsWith('data-') || k === 'role' || k.startsWith('aria-')) {
      node.setAttribute(k, String(v));
    } else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Pointer-friendly tap handler that ignores drags. */
export function onTap(node: HTMLElement, handler: (e: PointerEvent) => void): () => void {
  let sx = 0;
  let sy = 0;
  let moved = false;
  const down = (e: PointerEvent): void => {
    sx = e.clientX;
    sy = e.clientY;
    moved = false;
  };
  const move = (e: PointerEvent): void => {
    if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 12) moved = true;
  };
  const up = (e: PointerEvent): void => {
    if (moved) return;
    e.stopPropagation();
    handler(e);
  };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  return () => {
    node.removeEventListener('pointerdown', down);
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', up);
  };
}

export function setText(node: HTMLElement | null, text: string): void {
  if (node && node.textContent !== text) node.textContent = text;
}

/** Percentage bar used throughout the panels. */
export function bar(value: number, className = ''): HTMLElement {
  const outer = el('div', { class: `bar ${className}` });
  const fill = el('div', { class: 'bar-fill' });
  fill.style.width = `${Math.max(0, Math.min(100, value * 100))}%`;
  outer.append(fill);
  return outer;
}
