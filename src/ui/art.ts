import type { CartId } from "../content/carts";
import { CARTS } from "../content/carts";
import { CAR_SPECS, type CarColour, type CarModel } from "../content/cars";
import { stallRect, type Level } from "../core/level";
import { createRng, type Rng } from "../core/rng";

/**
 * The art, drawn by code: a drone photo of a supermarket car park. Everything is top-down with
 * the light from the upper left, so shadows fall to the lower right. Sprites are drawn once per
 * scale into offscreen canvases and reused every frame. Units in: metres; `ppm` = pixels/metre.
 */

export const SHADOW_DX = 0.28;
export const SHADOW_DY = 0.42;

const PAINT_WHITE = "rgba(232, 232, 226, 0.92)";
const PAINT_YELLOW = "rgba(232, 196, 40, 0.9)";

export const CAR_PAINT: Record<CarColour, [string, string, string]> = {
  // body, highlight, shade
  silver: ["#a9adb2", "#d4d7da", "#7d8186"],
  white: ["#dfe0dc", "#f7f7f3", "#b3b4b0"],
  black: ["#1f2124", "#3a3d42", "#0e0f10"],
  red: ["#b3201b", "#d8433a", "#7c120f"],
  blue: ["#264a8c", "#4a6fb2", "#172f5c"],
  grey: ["#5d6166", "#82868b", "#3f4246"],
};

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ------------------------------------------------------------------ cars */

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Size of the drawn object in metres (the canvas has padding). */
  length: number;
  width: number;
  /** Padding in metres on each side. */
  pad: number;
}

const carCache = new Map<string, Sprite>();

/** A parked car seen from above, pointing along +x. */
export function carSprite(model: CarModel, colour: CarColour, ppm: number): Sprite {
  const key = `${model}:${colour}:${ppm}`;
  const hit = carCache.get(key);
  if (hit) return hit;
  const { length: L, width: W } = CAR_SPECS[model];
  const pad = 0.3;
  const c = canvas((L + 2 * pad) * ppm, (W + 2 * pad) * ppm);
  const ctx = c.getContext("2d")!;
  ctx.scale(ppm, ppm);
  ctx.translate(pad + L / 2, pad + W / 2);
  const [base, light, shade] = model === "manager" ? CAR_PAINT.black : CAR_PAINT[colour];

  // Mirrors first, so the body overlaps their roots.
  ctx.fillStyle = shade;
  for (const s of [-1, 1]) roundRect(ctx, L * 0.12, s * (W / 2 + 0.12) - 0.09, 0.22, 0.18, 0.05);
  ctx.fill();

  // Body.
  const g = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
  g.addColorStop(0, light);
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade);
  ctx.fillStyle = g;
  roundRect(ctx, -L / 2, -W / 2, L, W, W * 0.32);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.03;
  ctx.stroke();

  const glass = "#1a1f26";
  const glassHi = "rgba(170, 190, 210, 0.35)";
  if (model === "pickup") {
    // Cab at the front, bed at the back.
    ctx.fillStyle = glass;
    trapezoid(ctx, L * 0.2, L * 0.06, W * 0.8, W * 0.7);
    ctx.fill();
    ctx.fillStyle = base;
    roundRect(ctx, -L * 0.02, -W * 0.38, L * 0.1, W * 0.76, 0.12);
    ctx.fill();
    ctx.fillStyle = glass;
    ctx.fillRect(-L * 0.06, -W * 0.34, 0.12, W * 0.68);
    ctx.fillStyle = shade;
    roundRect(ctx, -L * 0.47, -W * 0.42, L * 0.38, W * 0.84, 0.08);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 0.025;
    for (let k = 1; k < 4; k++) {
      const y = -W * 0.42 + (k * W * 0.84) / 4;
      ctx.beginPath();
      ctx.moveTo(-L * 0.46, y);
      ctx.lineTo(-L * 0.1, y);
      ctx.stroke();
    }
  } else {
    const roofFront = model === "hatch" ? L * 0.16 : L * 0.12;
    const roofBack = model === "hatch" ? -L * 0.38 : model === "suv" ? -L * 0.34 : -L * 0.22;
    // Windscreen.
    ctx.fillStyle = glass;
    trapezoid(ctx, roofFront + L * 0.13, roofFront, W * 0.82, W * 0.7);
    ctx.fill();
    ctx.fillStyle = glassHi;
    trapezoid(ctx, roofFront + L * 0.12, roofFront + L * 0.07, W * 0.5, W * 0.4);
    ctx.fill();
    // Rear window.
    ctx.fillStyle = glass;
    trapezoid(ctx, roofBack, roofBack - L * 0.09, W * 0.68, W * 0.78);
    ctx.fill();
    // Roof.
    const rg = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
    rg.addColorStop(0, light);
    rg.addColorStop(1, base);
    ctx.fillStyle = rg;
    roundRect(ctx, roofBack, -W * 0.36, roofFront - roofBack, W * 0.72, 0.12);
    ctx.fill();
    // Side windows.
    ctx.fillStyle = glass;
    for (const s of [-1, 1])
      ctx.fillRect(roofBack + 0.05, s * W * 0.4 - 0.04, roofFront - roofBack - 0.1, 0.08);
    if (model === "suv") {
      ctx.strokeStyle = "rgba(20,20,20,0.6)";
      ctx.lineWidth = 0.05;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(roofBack + 0.1, s * W * 0.3);
        ctx.lineTo(roofFront - 0.1, s * W * 0.3);
        ctx.stroke();
      }
    }
  }
  // Lights.
  ctx.fillStyle = "#f3eccd";
  for (const s of [-1, 1]) roundRect(ctx, L / 2 - 0.12, s * W * 0.34 - 0.12, 0.09, 0.24, 0.04);
  ctx.fill();
  ctx.fillStyle = "#a3140f";
  for (const s of [-1, 1]) roundRect(ctx, -L / 2 + 0.03, s * W * 0.36 - 0.13, 0.08, 0.26, 0.03);
  ctx.fill();
  if (model === "manager") {
    // A little gold badge on the bonnet. Bosses like badges.
    ctx.fillStyle = "#c9a640";
    ctx.beginPath();
    ctx.arc(L * 0.4, 0, 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  const sprite = { canvas: c, length: L, width: W, pad };
  carCache.set(key, sprite);
  return sprite;
}

/** A trapezoid across the car between x0 and x1, width w0 at x0 and w1 at x1. */
function trapezoid(ctx: CanvasRenderingContext2D, x0: number, x1: number, w0: number, w1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, -w0 / 2);
  ctx.lineTo(x0, w0 / 2);
  ctx.lineTo(x1, w1 / 2);
  ctx.lineTo(x1, -w1 / 2);
  ctx.closePath();
}

