import type { CarColour, CarModel } from "../content/cars";
import { CAR_SPECS } from "../content/cars";
import { CARTS, type CartId } from "../content/carts";
import { stallRect, type Level } from "../core/level";
import type { World } from "../core/world";
import { lotCanvas } from "./art";
import { BASE_TILT, Camera3D, FOV_PHONE, FOV_WIDE } from "./gl/camera";
import {
  cross,
  mat4,
  modelZ,
  mul,
  normalize,
  ortho,
  transformPoint,
  viewFromBasis,
  type Vec3,
} from "./gl/mat";
import { STRIDE } from "./gl/mesh";
import {
  cartModel,
  carModel,
  coneModel,
  doorModel,
  levelModel,
  markModel,
  quadModel,
  ringModel,
} from "./gl/models";
import { DEPTH_FRAG, DEPTH_VERT, FRAG, MODE, VERT } from "./gl/shaders";
import type { FrameOptions, LotRenderer } from "./render";

/**
 * The car park in 3D, on WebGL 2: modelled cars and carts, one sun with a shadow map, a camera
 * that stands south of the lot and looks down at it, and swoops in when something gets hit. Like
 * the 2D renderer it only reads the world.
 */

const SHADOW_SIZE = 2048;
const PHONE_VIEW = 11.5;
/** Towards the sun: low in the north-east, so shadows fall towards the camera, down and left. */
const SUN: Vec3 = normalize([0.62, -0.5, 0.66]);
/** While playing, the camera sits this much closer than the whole lot and leans after the cart. */
const PLAY_FILL = 0.8;

interface Gpu {
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  count: number;
}

interface Program {
  p: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

interface Label {
  tex: WebGLTexture;
  /** Size in metres. */
  w: number;
  h: number;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string, names: string[]): Program {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(`shader: ${gl.getShaderInfoLog(s) ?? ""}`);
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(`program: ${gl.getProgramInfoLog(p) ?? ""}`);
  const u: Program["u"] = {};
  for (const n of names) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

const MAIN_UNIFORMS = [
  "uModel",
  "uViewProj",
  "uLightVP",
  "uMode",
  "uTex",
  "uShadow",
  "uEye",
  "uSun",
  "uSunCol",
  "uSkyCol",
  "uBounceCol",
  "uShadowK",
  "uShadowTexel",
  "uAlpha",
  "uView",
];
const DEPTH_UNIFORMS = ["uModel", "uLightVP", "uMode", "uTex"];

let supported: boolean | null = null;

/** Test hook (?test=1&gfx=flat): use the flat renderer even where 3D works. */
export function forceFlat(): void {
  supported = false;
}

/** True when this browser can run the 3D renderer (WebGL 2 and both shaders compile). */
export function supports3d(): boolean {
  if (supported !== null) return supported;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return (supported = false);
    compile(gl, VERT, FRAG, []);
    compile(gl, DEPTH_VERT, DEPTH_FRAG, []);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    supported = true;
  } catch {
    supported = false;
  }
  return supported;
}

export class Renderer3D implements LotRenderer {
  readonly canvas: HTMLCanvasElement;
  follow = false;
  private gl: WebGL2RenderingContext;
  private main: Program;
  private depth: Program;
  private cur: Program;
  private cam = new Camera3D();
  private level: Level | null = null;
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  /** The camera before any hit zoom: target and distance. */
  private bx = 16;
  private by = 9;
  private bdist = 40;
  /** Wide screens: the framed centre, and how much of the cart's offset the view follows. */
  private fx = 16;
  private fy = 9;
  private pan = 0;

