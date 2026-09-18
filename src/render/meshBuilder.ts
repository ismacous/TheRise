import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  BoxGeometry,
  Euler,
  Quaternion,
  Vector3,
} from 'three';

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _pos = new Vector3();
const _scale = new Vector3();

/** Cached primitives so we never allocate a geometry per building. */
const UNIT_BOX = new BoxGeometry(1, 1, 1);
const ICO = [new IcosahedronGeometry(0.5, 0), new IcosahedronGeometry(0.5, 1)];
const CONES = new Map<number, ConeGeometry>();
const CYLINDERS = new Map<string, CylinderGeometry>();

function cone(sides: number): ConeGeometry {
  let g = CONES.get(sides);
  if (!g) {
    g = new ConeGeometry(0.5, 1, sides, 1);
    CONES.set(sides, g);
  }
  return g;
}

function cylinder(sides: number, topRatio: number): CylinderGeometry {
  const key = `${sides}:${topRatio}`;
  let g = CYLINDERS.get(key);
  if (!g) {
    g = new CylinderGeometry(0.5 * topRatio, 0.5, 1, sides, 1);
    CYLINDERS.set(key, g);
  }
  return g;
}

/**
 * Accumulates transformed primitives into one flat-shaded, vertex-coloured
 * buffer. Every building, tree and villager in the game is assembled here,
 * which means the whole art style ships as code rather than as assets.
 */
export class MeshBuilder {
  private positions: number[] = [];
  private colors: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  clear(): this {
    this.positions.length = 0;
    this.colors.length = 0;
    return this;
  }

  /** Appends a geometry transformed by `matrix`, tinted with `color`. */
  addGeometry(geo: BufferGeometry, matrix: Matrix4, color: Color): this {
    const pos = geo.getAttribute('position') as BufferAttribute;
    const index = geo.getIndex();
    const count = index ? index.count : pos.count;
    const v = _pos;
    for (let i = 0; i < count; i++) {
      const vi = index ? index.getX(i) : i;
      v.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(matrix);
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(color.r, color.g, color.b);
    }
    return this;
  }

  private static matrix(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ): Matrix4 {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _pos.set(x, y, z);
    _scale.set(sx, sy, sz);
    return _m.compose(_pos, _q, _scale);
  }

  /** Axis-aligned box centred on (x, y, z). */
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: Color,
    ry = 0,
    rx = 0,
    rz = 0,
  ): this {
    return this.addGeometry(UNIT_BOX, MeshBuilder.matrix(x, y, z, w, h, d, rx, ry, rz), color);
  }

  /** Box whose base sits at y (rather than its centre). */
  boxOn(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: Color,
    ry = 0,
  ): this {
    return this.box(x, y + h / 2, z, w, h, d, color, ry);
  }

  cone(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    sides: number,
    color: Color,
    ry = 0,
  ): this {
    return this.addGeometry(
      cone(sides),
      MeshBuilder.matrix(x, y + height / 2, z, radius * 2, height, radius * 2, 0, ry, 0),
      color,
    );
  }

  cylinder(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    sides: number,
    color: Color,
    topRatio = 1,
    ry = 0,
  ): this {
    return this.addGeometry(
      cylinder(sides, topRatio),
      MeshBuilder.matrix(x, y + height / 2, z, radius * 2, height, radius * 2, 0, ry, 0),
      color,
    );
  }

  /** A cylinder lying on its side, centred on (x, y, z). `axis` is its length. */
  bar(
    x: number,
    y: number,
    z: number,
    radius: number,
    length: number,
    sides: number,
    color: Color,
    axis: 'x' | 'z' = 'x',
  ): this {
    const rx = axis === 'z' ? Math.PI / 2 : 0;
    const rz = axis === 'x' ? Math.PI / 2 : 0;
    return this.addGeometry(
      cylinder(sides, 1),
      MeshBuilder.matrix(x, y, z, radius * 2, length, radius * 2, rx, 0, rz),
      color,
    );
  }

  /** A flat disc facing +Z, centred on (x, y, z). Used for wheels and sails. */
  disc(x: number, y: number, z: number, radius: number, thickness: number, sides: number, color: Color): this {
    return this.addGeometry(
      cylinder(sides, 1),
      MeshBuilder.matrix(x, y, z, radius * 2, thickness, radius * 2, Math.PI / 2, 0, 0),
      color,
    );
  }

  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: Color, detail = 0): this {
    return this.addGeometry(
      ICO[detail],
      MeshBuilder.matrix(x, y, z, rx * 2, ry * 2, rz * 2),
      color,
    );
  }

  /** A gable roof: two sloped slabs meeting at a ridge along +X. */
  gableRoof(
    cx: number,
    baseY: number,
    cz: number,
    width: number,
    depth: number,
    height: number,
    color: Color,
    ry = 0,
    overhang = 0.18,
  ): this {
    const w = width + overhang * 2;
    const d = depth / 2 + overhang;
    const slope = Math.atan2(height, depth / 2 + overhang);
    const len = Math.hypot(height, d);
    const thickness = 0.1;
    // Each slope gets its own shade: without it a gable roof reads as one
    // flat quad from a three-quarter camera.
    const shades = [0.84, 1.0];
    for (const sign of [-1, 1]) {
      const slopeColor = color.clone().multiplyScalar(shades[sign > 0 ? 1 : 0]);
      const px = 0;
      const pz = (sign * d) / 2;
      const py = baseY + height / 2;
      // Build in local space then rotate the whole roof by ry.
      const cos = Math.cos(ry);
      const sin = Math.sin(ry);
      const wx = cx + px * cos - pz * sin;
      const wz = cz + px * sin + pz * cos;
      // The sign puts the ridge up and the eaves down. Inverted, it builds a
      // valley instead of a roof.
      this.box(wx, py, wz, w, thickness, len, slopeColor, ry, sign * slope, 0);
    }
    return this;
  }

  /** A four-sided pyramid roof. */
  hipRoof(
    cx: number,
    baseY: number,
    cz: number,
    width: number,
    depth: number,
    height: number,
    color: Color,
    ry = 0,
  ): this {
    return this.addGeometry(
      cone(4),
      MeshBuilder.matrix(
        cx,
        baseY + height / 2,
        cz,
        Math.max(width, depth) * 1.5,
        height,
        Math.max(width, depth) * 1.5,
        0,
        ry + Math.PI / 4,
        0,
      ),
      color,
    );
  }

  build(): BufferGeometry {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /** Appends the accumulated buffer into another builder's arrays. */
  appendTo(target: MeshBuilder, matrix: Matrix4): void {
    const v = _pos;
    for (let i = 0; i < this.positions.length; i += 3) {
      v.set(this.positions[i], this.positions[i + 1], this.positions[i + 2]).applyMatrix4(matrix);
      target.positions.push(v.x, v.y, v.z);
      target.colors.push(this.colors[i], this.colors[i + 1], this.colors[i + 2]);
    }
  }
}

export function tinted(base: Color, amount: number): Color {
  return base.clone().multiplyScalar(amount);
}
