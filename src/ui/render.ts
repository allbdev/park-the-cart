import type { Body } from "../core/body";
import { stallRect, type Level } from "../core/level";
import type { World } from "../core/world";
import {
  carSprite,
  cartSprite,
  drawCone,
  lotCanvas,
  roundRect,
  SHADOW_DX,
  SHADOW_DY,
  type Sprite,
} from "./art";

/**
 * Draws a World on a canvas. Desktop and landscape show the whole lot; portrait phones follow
 * the cart. The renderer only reads the world; it interpolates the moving bodies between the
 * last two ticks with `alpha`.
 */

export interface Pose {
  x: number;
  y: number;
  a: number;
}

export interface Camera {
  /** Pixels per metre on screen (CSS pixels). */
  scale: number;
  /** World point at the screen centre. */
  cx: number;
  cy: number;
}

export interface Labels {
  you: string;
  returnHere: string;
}

export interface FrameOptions {
  alpha: number;
  prevCart: Pose;
  prevLoose: Pose | null;
  /** Seconds of wall time, for rain and pulses. */
  time: number;
  /** Show the "you" ring (before the first input). */
  showYou: boolean;
  /** 0..1 zoom towards the last hit. */
  zoom: number;
  zoomAt: [number, number] | null;
  labels: Labels;
  /** Optional path to draw (replays): world points. */
  path?: readonly [number, number][];
  /** Optional red marks on the path (replay hits). */
  marks?: readonly [number, number][];
  reducedMotion: boolean;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function poseOf(b: Body): Pose {
  return { x: b.x, y: b.y, a: b.a };
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private level: Level | null = null;
  private lot: HTMLCanvasElement | null = null;
  private lotPpm = 0;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  camera: Camera = { scale: 40, cx: 16, cy: 9 };
  /** True on portrait phones: the camera follows the cart. */
  follow = false;
  private drops: Float32Array;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.drops = new Float32Array(240 * 3);
    for (let i = 0; i < this.drops.length; i++) this.drops[i] = Math.random();
  }