  private ground: Gpu | null = null;
  private solid: Gpu | null = null;
  private sign: Gpu | null = null;
  private groundTex: WebGLTexture | null = null;
  private signTex: WebGLTexture;
  private wireTex: WebGLTexture;
  private blobTex: WebGLTexture;
  private shadowTex: WebGLTexture;
  private shadowFbo: WebGLFramebuffer;
  private quad: Gpu;
  private ring: Gpu;
  private mark: Gpu;
  private cone: Gpu;
  private coneDown: Gpu;
  private dyn: Gpu;
  private dynData = new Float32Array(STRIDE * 6 * 512);
  private cars = new Map<string, Gpu>();
  private doors = new Map<string, Gpu>();
  private carts = new Map<CartId, { solid: Gpu; wire: Gpu }>();
  private labels = new Map<string, Label>();
  private lightVP = mat4();
  private model = mat4();
  private drops: Float32Array;
  private aniso: number;
  private scratch: [number, number] = [0, 0];
  /** Resolution scale: drops a step when frames come in slowly (old phones, software GL). */
  private windTime = 0;
  private windShift = 0;
  private quality = 1;
  private lastFrame = 0;
  private slow = 0;
  private timed = 0;
  // The moving bodies, interpolated for this frame.
  private px = 0;
  private py = 0;
  private pa = 0;
  /** x, y, heading of each abandoned cart. */
  private loose = new Float32Array(0);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL 2 is not available");
    this.gl = gl;
    this.main = compile(gl, VERT, FRAG, MAIN_UNIFORMS);
    this.depth = compile(gl, DEPTH_VERT, DEPTH_FRAG, DEPTH_UNIFORMS);
    this.cur = this.main;
    const ext = gl.getExtension("EXT_texture_filter_anisotropic");
    this.aniso = ext
      ? Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
      : 0;

    this.quad = this.mesh(quadModel());
    this.ring = this.mesh(ringModel());
    this.mark = this.mesh(markModel());
    this.cone = this.mesh(coneModel(false));
    this.coneDown = this.mesh(coneModel(true));
    this.dyn = this.mesh(this.dynData, true);
    this.wireTex = this.texture(wireCanvas(), true);
    this.blobTex = this.texture(blobCanvas(), false);
    this.signTex = this.texture(signCanvas(), false);

    // The sun's depth map.
    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.drops = new Float32Array(260 * 3);
    for (let i = 0; i < this.drops.length; i++) this.drops[i] = Math.random();
  }

  /* ---------------------------------------------------------------- resources */

