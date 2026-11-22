import { cross, normalize, type Mat4, type Vec3 } from "./mat";

/**
 * Builds triangle soup for the 3D renderer. One vertex is 12 floats: position, normal, colour
 * (sRGB), gloss, texture coordinates. Local frame of every model: +x forward, +y to the right,
 * +z up, metres. Pure: no DOM, no GL, so the models can be tested.
 */

export const STRIDE = 12;
export type RGB = readonly [number, number, number];

export function hex(s: string): RGB {
  const n = parseInt(s.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function shade(c: RGB, k: number): RGB {
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
}

/** A cross-section of a loft at `x`: a rounded trapezoid from z0 to z1. */
export interface Station {
  x: number;
  /** Half width at the bottom and at the top. */
  wb: number;
  wt: number;
  z0: number;
  z1: number;
  /** Corner radius. */
  r: number;
}

export type Axis = "x" | "y" | "z";

export class MeshBuilder {
  private d: number[] = [];
  private rgb: RGB = [1, 1, 1];
  private gloss = 0.1;
  private xf: Mat4 | null = null;

  /** Sets the colour (and optionally the gloss, 0 matt .. 1 mirror) for what follows. */
  paint(c: RGB | string, gloss?: number): this {
    this.rgb = typeof c === "string" ? hex(c) : c;
    if (gloss !== undefined) this.gloss = gloss;
    return this;
  }

  /** Runs `fn` with every vertex passed through `m` (rotation and translation only). */
  with(m: Mat4, fn: () => void): void {
    const prev = this.xf;
    this.xf = m;
    fn();
    this.xf = prev;
  }

  get vertexCount(): number {
    return this.d.length / STRIDE;
  }

  build(): Float32Array {
    return new Float32Array(this.d);
  }

  v(p: Vec3, n: Vec3, u = 0, w = 0): void {
    let [x, y, z] = p;
    let [nx, ny, nz] = n;
    const m = this.xf;
    if (m) {
      const px = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
      const py = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
      const pz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
      const qx = m[0]! * nx + m[4]! * ny + m[8]! * nz;
      const qy = m[1]! * nx + m[5]! * ny + m[9]! * nz;
      const qz = m[2]! * nx + m[6]! * ny + m[10]! * nz;
      x = px;
      y = py;
      z = pz;
      nx = qx;
      ny = qy;
      nz = qz;
    }
    this.d.push(x, y, z, nx, ny, nz, this.rgb[0], this.rgb[1], this.rgb[2], this.gloss, u, w);
  }

  /** A flat quad a-b-c-d (in order around the edge) with one normal. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3): void {
    this.v(a, n, 0, 0);
    this.v(b, n, 1, 0);
    this.v(c, n, 1, 1);
    this.v(a, n, 0, 0);
    this.v(c, n, 1, 1);
    this.v(d, n, 0, 1);
  }

  /** A quad with its own texture coordinates per corner. */
  quadUv(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
    n: Vec3,
    uv: readonly [number, number, number, number, number, number, number, number],
  ): void {
    this.v(a, n, uv[0], uv[1]);
    this.v(b, n, uv[2], uv[3]);
    this.v(c, n, uv[4], uv[5]);
    this.v(a, n, uv[0], uv[1]);
    this.v(c, n, uv[4], uv[5]);
    this.v(d, n, uv[6], uv[7]);
  }

  /** A quad with a normal per corner (smooth surfaces). */
  private quadN(a: Vec3, b: Vec3, c: Vec3, d: Vec3, na: Vec3, nb: Vec3, nc: Vec3, nd: Vec3) {
    this.v(a, na);
    this.v(b, nb);
    this.v(c, nc);
    this.v(a, na);
    this.v(c, nc);
    this.v(d, nd);
  }

  /** An axis-aligned box centred at (cx, cy, cz). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
    this.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
  }

  /** A square bar from a to b, `t` thick. Rails, wires, handles. */
  beam(a: Vec3, b: Vec3, t: number): void {
    const dir = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const ref: Vec3 = Math.abs(dir[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const s = normalize(cross(dir, ref));
    const u = normalize(cross(s, dir));
    const h = t / 2;
    const corner = (p: Vec3, i: number, j: number): Vec3 => [
      p[0] + s[0] * h * i + u[0] * h * j,
      p[1] + s[1] * h * i + u[1] * h * j,
      p[2] + s[2] * h * i + u[2] * h * j,
    ];
    const neg = (n: Vec3): Vec3 => [-n[0], -n[1], -n[2]];
    this.quad(corner(a, 1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(a, 1, 1), s);
    this.quad(corner(a, -1, -1), corner(b, -1, -1), corner(b, -1, 1), corner(a, -1, 1), neg(s));
    this.quad(corner(a, -1, 1), corner(b, -1, 1), corner(b, 1, 1), corner(a, 1, 1), u);
    this.quad(corner(a, -1, -1), corner(b, -1, -1), corner(b, 1, -1), corner(a, 1, -1), neg(u));
    this.quad(corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1), neg(dir));
    this.quad(corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1), dir);
  }

  /**
   * A skin stretched over cross-sections along x, smooth-shaded, closed at both ends. Car
   * bodies, cabins, roofs: anything that should look moulded rather than boxed.
   */
  loft(stations: readonly Station[], k = 3): void {
    const rings = stations.map((s) => ring(s, k));
    const n = rings.length;
    const m = rings[0]!.length;
    const xs = stations.map((s) => s.x);
    let zc = 0;
    for (const s of stations) zc += (s.z0 + s.z1) / 2;
    const centre: Vec3 = [(xs[0]! + xs[n - 1]!) / 2, 0, zc / n];
    const P = (i: number, j: number): Vec3 => {
      const q = rings[i]![((j % m) + m) % m]!;
      return [xs[i]!, q[0], q[1]];
    };
    const N = (i: number, j: number): Vec3 => {
      const a = P(Math.max(0, i - 1), j);
      const b = P(Math.min(n - 1, i + 1), j);
      const c = P(i, j - 1);
      const d = P(i, j + 1);
      const p = P(i, j);
      let nr = cross(
        [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
        [d[0] - c[0], d[1] - c[1], d[2] - c[2]],
      );
      const out: Vec3 = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
      const len = Math.sqrt(nr[0] * nr[0] + nr[1] * nr[1] + nr[2] * nr[2]);
      if (len < 1e-9) return normalize(out);
      if (nr[0] * out[0] + nr[1] * out[1] + nr[2] * out[2] < 0) nr = [-nr[0], -nr[1], -nr[2]];
      return normalize(nr);
    };
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < m; j++) {
        this.quadN(
          P(i, j),
          P(i + 1, j),
          P(i + 1, j + 1),
          P(i, j + 1),
          N(i, j),
          N(i + 1, j),
          N(i + 1, j + 1),
          N(i, j + 1),
        );
      }
    }
    for (const [i, nx] of [
      [0, -1],
      [n - 1, 1],
    ] as const) {
      const s = stations[i]!;
      const c: Vec3 = [s.x, 0, (s.z0 + s.z1) / 2];
      const nr: Vec3 = [nx, 0, 0];
      for (let j = 0; j < m; j++) {
        this.v(c, nr);
        this.v(P(i, j), nr);
        this.v(P(i, j + 1), nr);
      }
    }
  }

  /**
   * A cylinder or cone along an axis: radius r0 at `from`, r1 at `from + len`, centred on (a, b)
   * in the other two axes. Capped.
   */
  cyl(axis: Axis, a: number, b: number, from: number, len: number, r0: number, r1 = r0, segs = 12) {
    const at = (u: number, w: number, c: number): Vec3 =>
      axis === "z" ? [u, w, c] : axis === "y" ? [u, c, w] : [c, u, w];
    const slope = (r0 - r1) / (len || 1);
    for (let i = 0; i < segs; i++) {
      const t0 = (i / segs) * Math.PI * 2;
      const t1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(t0);
      const s0 = Math.sin(t0);
      const c1 = Math.cos(t1);
      const s1 = Math.sin(t1);
      const n0 = normalize(at(c0, s0, slope));
      const n1 = normalize(at(c1, s1, slope));
      this.quadN(
        at(a + c0 * r0, b + s0 * r0, from),
        at(a + c1 * r0, b + s1 * r0, from),
        at(a + c1 * r1, b + s1 * r1, from + len),
        at(a + c0 * r1, b + s0 * r1, from + len),
        n0,
        n1,
        n1,
        n0,
      );
      const down = at(0, 0, -1);
      const upN = at(0, 0, 1);
      if (r0 > 0) {
        this.v(at(a, b, from), down);
        this.v(at(a + c0 * r0, b + s0 * r0, from), down);
        this.v(at(a + c1 * r0, b + s1 * r0, from), down);
      }
      if (r1 > 0) {
        this.v(at(a, b, from + len), upN);
        this.v(at(a + c0 * r1, b + s0 * r1, from + len), upN);
        this.v(at(a + c1 * r1, b + s1 * r1, from + len), upN);
      }
    }
  }

  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, segs = 10) {
    const rows = Math.max(4, Math.floor(segs * 0.6));
    const P = (i: number, j: number): [Vec3, Vec3] => {
      const th = (i / rows) * Math.PI;
      const ph = (j / segs) * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph);
      const y = Math.sin(th) * Math.sin(ph);
      const z = Math.cos(th);
      return [[cx + x * rx, cy + y * ry, cz + z * rz], normalize([x / rx, y / ry, z / rz])];
    };
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < segs; j++) {
        const [a, na] = P(i, j);
        const [b, nb] = P(i + 1, j);
        const [c, nc] = P(i + 1, j + 1);
        const [d, nd] = P(i, j + 1);
        this.quadN(a, b, c, d, na, nb, nc, nd);
      }
    }
  }

  /** A flat ring (or a disc when r0 is 0) lying at height z, facing up. */
  annulus(cx: number, cy: number, z: number, r0: number, r1: number, segs = 32): void {
    const up: Vec3 = [0, 0, 1];
    for (let i = 0; i < segs; i++) {
      const t0 = (i / segs) * Math.PI * 2;
      const t1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(t0);
      const s0 = Math.sin(t0);
      const c1 = Math.cos(t1);
      const s1 = Math.sin(t1);
      this.quad(
        [cx + c0 * r0, cy + s0 * r0, z],
        [cx + c1 * r0, cy + s1 * r0, z],
        [cx + c1 * r1, cy + s1 * r1, z],
        [cx + c0 * r1, cy + s0 * r1, z],
        up,
      );
    }
  }
}

/** The outline of a station in (y, z), anticlockwise from the bottom right. */
function ring(s: Station, k: number): [number, number][] {
  const r = Math.max(0.001, Math.min(s.r, s.wb, s.wt, (s.z1 - s.z0) / 2));
  const corners: [number, number, number][] = [
    [s.wb - r, s.z0 + r, -Math.PI / 2],
    [s.wt - r, s.z1 - r, 0],
    [-s.wt + r, s.z1 - r, Math.PI / 2],
    [-s.wb + r, s.z0 + r, Math.PI],
  ];
  const out: [number, number][] = [];
  for (const [cy, cz, t0] of corners) {
    for (let i = 0; i <= k; i++) {
      const t = t0 + (i / k) * (Math.PI / 2);
      out.push([cy + Math.cos(t) * r, cz + Math.sin(t) * r]);
    }
  }
  return out;
}