  setLevel(level: Level): void {
    this.level = level;
    this.lot = null;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  /** Fits the camera to the lot (or to a window around the cart on portrait phones). */
  fit(world: World | null, insetTop = 0, insetBottom = 0): void {
    if (!this.level) return;
    const [W, H] = this.level.size;
    const availH = Math.max(100, this.cssH - insetTop - insetBottom);
    this.follow = this.cssH > this.cssW * 1.15 && this.cssW < 900;
    if (this.follow) {
      this.camera.scale = this.cssW / 11;
    } else {
      this.camera.scale = Math.min(this.cssW / W, availH / H);
    }
    const viewW = this.cssW / this.camera.scale;
    const viewH = this.cssH / this.camera.scale;
    if (this.follow && world) {
      const b = world.cart.body;
      this.camera.cx = clampView(b.x, viewW, W);
      this.camera.cy = clampView(b.y, viewH, H);
    } else {
      this.camera.cx = W / 2;
      // Shift so the lot sits between the insets.
      this.camera.cy = H / 2 - (insetTop - insetBottom) / 2 / this.camera.scale;
    }
  }

  /** Smoothly follow a point (portrait phones). */
  track(x: number, y: number): void {
    if (!this.follow || !this.level) return;
    const [W, H] = this.level.size;
    const viewW = this.cssW / this.camera.scale;
    const viewH = this.cssH / this.camera.scale;
    // Look a little ahead of the cart.
    const tx = clampView(x, viewW, W);
    const ty = clampView(y, viewH, H);
    this.camera.cx += (tx - this.camera.cx) * 0.12;
    this.camera.cy += (ty - this.camera.cy) * 0.12;
  }

  private ensureLot(): void {
    if (!this.level) return;
    const ppm = Math.min(96, Math.max(12, Math.round(this.camera.scale * this.dpr)));
    if (this.lot && this.lotPpm === ppm) return;
    this.lot = lotCanvas(this.level, ppm);
    this.lotPpm = ppm;
  }

  /** Screen (CSS px) of a world point under the current camera (no zoom). */
  toScreen(x: number, y: number): [number, number] {
    return [
      (x - this.camera.cx) * this.camera.scale + this.cssW / 2,
      (y - this.camera.cy) * this.camera.scale + this.cssH / 2,
    ];
  }

  draw(world: World, o: FrameOptions): void {
    const ctx = this.ctx;
    this.ensureLot();
    const ppm = this.lotPpm;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#141516";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let scale = this.camera.scale;
    let cx = this.camera.cx;
    let cy = this.camera.cy;
    if (o.zoom > 0 && o.zoomAt && !o.reducedMotion) {
      const z = 1 + 0.35 * o.zoom;
      scale *= z;
      cx += (o.zoomAt[0] - cx) * 0.5 * o.zoom;
      cy += (o.zoomAt[1] - cy) * 0.5 * o.zoom;
    }
    const s = scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, this.canvas.width / 2 - cx * s, this.canvas.height / 2 - cy * s);
    ctx.imageSmoothingEnabled = true;

    if (this.lot) ctx.drawImage(this.lot, 0, 0, this.lot.width / ppm, this.lot.height / ppm);

    // The corral's cart stack and sign.
    this.drawCorral(world, o);

    // Shadows first, then cars.
    for (const car of world.cars) this.carShadow(car.body);
    for (const car of world.cars) {
      const sp = carSprite(car.model, car.colour, ppm);
      this.drawSprite(sp, car.body.x, car.body.y, car.body.a);
      if (car.door && car.door.open > 0.01)
        this.drawDoor(car.door.body, car.colour === "black" || car.manager ? "#26292d" : null, car);
    }

    for (const cone of world.cones) drawCone(ctx, cone.body.x, cone.body.y, cone.body.a, cone.down);

    if (o.path && o.path.length > 1) {
      ctx.strokeStyle = "#ffd400";
      ctx.lineWidth = 0.12;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(o.path[0]![0], o.path[0]![1]);
      for (const [x, y] of o.path) ctx.lineTo(x, y);
      ctx.stroke();
      for (const [x, y] of o.marks ?? []) {
        ctx.fillStyle = "#d21c18";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.arc(x, y, 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    const t = o.alpha;
    if (world.loose && o.prevLoose) {
      const b = world.loose;
      const p = o.prevLoose;
      this.drawCart(
        "standard",
        p.x + (b.x - p.x) * t,
        p.y + (b.y - p.y) * t,
        lerpAngle(p.a, b.a, t),
        true,
        ppm,
      );
    }
    const b = world.cart.body;
    const p = o.prevCart;
    const x = p.x + (b.x - p.x) * t;
    const y = p.y + (b.y - p.y) * t;
    const a = lerpAngle(p.a, b.a, t);
    if (o.showYou) {
      const pulse = o.reducedMotion ? 0 : Math.sin(o.time * 4) * 0.06;
      ctx.strokeStyle = "#ffd400";
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.arc(x, y, 0.95 + pulse, 0, Math.PI * 2);
      ctx.stroke();
      this.label(o.labels.you, x, y + 1.45, "#141516", "#fff", 0.42);
    }
    this.drawCart(world.cartId, x, y, a, false, ppm);

    if (world.level.surface === "wet") this.rain(o.time, o.reducedMotion);
  }

  private drawSprite(sp: Sprite, x: number, y: number, a: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    const w = sp.length + 2 * sp.pad;
    const h = sp.width + 2 * sp.pad;
    ctx.drawImage(sp.canvas, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  private carShadow(b: Body): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(b.x + SHADOW_DX, b.y + SHADOW_DY);
    ctx.rotate(b.a);
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    roundRect(ctx, -b.hx - 0.05, -b.hy - 0.02, b.hx * 2 + 0.1, b.hy * 2 + 0.04, b.hy * 0.6);
    ctx.fill();
    ctx.restore();
  }

  private drawDoor(d: Body, colourOverride: string | null, car: World["cars"][number]): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.a);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-d.hx + 0.06, -d.hy + 0.08, d.hx * 2, d.hy * 2);
    const paint = {
      silver: "#a9adb2",
      white: "#dfe0dc",
      black: "#26292d",
      red: "#b3201b",
      blue: "#264a8c",
      grey: "#5d6166",
    } as const;
    ctx.fillStyle = colourOverride ?? paint[car.colour];
    ctx.fillRect(-d.hx, -d.hy, d.hx * 2, d.hy * 2);
    ctx.fillStyle = "#1a1f26";
    ctx.fillRect(-d.hx * 0.6, -d.hy * 0.3, d.hx * 1.1, d.hy * 0.6);
    ctx.restore();
  }

  private drawCart(
    id: World["cartId"],
    x: number,
    y: number,
    a: number,
    abandoned: boolean,
    ppm: number,
  ): void {
    const { sprite, shadow } = cartSprite(abandoned ? "rusty" : id, ppm);
    this.drawSprite(shadow, x + SHADOW_DX * 0.8, y + SHADOW_DY * 0.8, a);
    this.drawSprite(sprite, x, y, a);
  }

  private drawCorral(world: World, o: FrameOptions): void {
    const ctx = this.ctx;
    const level = world.level;
    const row = level.rows[level.corral.row]!;
    const r = stallRect(row, level.corral.stall);
    const ppm = this.lotPpm;
    // A stack of returned carts at the back of the corral, nested at an angle.
    const { sprite, shadow } = cartSprite("standard", ppm);
    const down = row.opens === "down";
    const backY = down ? r.y + 0.75 : r.y + r.h - 0.75;
    for (let k = 0; k < 2; k++) {
      const x = r.x + 0.75 + k * 1.1;
      const a = down ? -Math.PI / 2 : Math.PI / 2;
      this.drawSprite(shadow, x + 0.2, backY + 0.3, a);
      this.drawSprite(sprite, x, backY, a);
      this.drawSprite(sprite, x, backY + (down ? 0.28 : -0.28), a);
    }
    // The blue sign on the rail.
    ctx.save();
    const sx = r.x + r.w - 0.2;
    const sy = down ? r.y + r.h * 0.45 : r.y + r.h * 0.55;
    ctx.translate(sx, sy);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(-0.55 + 0.12, -0.4 + 0.15, 1.1, 0.8);
    ctx.fillStyle = "#1f4fa8";
    ctx.fillRect(-0.55, -0.4, 1.1, 0.8);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.scale(0.01, 0.01);
    ctx.font = "700 15px 'Barlow Semi Condensed', sans-serif";
    ctx.fillText("DEVOLVA SEU", 0, -22);
    ctx.font = "700 22px 'Barlow Semi Condensed', sans-serif";
    ctx.fillStyle = "#ffd400";
    ctx.fillText("CARRINHO", 0, 0);
    ctx.font = "700 15px 'Barlow Semi Condensed', sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText("AQUI", 0, 22);
    ctx.restore();
    // The yellow tag over the open side.
    const tagY = down ? r.y + r.h + 0.75 : r.y - 0.75;
    const pulse = o.reducedMotion || world.status !== "playing" ? 0 : Math.sin(o.time * 3) * 0.03;
    this.tag(o.labels.returnHere, r.x + r.w / 2, tagY, -0.04 + pulse);
  }

  /** A yellow price-tag label with red text, tilted a degree or two. */
  private tag(text: string, x: number, y: number, rot: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(0.01, 0.01);
    ctx.font = "60px Anton, Impact, sans-serif";
    const w = ctx.measureText(text).width + 40;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(-w / 2 + 8, -42 + 10, w, 84);
    ctx.fillStyle = "#ffd400";
    ctx.fillRect(-w / 2, -42, w, 84);
    ctx.fillStyle = "#d21c18";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 3);
    ctx.restore();
  }

