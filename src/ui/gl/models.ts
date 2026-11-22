import { CAR_SPECS, type CarColour, type CarModel } from "../../content/cars";
import { CARTS, type CartId } from "../../content/carts";
import { stallRect, type Level } from "../../core/level";
import { createRng } from "../../core/rng";
import { modelZ, mat4, type Vec3 } from "./mat";
import { hex, MeshBuilder, shade, type RGB, type Station } from "./mesh";

/**
 * Everything in the car park as 3D models, built by code. Local frame: +x forward, +y right,
 * +z up, origin on the asphalt under the centre of the body, so a model drops straight onto its
 * physics body. Sizes come from the same specs the collisions use.
 */

export const CAR_PAINT: Record<CarColour, RGB> = {
  silver: hex("#b4b8bd"),
  white: hex("#e6e6e1"),
  black: hex("#1d1f22"),
  red: hex("#b3201b"),
  blue: hex("#264a8c"),
  grey: hex("#5d6166"),
};

const GLASS = hex("#12181f");
const RUBBER = hex("#141516");
const TRIM = hex("#1b1c1e");
const STEEL = hex("#c3c8cd");

interface CarShape {
  /** Roof height and beltline (where the glass starts). */
  h: number;
  belt: number;
  /** Cabin from xr to xf at the beltline, as fractions of the length from the centre. */
  xr: number;
  xf: number;
  /** How far the rear and front glass lean in at the roof, metres. */
  rakeR: number;
  rakeF: number;
  /** Drop of the boot below the beltline (0 for hatchbacks and SUVs). */
  boot: number;
}

const SHAPES: Record<CarModel, CarShape> = {
  sedan: { h: 1.42, belt: 0.86, xr: -0.3, xf: 0.14, rakeR: 0.55, rakeF: 0.62, boot: 0.05 },
  hatch: { h: 1.48, belt: 0.88, xr: -0.46, xf: 0.16, rakeR: 0.32, rakeF: 0.58, boot: 0 },
  suv: { h: 1.72, belt: 0.98, xr: -0.46, xf: 0.14, rakeR: 0.3, rakeF: 0.55, boot: 0 },
  pickup: { h: 1.76, belt: 1.0, xr: -0.03, xf: 0.2, rakeR: 0.16, rakeF: 0.5, boot: 0 },
  manager: { h: 1.4, belt: 0.86, xr: -0.28, xf: 0.12, rakeR: 0.6, rakeF: 0.66, boot: 0.04 },
};

export function carHeight(model: CarModel): number {
  return SHAPES[model].h;
}