/* ------------------------------------------------------------------ carts */

const cartCache = new Map<string, { sprite: Sprite; shadow: Sprite }>();

const CART_LOOK: Record<CartId, { wire: string; handle: string; tint?: string }> = {
  standard: { wire: "#dfe4e8", handle: "#c8231c" },
  rusty: { wire: "#9a5a2a", handle: "#6d3f1e" },
  basket: { wire: "#d42a22", handle: "#8f1712" },
  kiddie: { wire: "#dfe4e8", handle: "#c8231c" },
  wholesale: { wire: "#d7dbdf", handle: "#2a5bd0" },
};

/** The wire cart from above (pointing +x, handle at -x) and a matching shadow through its mesh. */
export function cartSprite(id: CartId, ppm: number): { sprite: Sprite; shadow: Sprite } {
  const key = `${id}:${ppm}`;
  const hit = cartCache.get(key);
  if (hit) return hit;
  const spec = CARTS[id];
  const L = spec.length;
  const W = spec.width;
  const pad = 0.25;
  const make = (shadow: boolean): Sprite => {
    const c = canvas((L + 2 * pad) * ppm, (W + 2 * pad) * ppm);
    const ctx = c.getContext("2d")!;
    ctx.scale(ppm, ppm);
    ctx.translate(pad + L / 2, pad + W / 2);
    drawCart(ctx, id, L, W, shadow);
    return { canvas: c, length: L, width: W, pad };
  };
  const out = { sprite: make(false), shadow: make(true) };
  cartCache.set(key, out);
  return out;
}