  private label(text: string, x: number, y: number, bg: string, fg: string, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.01, 0.01);
    ctx.font = `600 ${size * 100}px 'Barlow Semi Condensed', sans-serif`;
    const w = ctx.measureText(text).width + 30;
    const hgt = size * 100 + 18;
    ctx.fillStyle = bg;
    roundRect(ctx, -w / 2, -hgt / 2, w, hgt, 8);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 2);
    ctx.restore();
  }

  private rain(time: number, reduced: boolean): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "rgba(20, 35, 55, 0.22)";
    ctx.fillRect(0, 0, w, h);
    if (reduced) return;
    ctx.strokeStyle = "rgba(200, 215, 235, 0.35)";
    ctx.lineWidth = Math.max(1, this.dpr);
    ctx.beginPath();
    const n = this.drops.length / 3;
    for (let i = 0; i < n; i++) {
      const sx = this.drops[i * 3]!;
      const sy = this.drops[i * 3 + 1]!;
      const sp = 0.6 + this.drops[i * 3 + 2]! * 0.8;
      const x = ((sx + time * 0.05 * sp) % 1) * w;
      const y = ((sy + time * 0.9 * sp) % 1) * h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3 * this.dpr, y + 14 * this.dpr);
    }
    ctx.stroke();
  }
}

function clampView(c: number, view: number, size: number): number {
  if (view >= size) return size / 2;
  return Math.max(view / 2, Math.min(size - view / 2, c));
}