/** A parked car. The nose is at +x. */
export function carModel(model: CarModel, colour: CarColour): Float32Array {
  const { length: L, width: W } = CAR_SPECS[model];
  const sh = SHAPES[model];
  const paint = model === "manager" ? CAR_PAINT.black : CAR_PAINT[colour];
  const b = new MeshBuilder();
  const hw = W / 2;
  const xr = sh.xr * L;
  const xf = sh.xf * L;
  const hood = sh.belt - 0.06;
  const tail = sh.belt - sh.boot;
  const st = (x: number, w: number, z0: number, z1: number, r = 0.12): Station => ({
    x,
    wb: hw * w,
    wt: hw * (w - 0.05),
    z0,
    z1,
    r,
  });

  // The body, bumper to bumper.
  b.paint(paint, 0.8);
  b.loft([
    st(-L / 2, 0.8, 0.4, tail - 0.16, 0.08),
    st(-L / 2 + 0.1, 0.95, 0.27, tail - 0.03),
    st(-L / 2 + 0.45, 1, 0.22, tail),
    st(xr, 1, 0.22, sh.belt),
    st(xf, 1, 0.22, sh.belt),
    st(xf + 0.35, 1, 0.22, hood),
    st(L / 2 - 0.5, 1, 0.22, hood - 0.04),
    st(L / 2 - 0.12, 0.95, 0.27, hood - 0.1),
    st(L / 2, 0.8, 0.4, hood - 0.26, 0.08),
  ]);

  // The cabin: one piece of dark glass, a painted roof on top, pillars at the corners.
  const cb = hw * 0.9;
  const ct = hw * 0.74;
  const zb = sh.belt - 0.03;
  const zr = sh.h - 0.04;
  const roofR = xr + sh.rakeR;
  const roofF = xf - sh.rakeF;
  b.paint(GLASS, 1);
  b.loft([
    { x: xr, wb: cb, wt: cb, z0: zb, z1: zb + 0.03, r: 0.02 },
    { x: roofR, wb: cb, wt: ct, z0: zb, z1: zr, r: 0.1 },
    { x: roofF, wb: cb, wt: ct, z0: zb, z1: zr, r: 0.1 },
    { x: xf, wb: cb, wt: cb, z0: zb, z1: zb + 0.03, r: 0.02 },
  ]);
  b.paint(paint, 0.8);
  b.loft([
    { x: roofR - 0.05, wb: ct * 0.9, wt: ct * 0.86, z0: zr - 0.03, z1: zr, r: 0.02 },
    { x: roofR + 0.1, wb: ct * 1.03, wt: ct * 0.98, z0: zr - 0.04, z1: zr + 0.03, r: 0.03 },
    { x: roofF - 0.1, wb: ct * 1.03, wt: ct * 0.98, z0: zr - 0.04, z1: zr + 0.03, r: 0.03 },
    { x: roofF + 0.05, wb: ct * 0.9, wt: ct * 0.86, z0: zr - 0.03, z1: zr, r: 0.02 },
  ]);
  for (const s of [-1, 1]) {
    b.beam([xf - 0.03, s * cb, zb], [roofF + 0.03, s * ct, zr], 0.08);
    b.beam([xr + 0.03, s * cb, zb], [roofR - 0.03, s * ct, zr], 0.09);
    if (roofF - roofR > 1.3) {
      const xm = (roofF + roofR) / 2 - 0.1;
      b.beam([xm, s * (cb + 0.005), zb], [xm, s * (ct + 0.005), zr], 0.09);
    }
  }

  if (model === "pickup") {
    // The bed: a dark liner sunk into the back, and a bar behind the cab.
    b.paint(hex("#101112"), 0.15);
    b.box((-L / 2 + xr) / 2 + 0.02, 0, sh.belt - 0.02, xr + L / 2 - 0.34, W - 0.3, 0.05);
    b.paint(TRIM, 0.4);
    for (const s of [-1, 1])
      b.beam([xr - 0.12, s * hw * 0.84, sh.belt], [xr - 0.12, s * hw * 0.84, sh.h - 0.1], 0.07);
    b.beam([xr - 0.12, -hw * 0.84, sh.h - 0.1], [xr - 0.12, hw * 0.84, sh.h - 0.1], 0.07);
  }
  if (model === "suv") {
    b.paint(TRIM, 0.4);
    for (const s of [-1, 1])
      b.beam(
        [roofR + 0.15, s * ct * 0.82, zr + 0.06],
        [roofF - 0.2, s * ct * 0.82, zr + 0.06],
        0.045,
      );
  }

  // Wheels sit a hair proud of the body, with a dark arch behind them.
  const wheelR = model === "suv" || model === "pickup" ? 0.37 : 0.32;
  for (const wx of [L / 2 - 0.88, -L / 2 + 0.92]) {
    for (const s of [-1, 1]) {
      const yIn = s > 0 ? hw - 0.22 : -hw - 0.03;
      b.paint(RUBBER, 0.1);
      b.cyl("y", wx, wheelR, yIn, 0.25, wheelR, wheelR, 16);
      b.paint(hex("#0c0d0e"), 0.05);
      b.cyl(
        "y",
        wx,
        wheelR + 0.08,
        s > 0 ? hw - 0.2 : -hw - 0.006,
        0.206,
        wheelR + 0.07,
        wheelR + 0.07,
        16,
      );
      b.paint(hex("#9da1a6"), 0.7);
      b.cyl(
        "y",
        wx,
        wheelR,
        s > 0 ? hw + 0.02 : -hw - 0.04,
        0.02,
        wheelR * 0.58,
        wheelR * 0.58,
        12,
      );
    }
  }

  // Bumpers, grille, lamps, plate, mirrors.
  b.paint(TRIM, 0.3);
  b.box(L / 2 - 0.085, 0, 0.36, 0.16, W * 0.8, 0.16);
  b.box(-L / 2 + 0.085, 0, 0.36, 0.16, W * 0.8, 0.16);
  b.box(L / 2 - 0.06, 0, hood - 0.3, 0.1, W * 0.36, 0.12);
  b.paint(hex("#fff6d8"), 1);
  for (const s of [-1, 1]) b.box(L / 2 - 0.08, s * hw * 0.62, hood - 0.26, 0.14, 0.32, 0.11);
  b.paint(hex("#c2140e"), 0.9);
  for (const s of [-1, 1]) b.box(-L / 2 + 0.07, s * hw * 0.64, tail - 0.24, 0.12, 0.3, 0.11);
  b.paint(hex("#e9e9e2"), 0.3);
  b.box(-L / 2 + 0.03, 0, tail - 0.36, 0.06, 0.42, 0.12);
  b.paint(paint, 0.8);
  for (const s of [-1, 1]) b.box(xf - 0.3, s * (hw + 0.07), sh.belt + 0.06, 0.12, 0.2, 0.11);

  if (model === "manager") {
    // Chrome down the sides and a gold badge on the bonnet. Bosses like badges.
    b.paint(hex("#d9dde1"), 1);
    for (const s of [-1, 1])
      b.beam([-L / 2 + 0.5, s * (hw + 0.003), 0.56], [L / 2 - 0.6, s * (hw + 0.003), 0.56], 0.035);
    b.paint(hex("#d1a92f"), 1);
    b.ellipsoid(L / 2 - 0.5, 0, hood - 0.02, 0.09, 0.09, 0.05, 10);
  }
  return b.build();
}