function drawCart(
  ctx: CanvasRenderingContext2D,
  id: CartId,
  L: number,
  W: number,
  shadow: boolean,
): void {
  const look = CART_LOOK[id];
  const wire = shadow ? "rgba(0,0,0,0.5)" : look.wire;
  const line = Math.max(0.018, 0.022);
  if (id === "wholesale") {
    // A flat platform with boxes.
    ctx.fillStyle = shadow ? "rgba(0,0,0,0.45)" : "#2a5bd0";
    roundRect(ctx, -L / 2, -W / 2, L, W, 0.05);
    ctx.fill();
    if (!shadow) {
      ctx.fillStyle = "#b8925f";
      ctx.fillRect(-L * 0.36, -W * 0.38, L * 0.34, W * 0.42);
      ctx.fillRect(-L * 0.05, -W * 0.3, L * 0.4, W * 0.6);
      ctx.fillStyle = "#c9a473";
      ctx.fillRect(-L * 0.3, W * 0.06, L * 0.3, W * 0.32);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 0.02;
      ctx.strokeRect(-L * 0.36, -W * 0.38, L * 0.34, W * 0.42);
      ctx.strokeRect(-L * 0.05, -W * 0.3, L * 0.4, W * 0.6);
      ctx.strokeRect(-L * 0.3, W * 0.06, L * 0.3, W * 0.32);
    }
    ctx.strokeStyle = shadow ? "rgba(0,0,0,0.5)" : look.handle;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-L / 2 - 0.02, -W * 0.45);
    ctx.lineTo(-L / 2 - 0.02, W * 0.45);
    ctx.stroke();
    return;
  }
  let front = L / 2;
  if (id === "kiddie") {
    // The toy car takes the front 40%.
    const toyL = L * 0.4;
    front = L / 2 - toyL;
    ctx.fillStyle = shadow ? "rgba(0,0,0,0.45)" : "#d8261d";
    roundRect(ctx, front + 0.02, -W * 0.42, toyL - 0.04, W * 0.84, 0.18);
    ctx.fill();
    if (!shadow) {
      ctx.fillStyle = "#f0d22a";
      roundRect(ctx, front + toyL * 0.3, -W * 0.28, toyL * 0.35, W * 0.56, 0.1);
      ctx.fill();
      ctx.fillStyle = "#1c1c1c";
      ctx.beginPath();
      ctx.arc(front + toyL * 0.75, 0, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const back = -L / 2;
  const len = front - back;
  // Basket floor (a little darker), then the mesh.
  if (!shadow) {
    ctx.fillStyle = "rgba(60, 66, 72, 0.35)";
    roundRect(ctx, back, -W / 2, len, W, 0.04);
    ctx.fill();
    // Groceries: a loaf, a bottle, a bag of oranges.
    ctx.fillStyle = "#d9b77a";
    ctx.beginPath();
    ctx.ellipse(back + len * 0.62, -W * 0.12, len * 0.16, W * 0.16, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a160";
    ctx.beginPath();
    ctx.ellipse(back + len * 0.38, W * 0.12, len * 0.13, W * 0.15, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f9a46";
    ctx.beginPath();
    ctx.arc(back + len * 0.7, W * 0.2, W * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = wire;
  ctx.lineWidth = line;
  const step = 0.075;
  ctx.beginPath();
  for (let x = back + step; x < front - 0.01; x += step) {
    ctx.moveTo(x, -W / 2);
    ctx.lineTo(x, W / 2);
  }
  for (let y = -W / 2 + step; y < W / 2 - 0.01; y += step) {
    ctx.moveTo(back, y);
    ctx.lineTo(front, y);
  }
  ctx.stroke();
  ctx.lineWidth = line * 2.2;
  roundRect(ctx, back, -W / 2, len, W, 0.04);
  ctx.stroke();
  // Handle.
  ctx.strokeStyle = shadow ? "rgba(0,0,0,0.5)" : look.handle;
  ctx.lineWidth = 0.06;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(back - 0.06, -W * 0.48);
  ctx.lineTo(back - 0.06, W * 0.48);
  ctx.stroke();
}

/* ------------------------------------------------------------------ cones */

export function drawCone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  down: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  if (down) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0.08, 0.1, 0.36, 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e5621f";
    ctx.beginPath();
    ctx.moveTo(-0.34, -0.15);
    ctx.lineTo(0.34, -0.04);
    ctx.lineTo(0.34, 0.04);
    ctx.lineTo(-0.34, 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(-0.05, -0.1, 0.12, 0.2);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(SHADOW_DX * 0.9, SHADOW_DY * 0.9, 0.22, 0.2, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d4561a";
    ctx.fillRect(-0.21, -0.21, 0.42, 0.42);
    ctx.fillStyle = "#ec6a24";
    ctx.beginPath();
    ctx.arc(0, 0, 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f6f3ea";
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(0, 0, 0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#a83f10";
    ctx.beginPath();
    ctx.arc(0, 0, 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ the lot */

function speckle(ctx: CanvasRenderingContext2D, rng: Rng, W: number, H: number, n: number) {
  for (let i = 0; i < n; i++) {
    const v = rng.int(0, 1) ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rng.range(0.03, 0.1)})`;
    const s = rng.range(0.02, 0.07);
    ctx.fillRect(rng.range(0, W), rng.range(0, H), s, s);
  }
}

function crack(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, len: number) {
  ctx.strokeStyle = "rgba(10,10,10,0.55)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rng.range(0, Math.PI * 2);
  for (let i = 0; i < len; i++) {
    a += rng.range(-0.7, 0.7);
    x += Math.cos(a) * 0.35;
    y += Math.sin(a) * 0.35;
    ctx.lineTo(x, y);
    if (rng.next() < 0.15) {
      const bx = x + Math.cos(a + 1.2) * 0.6;
      const by = y + Math.sin(a + 1.2) * 0.6;
      ctx.lineTo(bx, by);
      ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
}

/** A painted line that looks worn: drawn, then nibbled. */
function wornLine(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  colour: string,
) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.floor(len * 9);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < n; i++) {
    const t = rng.next();
    const s = rng.range(0.02, 0.09);
    ctx.fillStyle = `rgba(0,0,0,${rng.range(0.4, 1)})`;
    ctx.fillRect(
      x0 + (x1 - x0) * t + rng.range(-width, width) / 2,
      y0 + (y1 - y0) * t + rng.range(-width, width) / 2,
      s,
      s,
    );
  }
  ctx.restore();
}

function hatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  a: string,
  b: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = b;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = a;
  ctx.lineWidth = 0.32;
  ctx.beginPath();
  for (let k = -h; k < w + h; k += 0.7) {
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + k + h, y + h);
  }
  ctx.stroke();
  ctx.restore();
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir);
  ctx.fillStyle = PAINT_WHITE;
  ctx.beginPath();
  ctx.moveTo(-1.6, -0.18);
  ctx.lineTo(0.5, -0.18);
  ctx.lineTo(0.5, -0.5);
  ctx.lineTo(1.4, 0);
  ctx.lineTo(0.5, 0.5);
  ctx.lineTo(0.5, 0.18);
  ctx.lineTo(-1.6, 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  rot = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `${size}px Anton, Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PAINT_YELLOW;
  // Canvas fonts below 1px misbehave in some browsers: draw at 100x and scale down.
  ctx.scale(0.01, 0.01);
  ctx.font = `${size * 100}px Anton, Impact, sans-serif`;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** The parked-cart stack and the sign inside the corral. */
function corralArt(ctx: CanvasRenderingContext2D, level: Level, rails: boolean) {
  const row = level.rows[level.corral.row]!;
  const r = stallRect(row, level.corral.stall);
  hatch(ctx, r.x, r.y, r.w, r.h, "rgba(232, 196, 40, 0.85)", "rgba(20,20,20,0.55)");
  if (!rails) return;
  // Rails.
  ctx.strokeStyle = "#c9ced3";
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  const backY = row.opens === "down" ? r.y + 0.06 : r.y + r.h - 0.06;
  const openY = row.opens === "down" ? r.y + r.h : r.y;
  ctx.moveTo(r.x + 0.06, openY);
  ctx.lineTo(r.x + 0.06, backY);
  ctx.lineTo(r.x + r.w - 0.06, backY);
  ctx.lineTo(r.x + r.w - 0.06, openY);
  ctx.stroke();
}

/**
 * The whole static lot at `ppm`: asphalt, paint, bumps, the corral. Drawn once per level/scale.
 * With `ground3d` it's the texture under the 3D scene: only what is painted on the asphalt, since
 * the bumps, islands, rails and kerb are modelled there.
 */
export function lotCanvas(level: Level, ppm: number, ground3d = false): HTMLCanvasElement {
  const [W, H] = level.size;
  const c = canvas(W * ppm, H * ppm);
  const ctx = c.getContext("2d")!;
  ctx.scale(ppm, ppm);
  const rng = createRng(`art:${level.id}`);
  const wet = level.surface === "wet";

  // Asphalt with patches and stains.
  ctx.fillStyle = wet ? "#232527" : "#2e3032";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) {
    const v = rng.range(-12, 12);
    const base = wet ? 36 : 46;
    ctx.fillStyle = `rgb(${base + v},${base + 1 + v},${base + 3 + v})`;
    ctx.fillRect(rng.range(0, W - 3), rng.range(0, H - 2), rng.range(1.5, 5), rng.range(1, 3.5));
  }
  speckle(ctx, rng, W, H, Math.floor(W * H * 14));
  for (const row of level.rows) {
    for (let s = 0; s < row.stalls; s++) {
      if (rng.next() < 0.55) {
        const r = stallRect(row, s);
        const g = ctx.createRadialGradient(
          r.x + r.w / 2,
          r.y + r.h / 2,
          0.1,
          r.x + r.w / 2,
          r.y + r.h / 2,
          rng.range(0.7, 1.3),
        );
        g.addColorStop(0, "rgba(5,5,5,0.5)");
        g.addColorStop(1, "rgba(5,5,5,0)");
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
  }
  for (let i = 0; i < 6; i++) crack(ctx, rng, rng.range(0, W), rng.range(0, H), rng.int(6, 14));

  if (wet) {
    // Puddles: dark, glossy, with a pale rim of reflected sky.
    for (let i = 0; i < 14; i++) {
      const x = rng.range(1, W - 1);
      const y = rng.range(1, H - 1);
      const rx = rng.range(0.6, 2.2);
      const ry = rx * rng.range(0.35, 0.7);
      const a = rng.range(0, Math.PI);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.3, 0.05, 0, 0, rx);
      g.addColorStop(0, "rgba(120, 140, 165, 0.35)");
      g.addColorStop(0.6, "rgba(25, 32, 42, 0.55)");
      g.addColorStop(1, "rgba(25, 32, 42, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(190, 205, 225, 0.18)";
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.85, ry * 0.85, 0, Math.PI * 1.1, Math.PI * 1.7);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Stall lines and the yellow aisle edges.
  for (const row of level.rows) {
    const first = stallRect(row, 0);
    for (let s = 0; s <= row.stalls; s++) {
      const x = first.x + s * first.w;
      wornLine(ctx, rng, x, first.y + 0.2, x, first.y + first.h - 0.1, 0.12, PAINT_WHITE);
    }
    const edgeY = row.opens === "down" ? first.y + first.h : first.y;
    wornLine(ctx, rng, 0, edgeY, W, edgeY, 0.14, PAINT_YELLOW);
  }

  for (const h of level.hazards) {
    if (ground3d && h.type !== "slope") continue;
    if (h.type === "speedBump") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(h.x, h.y, h.w, h.h);
      ctx.clip();
      ctx.fillStyle = "#e8c428";
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.fillStyle = "#151515";
      const vertical = h.h > h.w;
      const n = Math.ceil((vertical ? h.h : h.w) / 0.5);
      for (let k = 0; k < n; k += 2) {
        if (vertical) ctx.fillRect(h.x, h.y + k * 0.5, h.w, 0.5);
        else ctx.fillRect(h.x + k * 0.5, h.y, 0.5, h.h);
      }
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      if (vertical) ctx.fillRect(h.x + h.w, h.y, 0.12, h.h);
      else ctx.fillRect(h.x, h.y + h.h, h.w, 0.12);
    } else if (h.type === "island") {
      ctx.fillStyle = "#6f6f66";
      roundRect(ctx, h.x, h.y, h.w, h.h, 0.3);
      ctx.fill();
      ctx.fillStyle = "#3f6b2f";
      roundRect(ctx, h.x + 0.2, h.y + 0.2, h.w - 0.4, h.h - 0.4, 0.2);
      ctx.fill();
    } else if (h.type === "slope") {
      // Faint chevrons pointing downhill.
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 0.12;
      const cx = h.x + h.w / 2;
      for (let k = 0; k < 5; k++) {
        const px = cx - 12 + k * 6;
        const py = h.y + h.h / 2;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(h.dir);
        ctx.beginPath();
        ctx.moveTo(-0.5, -0.7);
        ctx.lineTo(0.3, 0);
        ctx.lineTo(-0.5, 0.7);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  for (const p of level.paint ?? []) {
    if (p.type === "arrow") arrow(ctx, p.x, p.y, p.dir);
    else if (p.type === "text") paintText(ctx, p.text, p.x, p.y, p.size ?? 0.8, p.rot ?? 0);
    else hatch(ctx, p.x, p.y, p.w, p.h, "rgba(232,196,40,0.8)", "rgba(0,0,0,0)");
  }

  corralArt(ctx, level, !ground3d);
  if (ground3d) return c;

  // A vignette of kerb around the edge.
  ctx.strokeStyle = "rgba(170,170,160,0.5)";
  ctx.lineWidth = 0.25;
  ctx.strokeRect(0.12, 0.12, W - 0.24, H - 0.24);
  return c;
}