  private mesh(data: Float32Array, dynamic = false): Gpu {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const buf = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const stride = STRIDE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 40);
    gl.bindVertexArray(null);
    return { vao, buf, count: dynamic ? 0 : data.length / STRIDE };
  }

  private free(m: Gpu | null): void {
    if (!m) return;
    this.gl.deleteVertexArray(m.vao);
    this.gl.deleteBuffer(m.buf);
  }

  private texture(c: HTMLCanvasElement, repeat: boolean): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    // 0x84FE: TEXTURE_MAX_ANISOTROPY_EXT. Keeps the paint sharp at the far end of the lot.
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, 0x84fe, this.aniso);
    return t;
  }

  private label(kind: "tag" | "pill", text: string): Label {
    const key = `${kind}:${text}`;
    let l = this.labels.get(key);
    if (!l) {
      const c = kind === "tag" ? tagCanvas(text) : pillCanvas(text);
      l = { tex: this.texture(c, false), w: c.width / 100, h: c.height / 100 };
      this.labels.set(key, l);
    }
    return l;
  }

  private car(model: CarModel, colour: CarColour): Gpu {
    const key = `${model}:${colour}`;
    let m = this.cars.get(key);
    if (!m) {
      m = this.mesh(carModel(model, colour));
      this.cars.set(key, m);
    }
    return m;
  }

  private door(colour: CarColour, hx: number, hy: number): Gpu {
    const key = `${colour}:${hx.toFixed(2)}:${hy.toFixed(2)}`;
    let m = this.doors.get(key);
    if (!m) {
      m = this.mesh(doorModel(colour, hx, hy));
      this.doors.set(key, m);
    }
    return m;
  }

  private cart(id: CartId): { solid: Gpu; wire: Gpu } {
    let m = this.carts.get(id);
    if (!m) {
      const c = cartModel(id);
      m = { solid: this.mesh(c.solid), wire: this.mesh(c.wire) };
      this.carts.set(id, m);
    }
    return m;
  }

  /** `ppm` is the resolution of the painted asphalt, pixels per metre. */
  setLevel(level: Level, ppm = 64): void {
    const gl = this.gl;
    this.level = level;
    this.free(this.ground);
    this.free(this.solid);
    this.free(this.sign);
    if (this.groundTex) gl.deleteTexture(this.groundTex);
    const m = levelModel(level);
    this.ground = this.mesh(m.ground);
    this.solid = this.mesh(m.solid);
    this.sign = this.mesh(m.sign);
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const fit = Math.min(ppm, Math.floor(max / Math.max(level.size[0], level.size[1])));
    this.groundTex = this.texture(lotCanvas(level, fit, true), false);

    // The sun's view: an orthographic box around the lot.
    const [W, H] = level.size;
    const f: Vec3 = [-SUN[0], -SUN[1], -SUN[2]];
    const r = normalize(cross(f, [0, 0, 1]));
    const u = normalize(cross(r, f));
    const eye: Vec3 = [W / 2 + SUN[0] * 80, H / 2 + SUN[1] * 80, SUN[2] * 80];
    const view = viewFromBasis(mat4(), eye, r, u, f);
    const p = new Float32Array(4);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let n = Infinity;
    let fz = -Infinity;
    for (let i = 0; i < 8; i++) {
      transformPoint(view, i & 1 ? W + 6 : -6, i & 2 ? H + 6 : -6, i & 4 ? 4 : -0.5, p);
      x0 = Math.min(x0, p[0]!);
      x1 = Math.max(x1, p[0]!);
      y0 = Math.min(y0, p[1]!);
      y1 = Math.max(y1, p[1]!);
      n = Math.min(n, -p[2]!);
      fz = Math.max(fz, -p[2]!);
    }
    mul(this.lightVP, ortho(mat4(), x0, x1, y0, y1, n - 1, fz + 1), view);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(this.cssW * this.dpr * this.quality);
    this.canvas.height = Math.round(this.cssH * this.dpr * this.quality);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.cam.aspect = this.cssW / this.cssH;
  }

  /** Frames the whole lot, or a window around the cart on portrait phones. */
  fit(world: World | null, fill = 1): void {
    if (!this.level) return;
    const [W, H] = this.level.size;
    const cam = this.cam;
    cam.tilt = BASE_TILT;
    this.follow = this.cssH > this.cssW * 1.15 && this.cssW < 900;
    if (this.follow) {
      cam.fovY = FOV_PHONE;
      this.bdist = PHONE_VIEW / (2 * Math.tan(cam.fovY / 2) * cam.aspect);
      const b = world?.cart.body;
      this.bx = this.clampX(b ? b.x : W / 2);
      this.by = this.clampY(b ? b.y : H / 2);
    } else {
      cam.fovY = FOV_WIDE;
      cam.frame(W, H, 1);
      this.fx = cam.tx;
      this.fy = cam.ty;
      this.pan = world && fill === 1 ? 1 - PLAY_FILL : 0;
      this.bdist = cam.dist * (this.pan ? PLAY_FILL : fill);
      const b = world?.cart.body;
      this.bx = this.panX(b ? b.x : W / 2);
      this.by = this.panY(b ? b.y : H / 2);
    }
  }

  /** Wide screens: the view slides with the cart just far enough to keep the lot's edge in. */
  private panX(x: number): number {
    const half = this.level!.size[0] / 2;
    const d = Math.max(-half, Math.min(half, (x - half) * 1.5));
    return this.fx + d * this.pan;
  }

  private panY(y: number): number {
    const half = this.level!.size[1] / 2;
    const d = Math.max(-half, Math.min(half, (y - half) * 1.5));
    return this.fy + d * this.pan;
  }

  private clampX(x: number): number {
    const W = this.level!.size[0];
    const half = PHONE_VIEW / 2 - 1.5;
    return half * 2 >= W ? W / 2 : Math.max(half, Math.min(W - half, x));
  }

  private clampY(y: number): number {
    const H = this.level!.size[1];
    const half = (this.bdist * Math.tan(this.cam.fovY / 2)) / Math.cos(BASE_TILT) - 3;
    // The camera looks north, so sit a little north of the cart: more of the lot ahead.
    return half * 2 >= H ? H / 2 : Math.max(half, Math.min(H - half, y - 0.5));
  }

  track(x: number, y: number): void {
    if (!this.level) return;
    const tx = this.follow ? this.clampX(x) : this.panX(x);
    const ty = this.follow ? this.clampY(y) : this.panY(y);
    this.bx += (tx - this.bx) * 0.12;
    this.by += (ty - this.by) * 0.12;
  }

  private aim(zoom: number, at: [number, number] | null): void {
    const cam = this.cam;
    cam.tx = this.bx;
    cam.ty = this.by;
    cam.dist = this.bdist;
    cam.tilt = BASE_TILT;
    if (zoom > 0 && at) {
      // A hit: drop the camera towards the cart, like a replay on the evening news.
      cam.tx += (at[0] - cam.tx) * 0.7 * zoom;
      cam.ty += (at[1] - cam.ty) * 0.7 * zoom;
      cam.dist *= 1 - 0.42 * zoom;
      cam.tilt += 0.3 * zoom;
    }
    cam.update();
  }

  toScreen(x: number, y: number): [number, number] {
    this.aim(0, null);
    this.cam.project(x, y, 0.5, this.scratch);
    return [(this.scratch[0] * 0.5 + 0.5) * this.cssW, (0.5 - this.scratch[1] * 0.5) * this.cssH];
  }

  dispose(): void {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  /* ---------------------------------------------------------------- drawing */

  private put(m: Gpu, mode: number, lines = false): void {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.cur.u.uModel!, false, this.model);
    gl.uniform1i(this.cur.u.uMode!, mode);
    gl.bindVertexArray(m.vao);
    gl.drawArrays(lines ? gl.LINES : gl.TRIANGLES, 0, m.count);
  }

  private at(m: Gpu, mode: number, x: number, y: number, a: number, z = 0, scale = 1): void {
    modelZ(this.model, x, y, z, a, scale);
    this.put(m, mode);
  }

  private bindTex(t: WebGLTexture | null): void {
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, t);
  }

  /** Everything solid that stands on the lot and casts a shadow. */
  private solids(world: World): void {
    modelZ(this.model, 0, 0, 0, 0);
    this.put(this.solid!, MODE.solid);
    for (const car of world.cars) {
      this.at(this.car(car.model, car.colour), MODE.solid, car.body.x, car.body.y, car.body.a);
      const d = car.door;
      if (d && d.open > 0.01) {
        const colour = car.manager ? "black" : car.colour;
        this.at(this.door(colour, d.body.hx, d.body.hy), MODE.solid, d.body.x, d.body.y, d.body.a);
      }
    }
    for (const c of world.cones)
      this.at(c.down ? this.coneDown : this.cone, MODE.solid, c.body.x, c.body.y, c.body.a);
    this.eachCart(world, false);
  }

  /** The carts: the player's, the abandoned one, and the row waiting in the corral. */
  private eachCart(world: World, wire: boolean): void {
    const mode = wire ? MODE.wire : MODE.solid;
    const pick = (id: CartId) => (wire ? this.cart(id).wire : this.cart(id).solid);
    const level = world.level;
    const row = level.rows[level.corral.row]!;
    const r = stallRect(row, level.corral.stall);
    const down = row.opens === "down";
    const backY = down ? r.y + 0.8 : r.y + r.h - 0.8;
    const a = down ? -Math.PI / 2 : Math.PI / 2;
    const std = pick("standard");
    if (std.count) {
      for (let k = 0; k < 2; k++) {
        const x = r.x + 0.72 + k * 1.14;
        this.at(std, mode, x, backY, a);
        this.at(std, mode, x, backY + (down ? 0.3 : -0.3), a);
      }
    }
    const rusty = pick("rusty");
    if (rusty.count) {
      for (let i = 0; i < world.loose.length; i++)
        this.at(rusty, mode, this.loose[i * 3]!, this.loose[i * 3 + 1]!, this.loose[i * 3 + 2]!);
    }
    const mine = pick(world.cartId);
    if (mine.count) this.at(mine, mode, this.px, this.py, this.pa, world.onBump ? 0.05 : 0);
  }

  /** A quad that always faces the camera, `w` by `h` metres, rolled by `rot`. */
  private billboard(x: number, y: number, z: number, w: number, h: number, rot: number): void {
    const { right, up, fwd } = this.cam;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const m = this.model;
    for (let i = 0; i < 3; i++) {
      m[i] = (right[i]! * c + up[i]! * s) * w;
      m[4 + i] = (up[i]! * c - right[i]! * s) * h;
      m[8 + i] = -fwd[i]!;
    }
    m[3] = m[7] = m[11] = 0;
    m[12] = x;
    m[13] = y;
    m[14] = z;
    m[15] = 1;
    this.put(this.quad, MODE.label);
  }

  private dynVertex(i: number, x: number, y: number, z: number, r: number, g: number, b: number) {
    const d = this.dynData;
    const o = i * STRIDE;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = 0;
    d[o + 4] = 0;
    d[o + 5] = 1;
    d[o + 6] = r;
    d[o + 7] = g;
    d[o + 8] = b;
    d[o + 9] = 0;
    d[o + 10] = 0;
    d[o + 11] = 0;
  }

  private dynFlush(count: number, lines: boolean): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.dynData.subarray(0, count * STRIDE), gl.DYNAMIC_DRAW);
    this.dyn.count = count;
    modelZ(this.model, 0, 0, 0, 0);
    this.put(this.dyn, MODE.flat, lines);
  }

  private dynReserve(vertices: number): void {
    if (this.dynData.length >= vertices * STRIDE) return;
    this.dynData = new Float32Array(vertices * STRIDE * 2);
  }

  draw(world: World, o: FrameOptions): void {
    const gl = this.gl;
    if (!this.level || !this.ground || !this.solid || !this.sign) return;
    this.pace();
    const wet = world.level.surface === "wet";

    const t = o.alpha;
    const b = world.cart.body;
    this.px = o.prevCart.x + (b.x - o.prevCart.x) * t;
    this.py = o.prevCart.y + (b.y - o.prevCart.y) * t;
    this.pa = lerpAngle(o.prevCart.a, b.a, t);
    const loose = world.loose;
    if (this.loose.length < loose.length * 3) this.loose = new Float32Array(loose.length * 3);
    for (let i = 0; i < loose.length; i++) {
      const l = loose[i]!;
      const p = o.prevLoose[i] ?? l;
      this.loose[i * 3] = p.x + (l.x - p.x) * t;
      this.loose[i * 3 + 1] = p.y + (l.y - p.y) * t;
      this.loose[i * 3 + 2] = lerpAngle(p.a, l.a, t);
    }
    this.aim(o.reducedMotion ? 0 : o.zoom, o.zoomAt);
    const cam = this.cam;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    // 1. The sun's depth map.
    this.cur = this.depth;
    gl.useProgram(this.depth.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(this.depth.u.uLightVP!, false, this.lightVP);
    gl.uniform1i(this.depth.u.uTex!, 0);
    this.bindTex(this.wireTex);
    this.solids(world);
    this.eachCart(world, true);

    // 2. The picture.
    this.cur = this.main;
    const u = this.main.u;
    gl.useProgram(this.main.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.07, 0.075, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(u.uViewProj!, false, cam.viewProj);
    gl.uniformMatrix4fv(u.uLightVP!, false, this.lightVP);
    gl.uniform3f(u.uEye!, cam.eye[0], cam.eye[1], cam.eye[2]);
    gl.uniform3f(u.uSun!, SUN[0], SUN[1], SUN[2]);
    if (wet) {
      gl.uniform3f(u.uSunCol!, 0.7, 0.76, 0.86);
      gl.uniform3f(u.uSkyCol!, 0.42, 0.48, 0.58);
      gl.uniform3f(u.uBounceCol!, 0.2, 0.22, 0.26);
      gl.uniform1f(u.uShadowK!, 0.55);
    } else {
      gl.uniform3f(u.uSunCol!, 2.0, 1.86, 1.6);
      gl.uniform3f(u.uSkyCol!, 0.34, 0.4, 0.52);
      gl.uniform3f(u.uBounceCol!, 0.26, 0.24, 0.22);
      gl.uniform1f(u.uShadowK!, 0.94);
    }
    gl.uniform1f(u.uShadowTexel!, 1 / SHADOW_SIZE);
    gl.uniform1f(u.uAlpha!, 1);
    gl.uniform2f(u.uView!, this.canvas.width, this.canvas.height);
    gl.uniform1i(u.uTex!, 0);
    gl.uniform1i(u.uShadow!, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);

    modelZ(this.model, 0, 0, 0, 0);
    this.bindTex(this.groundTex);
    this.put(this.ground, MODE.textured);
    this.bindTex(this.signTex);
    this.put(this.sign, MODE.textured);

    // Soft dark under every car and cart, where the sky can't reach.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.bindTex(this.blobTex);
    gl.uniform1f(u.uAlpha!, wet ? 0.5 : 0.62);
    for (const car of world.cars) {
      const s = CAR_SPECS[car.model];
      this.blob(car.body.x, car.body.y, car.body.a, s.length + 0.5, s.width + 0.5);
    }
    const mine = CARTS[world.cartId];
    gl.uniform1f(u.uAlpha!, 0.3);
    this.blob(this.px, this.py, this.pa, mine.length + 0.3, mine.width + 0.3);
    for (let i = 0; i < world.loose.length; i++)
      this.blob(this.loose[i * 3]!, this.loose[i * 3 + 1]!, this.loose[i * 3 + 2]!, 1.3, 0.9);
    gl.uniform1f(u.uAlpha!, 1);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    this.solids(world);
    this.overlays(o);

    // The wire baskets last: they're see-through.
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    this.bindTex(this.wireTex);
    this.eachCart(world, true);

    this.labelsPass(world, o);
    if (wet && !o.reducedMotion) this.rain(o.time);
    if (world.wind && !o.reducedMotion) this.wind(o.time, world.wind);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /** Watches the frame rate and trades sharpness for speed when it can't keep up. */
  private pace(): void {
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    // Ignore the first frame and pauses (a hidden tab, a still picture).
    if (dt > 250 || this.quality <= 0.5) return;
    this.timed++;
    if (dt > 30) this.slow++;
    if (this.timed < 60) return;
    if (this.slow > 40) {
      this.quality = this.quality > 0.75 ? 0.75 : 0.5;
      this.resize(this.cssW, this.cssH, this.dpr);
    }
    this.timed = 0;
    this.slow = 0;
  }

  private blob(x: number, y: number, a: number, len: number, wid: number): void {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const m = this.model;
    m.fill(0);
    m[0] = c * len;
    m[1] = s * len;
    m[4] = -s * wid;
    m[5] = c * wid;
    m[10] = 1;
    m[12] = x;
    m[13] = y;
    m[14] = 0.012;
    m[15] = 1;
    this.put(this.quad, MODE.blob);
  }

  /** Flat things drawn on the asphalt: the replay's path and hit marks, the ring round the cart. */
  private overlays(o: FrameOptions): void {
    const path = o.path;
    if (path && path.length > 1) {
      this.dynReserve(path.length * 6);
      let n = 0;
      const hw = 0.065;
      for (let i = 0; i < path.length - 1; i++) {
        const [x0, y0] = path[i]!;
        const [x1, y1] = path[i + 1]!;
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = (-(y1 - y0) / len) * hw;
        const ny = ((x1 - x0) / len) * hw;
        const ex = ((x1 - x0) / len) * hw;
        const ey = ((y1 - y0) / len) * hw;
        const z = 0.03;
        this.dynVertex(n++, x0 - ex + nx, y0 - ey + ny, z, 1, 0.83, 0);
        this.dynVertex(n++, x1 + ex + nx, y1 + ey + ny, z, 1, 0.83, 0);
        this.dynVertex(n++, x1 + ex - nx, y1 + ey - ny, z, 1, 0.83, 0);
        this.dynVertex(n++, x0 - ex + nx, y0 - ey + ny, z, 1, 0.83, 0);
        this.dynVertex(n++, x1 + ex - nx, y1 + ey - ny, z, 1, 0.83, 0);
        this.dynVertex(n++, x0 - ex - nx, y0 - ey - ny, z, 1, 0.83, 0);
      }
      this.dynFlush(n, false);
      for (const [x, y] of o.marks ?? []) this.at(this.mark, MODE.flat, x, y, 0, 0.04, 0.34);
    }
    if (o.showYou) {
      const pulse = o.reducedMotion ? 0 : Math.sin(o.time * 4) * 0.06;
      this.at(this.ring, MODE.flat, this.px, this.py, 0, 0.03, 0.95 + pulse);
    }
  }

  private labelsPass(world: World, o: FrameOptions): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    if (o.labels.returnHere) {
      const level = world.level;
      const row = level.rows[level.corral.row]!;
      const r = stallRect(row, level.corral.stall);
      const openY = row.opens === "down" ? r.y + r.h : r.y;
      const pulse = o.reducedMotion || world.status !== "playing" ? 0 : Math.sin(o.time * 3) * 0.03;
      const l = this.label("tag", o.labels.returnHere);
      this.bindTex(l.tex);
      this.billboard(r.x + r.w / 2, openY, 2.1, l.w, l.h, 0.04 - pulse);
    }
    if (o.showYou && o.labels.you) {
      const l = this.label("pill", o.labels.you);
      this.bindTex(l.tex);
      this.billboard(this.px, this.py + 1.5, 0.3, l.w, l.h, 0);
    }
    gl.enable(gl.DEPTH_TEST);
  }

  /**
   * The wind, made visible: streaks sweeping over the lot the way it blows. A gust makes them
   * longer, brighter and faster, so you can see it coming across the asphalt.
   */
  private wind(time: number, w: NonNullable<World["wind"]>): void {
    const [W, H] = this.level!.size;
    const n = 110;
    const len = Math.hypot(w.ax, w.ay) || 1;
    const dx = w.ax / len;
    const dy = w.ay / len;
    // Advance by how hard it's blowing since the last frame (not by the clock alone, or the
    // streaks would jump when a gust changes their speed).
    const dt = Math.max(0, Math.min(0.1, time - this.windTime));
    this.windTime = time;
    this.windShift += dt * (1.5 + 14 * w.level);
    const span = Math.max(W, H) + 12;
    this.dynReserve(n * 6);
    let v = 0;
    const streak = 0.5 + 3 * w.level;
    const hw = 0.035;
    for (let i = 0; i < n; i++) {
      // Each streak has its own lane across the wind and its own place along it.
      const across = (this.drops[i * 3]! - 0.5) * span;
      const along =
        ((this.drops[i * 3 + 1]! * span + this.windShift * (0.7 + this.drops[i * 3 + 2]! * 0.6)) %
          span) -
        span / 2;
      const x = W / 2 + dx * along - dy * across;
      const y = H / 2 + dy * along + dx * across;
      const z = 0.25 + this.drops[i * 3 + 2]! * 1.3;
      const x1 = x + dx * streak;
      const y1 = y + dy * streak;
      const px = -dy * hw;
      const py = dx * hw;
      this.dynVertex(v++, x + px, y + py, z, 1, 1, 1);
      this.dynVertex(v++, x1 + px, y1 + py, z, 1, 1, 1);
      this.dynVertex(v++, x1 - px, y1 - py, z, 1, 1, 1);
      this.dynVertex(v++, x + px, y + py, z, 1, 1, 1);
      this.dynVertex(v++, x1 - px, y1 - py, z, 1, 1, 1);
      this.dynVertex(v++, x - px, y - py, z, 1, 1, 1);
    }
    this.gl.uniform1f(this.main.u.uAlpha!, 0.1 + 0.5 * Math.min(1, w.level));
    this.dynFlush(v, false);
    this.gl.uniform1f(this.main.u.uAlpha!, 1);
  }

  private rain(time: number): void {
    const [W, H] = this.level!.size;
    const n = this.drops.length / 3;
    this.dynReserve(n * 2);
    for (let i = 0; i < n; i++) {
      const sp = 0.7 + this.drops[i * 3 + 2]! * 0.6;
      const x = -4 + this.drops[i * 3]! * (W + 8);
      const y = -4 + this.drops[i * 3 + 1]! * (H + 10);
      const fall = (this.drops[i * 3 + 2]! * 7 + time * sp * 1.6) % 1;
      const z = 9 * (1 - fall);
      this.dynVertex(i * 2, x, y, z, 0.8, 0.86, 0.95);
      this.dynVertex(i * 2 + 1, x + 0.06, y + 0.03, z + 0.55, 0.8, 0.86, 0.95);
    }
    this.gl.uniform1f(this.main.u.uAlpha!, 0.4);
    this.dynFlush(n * 2, true);
    this.gl.uniform1f(this.main.u.uAlpha!, 1);
  }
}

/* -------------------------------------------------------------------- textures */

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return [c, c.getContext("2d")!];
}