/** An open car door: a painted panel with its window, hinged at one end of the box. */
export function doorModel(colour: CarColour, hx: number, hy: number): Float32Array {
  const b = new MeshBuilder();
  b.paint(CAR_PAINT[colour], 0.8);
  b.box(0, 0, 0.56, hx * 2, Math.max(0.07, hy * 2), 0.62);
  b.paint(GLASS, 1);
  b.box(0, 0, 1.08, hx * 1.7, 0.035, 0.42);
  b.paint(CAR_PAINT[colour], 0.8);
  b.box(0, 0, 1.31, hx * 1.86, 0.06, 0.05);
  b.box(-hx * 0.9, 0, 1.08, 0.06, 0.06, 0.46);
  b.box(hx * 0.9, 0, 1.08, 0.06, 0.06, 0.46);
  return b.build();
}

/* ------------------------------------------------------------------ carts */

export interface CartMesh {
  /** Frame, wheels, handle, groceries. */
  solid: Float32Array;
  /** The wire panels, drawn with the mesh texture (see WIRE_PITCH). */
  wire: Float32Array;
}

/** Metres between wires; the mesh texture repeats once per pitch. */
export const WIRE_PITCH = 0.065;

const CART_LOOK: Record<CartId, { wire: RGB; handle: RGB; frame: RGB }> = {
  standard: { wire: hex("#e4e8ec"), handle: hex("#d0241c"), frame: hex("#b9bec4") },
  rusty: { wire: hex("#a8622c"), handle: hex("#6d3f1e"), frame: hex("#7d4a22") },
  basket: { wire: hex("#e0312a"), handle: hex("#8f1712"), frame: hex("#b9bec4") },
  kiddie: { wire: hex("#e4e8ec"), handle: hex("#d0241c"), frame: hex("#b9bec4") },
  wholesale: { wire: hex("#d7dbdf"), handle: hex("#2a5bd0"), frame: hex("#2a5bd0") },
};

function wirePanel(w: MeshBuilder, a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ad: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const lu = Math.hypot(...ab) / WIRE_PITCH;
  const lv = Math.hypot(...ad) / WIRE_PITCH;
  let n: Vec3 = [
    ab[1] * ad[2] - ab[2] * ad[1],
    ab[2] * ad[0] - ab[0] * ad[2],
    ab[0] * ad[1] - ab[1] * ad[0],
  ];
  const l = Math.hypot(...n) || 1;
  n = [n[0] / l, n[1] / l, n[2] / l];
  w.quadUv(a, b, c, d, n, [0, 0, lu, 0, lu, lv, 0, lv]);
}

function wheels(s: MeshBuilder, id: CartId, r: number): void {
  for (const wh of CARTS[id].wheels) {
    s.paint(hex("#2a2c2f"), 0.2);
    s.cyl("y", wh.x, r, wh.y - 0.022, 0.044, r, r, 10);
    s.paint(STEEL, 0.6);
    s.box(wh.x, wh.y, r * 2 + 0.02, 0.035, 0.06, 0.05);
  }
}

