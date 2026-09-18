/**
 * Uniform spatial hash over tile space. Resource nodes and buildings are
 * queried by radius dozens of times per second, so a grid beats a linear scan
 * by a wide margin once the map holds ~20 000 trees.
 */
export class SpatialGrid<T extends { x: number; y: number }> {
  private cells: Map<number, T[]> = new Map();
  private cellSize: number;
  private cols: number;

  constructor(width: number, _height: number, cellSize = 8) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize) + 1;
  }

  private key(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const k = this.key(
      Math.floor(item.x / this.cellSize),
      Math.floor(item.y / this.cellSize),
    );
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    arr.push(item);
  }

  rebuild(items: Iterable<T>): void {
    this.clear();
    for (const it of items) this.insert(it);
  }

  /** Visit every item whose cell overlaps the query circle. */
  query(x: number, y: number, radius: number, visit: (item: T) => void): void {
    const cs = this.cellSize;
    const minX = Math.floor((x - radius) / cs);
    const maxX = Math.floor((x + radius) / cs);
    const minY = Math.floor((y - radius) / cs);
    const maxY = Math.floor((y + radius) / cs);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) visit(arr[i]);
      }
    }
  }

  /** Nearest item passing `accept`, or null. */
  nearest(x: number, y: number, maxRadius: number, accept: (item: T) => boolean): T | null {
    let best: T | null = null;
    let bestD = maxRadius * maxRadius;
    // Expand the search ring by ring so we can stop early on dense maps.
    for (let r = this.cellSize; r <= maxRadius + this.cellSize; r += this.cellSize) {
      this.query(x, y, r, (item) => {
        if (!accept(item)) return;
        const dx = item.x - x;
        const dy = item.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = item;
        }
      });
      if (best) break;
    }
    return best;
  }
}