/** One cell of the baskets' mesh: wire along two edges, nothing in the middle. */
function wireCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas2d(64, 64);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 64, 9);
  ctx.fillRect(0, 0, 9, 64);
  return c;
}

function blobCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas2d(64, 64);
  const g = ctx.createRadialGradient(32, 32, 6, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.55, "rgba(0,0,0,0.75)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

/** The blue sign at the back of the corral. Set dressing, like the paint on the asphalt. */
function signCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas2d(384, 256);
  ctx.fillStyle = "#1f4fa8";
  ctx.fillRect(0, 0, 384, 256);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 360, 232);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.font = "700 44px 'Barlow Semi Condensed', sans-serif";
  ctx.fillText("DEVOLVA SEU", 192, 68);
  ctx.fillStyle = "#ffd400";
  ctx.font = "700 70px 'Barlow Semi Condensed', sans-serif";
  ctx.fillText("CARRINHO", 192, 132);
  ctx.fillStyle = "#fff";
  ctx.font = "700 44px 'Barlow Semi Condensed', sans-serif";
  ctx.fillText("AQUI", 192, 196);
  return c;
}

/** A yellow price tag with red lettering, 100 px per metre. */
function tagCanvas(text: string): HTMLCanvasElement {
  const font = "60px Anton, Impact, sans-serif";
  const [, probe] = canvas2d(1, 1);
  probe.font = font;
  const w = probe.measureText(text).width + 44;
  const [c, ctx] = canvas2d(w + 10, 96);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(10, 12, w, 84);
  ctx.fillStyle = "#ffd400";
  ctx.fillRect(0, 0, w, 84);
  ctx.fillStyle = "#d21c18";
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, 45);
  return c;
}

function pillCanvas(text: string): HTMLCanvasElement {
  const font = "600 42px 'Barlow Semi Condensed', sans-serif";
  const [, probe] = canvas2d(1, 1);
  probe.font = font;
  const w = probe.measureText(text).width + 32;
  const [c, ctx] = canvas2d(w, 60);
  ctx.fillStyle = "#141516";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 60, 9);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, 32);
  return c;
}