/** A shopping cart. The handle is at -x. */
export function cartModel(id: CartId): CartMesh {
  const spec = CARTS[id];
  const look = CART_LOOK[id];
  const L = spec.length;
  const W = spec.width;
  const s = new MeshBuilder();
  const w = new MeshBuilder();
  w.paint(look.wire, 0.5);

  if (id === "wholesale") {
    // A flat platform trolley stacked with cardboard boxes.
    s.paint(look.frame, 0.5);
    s.box(0, 0, 0.19, L, W, 0.06);
    const x = -L / 2 + 0.02;
    for (const sy of [-1, 1]) s.beam([x, sy * W * 0.42, 0.2], [x, sy * W * 0.42, 1.02], 0.045);
    s.beam([x, -W * 0.42, 1.02], [x, W * 0.42, 1.02], 0.045);
    const boxes: [number, number, number, number, number, string][] = [
      [-L * 0.2, -W * 0.16, L * 0.36, W * 0.44, 0.34, "#b8925f"],
      [L * 0.18, 0, L * 0.4, W * 0.62, 0.42, "#c19a66"],
      [-L * 0.18, W * 0.24, L * 0.32, W * 0.34, 0.26, "#c9a473"],
      [L * 0.16, -W * 0.05, L * 0.3, W * 0.4, 0.22, "#b08a58"],
    ];
    boxes.forEach(([bx, by, sx, sy, sz, col], i) => {
      const z0 = i === 3 ? 0.22 + 0.42 : 0.22;
      s.paint(col, 0.1);
      s.box(bx, by, z0 + sz / 2, sx, sy, sz);
      s.paint("#8f6e43", 0.3);
      s.box(bx, by, z0 + sz + 0.002, sx * 1.002, 0.06, 0.004);
    });
    wheels(s, id, 0.07);
    return { solid: s.build(), wire: w.build() };
  }

  const kiddie = id === "kiddie";
  const xb = -L / 2 + 0.1;
  const xf = kiddie ? L / 2 - L * 0.42 : L / 2;
  const zb = id === "basket" ? 0.5 : 0.46;
  const ztR = id === "basket" ? 0.84 : 0.98;
  const ztF = ztR - 0.07;
  const yTR = W * 0.48;
  const yTF = W * 0.4;
  const yBR = W * 0.37;
  const yBF = W * 0.3;
  const xbB = xb + 0.04;
  const xfB = xf - 0.12;
  const RL: Vec3 = [xb, -yTR, ztR];
  const RR: Vec3 = [xb, yTR, ztR];
  const FR: Vec3 = [xf, yTF, ztF];
  const FL: Vec3 = [xf, -yTF, ztF];
  const rl: Vec3 = [xbB, -yBR, zb];
  const rr: Vec3 = [xbB, yBR, zb];
  const fr: Vec3 = [xfB, yBF, zb];
  const fl: Vec3 = [xfB, -yBF, zb];

  wirePanel(w, rl, fl, FL, RL);
  wirePanel(w, rr, fr, FR, RR);
  wirePanel(w, fl, fr, FR, FL);
  wirePanel(w, rl, rr, RR, RL);
  wirePanel(w, rl, rr, fr, fl);
  // The rack underneath.
  wirePanel(
    w,
    [xb + 0.02, -W * 0.36, 0.2],
    [xb + 0.02, W * 0.36, 0.2],
    [xfB + 0.02, W * 0.3, 0.2],
    [xfB + 0.02, -W * 0.3, 0.2],
  );

  // The basket's edges are thicker rod.
  s.paint(look.wire, 0.6);
  const rod = 0.024;
  const loop = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    s.beam(a, b, rod);
    s.beam(b, c, rod);
    s.beam(c, d, rod);
    s.beam(d, a, rod);
  };
  loop(RL, RR, FR, FL);
  loop(rl, rr, fr, fl);
  s.beam(rl, RL, rod);
  s.beam(rr, RR, rod);
  s.beam(fr, FR, rod);
  s.beam(fl, FL, rod);

  // Frame: two legs from the handle down to the back wheels, rails forward to the casters.
  s.paint(look.frame, 0.6);
  const wy = spec.wheels[0]!.y;
  const wxR = spec.wheels[0]!.x;
  const wxF = spec.wheels[2]!.x;
  for (const sy of [-1, 1]) {
    const y = sy * Math.abs(wy);
    s.beam([xb - 0.08, sy * yTR, ztR + 0.03], [wxR, y, 0.17], 0.03);
    s.beam([wxR, y, 0.17], [wxF, y * 0.9, 0.17], 0.03);
    s.beam([wxF - 0.08, y * 0.9, 0.17], [xfB - 0.04, sy * yBF, zb], 0.026);
    s.beam([xb - 0.08, sy * yTR, ztR + 0.03], [xb, sy * yTR, ztR], 0.026);
  }
  s.beam([wxF, -Math.abs(wy) * 0.9, 0.17], [wxF, Math.abs(wy) * 0.9, 0.17], 0.03);
  // Handle.
  s.paint(look.handle, 0.5);
  s.beam([xb - 0.08, -yTR, ztR + 0.03], [xb - 0.08, yTR, ztR + 0.03], 0.045);
  wheels(s, id, 0.065);

  if (id !== "rusty") {
    // Groceries: a loaf, a bottle, a bag of oranges, a box of soap.
    const cx = (xbB + xfB) / 2;
    s.paint("#d9b77a", 0.15);
    s.ellipsoid(cx + 0.12, -W * 0.1, zb + 0.1, 0.17, 0.08, 0.08, 10);
    s.paint("#2f9a46", 0.8);
    s.cyl("z", cx - 0.16, W * 0.12, zb + 0.01, 0.26, 0.045, 0.045, 10);
    s.cyl("z", cx - 0.16, W * 0.12, zb + 0.27, 0.08, 0.045, 0.016, 10);
    s.paint("#f08a1d", 0.3);
    s.ellipsoid(cx + 0.02, W * 0.16, zb + 0.09, 0.1, 0.09, 0.08, 9);
    s.paint("#3b6fd1", 0.3);
    s.box(cx - 0.18, -W * 0.14, zb + 0.11, 0.1, 0.16, 0.2);
  }

  if (kiddie) {
    // The toy car bolted to the front.
    const x0 = xf + 0.02;
    const x1 = L / 2;
    const hw = W * 0.45;
    s.paint("#d8261d", 0.7);
    s.loft([
      { x: x0, wb: hw * 0.9, wt: hw * 0.85, z0: 0.14, z1: 0.42, r: 0.06 },
      { x: x0 + 0.08, wb: hw, wt: hw * 0.95, z0: 0.1, z1: 0.5, r: 0.08 },
      { x: x1 - 0.14, wb: hw, wt: hw * 0.95, z0: 0.1, z1: 0.46, r: 0.08 },
      { x: x1, wb: hw * 0.8, wt: hw * 0.7, z0: 0.16, z1: 0.36, r: 0.06 },
    ]);
    s.paint("#f0d22a", 0.6);
    const mid = (x0 + x1) / 2 - 0.05;
    for (const sy of [-1, 1]) {
      s.beam([mid - 0.16, sy * hw * 0.8, 0.48], [mid - 0.16, sy * hw * 0.8, 0.92], 0.035);
      s.beam([mid + 0.16, sy * hw * 0.8, 0.48], [mid + 0.16, sy * hw * 0.8, 0.92], 0.035);
    }
    s.box(mid, 0, 0.94, 0.44, hw * 1.8, 0.05);
    s.paint("#1c1c1c", 0.3);
    s.cyl("x", 0, 0.6, mid + 0.12, 0.03, 0.08, 0.08, 10);
  }
  return { solid: s.build(), wire: w.build() };
}

/* ------------------------------------------------------------------ small things */

/** A traffic cone, standing or knocked over (tip towards +x). */
export function coneModel(down: boolean): Float32Array {
  const b = new MeshBuilder();
  const build = () => {
    b.paint("#d4561a", 0.25);
    b.box(0, 0, 0.02, 0.42, 0.42, 0.04);
    b.paint("#ec6a24", 0.3);
    b.cyl("z", 0, 0, 0.04, 0.2, 0.15, 0.105, 12);
    b.paint("#f4f1e8", 0.4);
    b.cyl("z", 0, 0, 0.24, 0.13, 0.105, 0.075, 12);
    b.paint("#ec6a24", 0.3);
    b.cyl("z", 0, 0, 0.37, 0.22, 0.075, 0.025, 12);
  };
  if (!down) {
    build();
    return b.build();
  }
  // Tipped onto its side: z becomes x.
  const m = mat4();
  m.fill(0);
  m[2] = 1; // local x -> world z
  m[5] = 1;
  m[8] = 1; // local z -> world x
  m[12] = -0.28;
  m[14] = 0.16;
  m[15] = 1;
  b.with(m, build);
  return b.build();
}

/** A flat yellow ring around the cart before the first push; radius 1. */
export function ringModel(): Float32Array {
  const b = new MeshBuilder();
  b.paint("#ffd400", 0);
  b.annulus(0, 0, 0, 0.955, 1.045, 48);
  return b.build();
}

/** A red dot with a white rim where a hit happened (replays); radius 1. */
export function markModel(): Float32Array {
  const b = new MeshBuilder();
  b.paint("#ffffff", 0);
  b.annulus(0, 0, 0, 0.82, 1, 24);
  b.paint("#d21c18", 0);
  b.annulus(0, 0, 0.002, 0, 0.82, 24);
  return b.build();
}

/** A unit quad in the x-y plane, centred, for billboards and blob shadows. */
export function quadModel(): Float32Array {
  const b = new MeshBuilder();
  b.paint("#ffffff", 0);
  b.quadUv(
    [-0.5, -0.5, 0],
    [0.5, -0.5, 0],
    [0.5, 0.5, 0],
    [-0.5, 0.5, 0],
    [0, 0, 1],
    [0, 1, 1, 1, 1, 0, 0, 0],
  );
  return b.build();
}

/* ------------------------------------------------------------------ the lot */

/** Where the corral's sign stands, for the textured panel. */
export interface SignPlace {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

export interface LevelMesh {
  /** Kerbs, pavement, hedges, speed bumps, islands, the corral's rails. */
  solid: Float32Array;
  /** The lot itself: one quad carrying the painted asphalt texture. */
  ground: Float32Array;
  sign: Float32Array;
}

const SIGN = { w: 1.5, h: 1.0, z: 2.0 };

export function levelModel(level: Level): LevelMesh {
  const [W, H] = level.size;
  const b = new MeshBuilder();
  const rng = createRng(`art3d:${level.id}`);
  const wet = level.surface === "wet";
  const up: Vec3 = [0, 0, 1];

  // Pavement around the lot, in slabs, with a kerb down to the asphalt.
  const kerbH = 0.14;
  const pave = 3.2;
  const slab = 1.6;
  const concrete = hex(wet ? "#6f6f6a" : "#8f8e86");
  const tiles = (x0: number, y0: number, x1: number, y1: number) => {
    const g = 0.025;
    for (let x = x0; x < x1 - 0.01; x += slab) {
      for (let y = y0; y < y1 - 0.01; y += slab) {
        const xe = Math.min(x + slab, x1);
        const ye = Math.min(y + slab, y1);
        b.paint(shade(concrete, rng.range(0.9, 1.06)), wet ? 0.45 : 0.08);
        b.quad(
          [x + g, y + g, kerbH],
          [xe - g, y + g, kerbH],
          [xe - g, ye - g, kerbH],
          [x + g, ye - g, kerbH],
          up,
        );
      }
    }
  };
  tiles(-pave, -pave, W + pave, 0);
  tiles(-pave, H, W + pave, H + pave);
  tiles(-pave, 0, 0, H);
  tiles(W, 0, W + pave, H);
  // Under the slabs (the joints) and the kerb faces.
  b.paint(shade(concrete, 0.55), 0.05);
  b.quad(
    [-pave, -pave, kerbH - 0.01],
    [W + pave, -pave, kerbH - 0.01],
    [W + pave, 0, kerbH - 0.01],
    [-pave, 0, kerbH - 0.01],
    up,
  );
  b.quad(
    [-pave, H, kerbH - 0.01],
    [W + pave, H, kerbH - 0.01],
    [W + pave, H + pave, kerbH - 0.01],
    [-pave, H + pave, kerbH - 0.01],
    up,
  );
  b.quad(
    [-pave, 0, kerbH - 0.01],
    [0, 0, kerbH - 0.01],
    [0, H, kerbH - 0.01],
    [-pave, H, kerbH - 0.01],
    up,
  );
  b.quad(
    [W, 0, kerbH - 0.01],
    [W + pave, 0, kerbH - 0.01],
    [W + pave, H, kerbH - 0.01],
    [W, H, kerbH - 0.01],
    up,
  );
  b.paint(shade(concrete, 1.08), 0.1);
  b.quad([0, 0, 0], [W, 0, 0], [W, 0, kerbH], [0, 0, kerbH], [0, 1, 0]);
  b.quad([0, H, 0], [W, H, 0], [W, H, kerbH], [0, H, kerbH], [0, -1, 0]);
  b.quad([0, 0, 0], [0, H, 0], [0, H, kerbH], [0, 0, kerbH], [1, 0, 0]);
  b.quad([W, 0, 0], [W, H, 0], [W, H, kerbH], [W, 0, kerbH], [-1, 0, 0]);

  // Grass beyond the pavement, then the street.
  const far = 90;
  const grassW = 4.5;
  const g0 = pave;
  const g1 = pave + grassW;
  b.paint(wet ? "#2c4a26" : "#3d6a2c", 0.05);
  b.quad([-g1, -g1, 0.1], [W + g1, -g1, 0.1], [W + g1, -g0, 0.1], [-g1, -g0, 0.1], up);
  b.quad([-g1, H + g0, 0.1], [W + g1, H + g0, 0.1], [W + g1, H + g1, 0.1], [-g1, H + g1, 0.1], up);
  b.quad([-g1, -g0, 0.1], [-g0, -g0, 0.1], [-g0, H + g0, 0.1], [-g1, H + g0, 0.1], up);
  b.quad([W + g0, -g0, 0.1], [W + g1, -g0, 0.1], [W + g1, H + g0, 0.1], [W + g0, H + g0, 0.1], up);
  b.paint(wet ? "#1a1c1e" : "#232527", wet ? 0.5 : 0.05);
  b.quad(
    [-far, -far, -0.06],
    [W + far, -far, -0.06],
    [W + far, H + far, -0.06],
    [-far, H + far, -0.06],
    up,
  );

  // A clipped hedge on the grass, in clumps.
  const bush = (x: number, y: number) => {
    const r = rng.range(0.7, 1.15);
    b.paint(shade(hex(wet ? "#27481f" : "#2f5a24"), rng.range(0.8, 1.2)), 0.05);
    b.ellipsoid(
      x + rng.range(-0.3, 0.3),
      y + rng.range(-0.3, 0.3),
      0.1 + r * 0.55,
      r,
      r,
      r * 0.8,
      8,
    );
  };
  const gm = pave + grassW / 2;
  for (let x = -gm; x <= W + gm; x += 1.7) {
    if (rng.next() < 0.85) bush(x, -gm);
    if (rng.next() < 0.85) bush(x, H + gm);
  }
  // Where traffic drives in and out there's a driveway through the kerb, and no hedge.
  const lanes = level.hazards.flatMap((h) => (h.type === "traffic" ? [h.y] : []));
  const onLane = (y: number) => lanes.some((l) => Math.abs(y - l) < 2.6);
  for (let y = -gm + 1.7; y < H + gm; y += 1.7) {
    // Draw from the seed either way, so a lane doesn't reshuffle the rest of the hedge.
    const west = rng.next() < 0.85;
    const east = rng.next() < 0.85;
    if (onLane(y)) continue;
    if (west) bush(-gm, y);
    if (east) bush(W + gm, y);
  }
  b.paint(wet ? "#2a2c2f" : "#3a3c3f", wet ? 0.5 : 0.06);
  for (const y of new Set(lanes)) {
    const z = kerbH + 0.004;
    b.quad([-far, y - 1.7, z], [0, y - 1.7, z], [0, y + 1.7, z], [-far, y + 1.7, z], up);
    b.quad([W, y - 1.7, z], [W + far, y - 1.7, z], [W + far, y + 1.7, z], [W, y + 1.7, z], up);
  }

  for (const h of level.hazards) {
    if (h.type === "speedBump") {
      // A hump of rubber blocks, yellow and black.
      const vertical = h.h > h.w;
      const len = vertical ? h.h : h.w;
      const wid = vertical ? h.w : h.h;
      const n = Math.max(1, Math.round(len / 0.5));
      const seg = 6;
      for (let k = 0; k < n; k++) {
        b.paint(k % 2 ? "#17181a" : "#e8c428", 0.25);
        const a0 = (k / n) * len + 0.01;
        const a1 = ((k + 1) / n) * len - 0.01;
        for (let i = 0; i < seg; i++) {
          const t0 = i / seg;
          const t1 = (i + 1) / seg;
          const z0 = Math.sin(t0 * Math.PI) * 0.09;
          const z1 = Math.sin(t1 * Math.PI) * 0.09;
          const nz = Math.cos(((t0 + t1) / 2) * Math.PI);
          const p = (along: number, across: number, z: number): Vec3 =>
            vertical ? [h.x + across * wid, h.y + along, z] : [h.x + along, h.y + across * wid, z];
          const nr: Vec3 = vertical ? [-nz * 0.5, 0, 1] : [0, -nz * 0.5, 1];
          const l = Math.hypot(...nr);
          b.quad(p(a0, t0, z0), p(a1, t0, z0), p(a1, t1, z1), p(a0, t1, z1), [
            nr[0] / l,
            nr[1] / l,
            nr[2] / l,
          ]);
        }
      }
    } else if (h.type === "island") {
      // A raised kerb with a planted bed.
      const m = modelZ(mat4(), h.x, h.y + h.h / 2, 0, 0);
      b.with(m, () => {
        b.paint(concrete, 0.1);
        b.loft(
          [
            { x: 0, wb: h.h / 2 - 0.1, wt: h.h / 2 - 0.16, z0: 0, z1: 0.12, r: 0.03 },
            { x: 0.12, wb: h.h / 2, wt: h.h / 2 - 0.05, z0: 0, z1: 0.16, r: 0.04 },
            { x: h.w - 0.12, wb: h.h / 2, wt: h.h / 2 - 0.05, z0: 0, z1: 0.16, r: 0.04 },
            { x: h.w, wb: h.h / 2 - 0.1, wt: h.h / 2 - 0.16, z0: 0, z1: 0.12, r: 0.03 },
          ],
          2,
        );
        b.paint("#3f6b2f", 0.05);
        b.box(h.w / 2, 0, 0.165, h.w - 0.5, h.h - 0.5, 0.01);
        const n = Math.max(1, Math.floor(Math.max(h.w, h.h) / 1.1));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          b.paint(shade(hex("#2f5a24"), rng.range(0.85, 1.2)), 0.05);
          const along = h.w >= h.h;
          const rr = Math.min(0.42, Math.min(h.w, h.h) / 2 - 0.22);
          b.ellipsoid(
            along ? t * h.w : h.w / 2,
            along ? 0 : (t - 0.5) * h.h,
            0.16 + rr * 0.6,
            rr,
            rr,
            rr * 0.8,
            8,
          );
        }
      });
    }
  }

  // The corral: galvanised rails on three sides and a sign at the back.
  const row = level.rows[level.corral.row]!;
  const r = stallRect(row, level.corral.stall);
  const down = row.opens === "down";
  const backY = down ? r.y + 0.08 : r.y + r.h - 0.08;
  const openY = down ? r.y + r.h : r.y;
  const xl = r.x + 0.08;
  const xrr = r.x + r.w - 0.08;
  b.paint(STEEL, 0.75);
  const rail = (a: [number, number], c: [number, number]) => {
    for (const z of [0.5, 0.98]) b.beam([a[0], a[1], z], [c[0], c[1], z], 0.05);
    const n = Math.max(1, Math.round(Math.hypot(c[0] - a[0], c[1] - a[1]) / 1.4));
    for (let i = 0; i <= n; i++) {
      const x = a[0] + ((c[0] - a[0]) * i) / n;
      const y = a[1] + ((c[1] - a[1]) * i) / n;
      b.beam([x, y, 0], [x, y, 1.0], 0.055);
    }
  };
  rail([xl, openY], [xl, backY]);
  rail([xl, backY], [xrr, backY]);
  rail([xrr, backY], [xrr, openY]);
  const sx = r.x + r.w / 2;
  for (const s of [-1, 1])
    b.beam([sx + s * 0.62, backY, 0], [sx + s * 0.62, backY, SIGN.z + SIGN.h / 2], 0.06);

  const ground = new MeshBuilder();
  // Brighter than the flat art: here the sun has to light it, and shadows need room to fall.
  ground.paint(wet ? [1.2, 1.2, 1.2] : [1.4, 1.4, 1.4], wet ? 0.62 : 0.06);
  ground.quadUv([0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0], up, [0, 0, 1, 0, 1, 1, 0, 1]);

  // The sign faces south, towards the camera.
  const sign = new MeshBuilder();
  sign.paint("#ffffff", 0.3);
  const sy = backY + 0.04;
  sign.quadUv(
    [sx - SIGN.w / 2, sy, SIGN.z - SIGN.h / 2],
    [sx + SIGN.w / 2, sy, SIGN.z - SIGN.h / 2],
    [sx + SIGN.w / 2, sy, SIGN.z + SIGN.h / 2],
    [sx - SIGN.w / 2, sy, SIGN.z + SIGN.h / 2],
    [0, 1, 0],
    [0, 1, 1, 1, 1, 0, 0, 0],
  );
  return { solid: b.build(), ground: ground.build(), sign: sign.build() };
}
