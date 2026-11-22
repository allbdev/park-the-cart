import { mat4, mul, perspective, transformPoint, viewFromBasis, type Mat4, type Vec3 } from "./mat";

/**
 * The camera over the lot: it stands to the south, above, and looks north and down at a point on
 * the asphalt. `tilt` is the angle away from straight down. Screen right is +x and screen up is
 * north (-y), the same way round as the level files. Pure: no DOM, no GL.
 */

export const BASE_TILT = 0.5;
export const FOV_WIDE = 0.66;
export const FOV_PHONE = 0.82;

export class Camera3D {
  /** The point on the ground at the centre of the screen. */
  tx = 16;
  ty = 9;
  dist = 40;
  tilt = BASE_TILT;
  fovY = FOV_WIDE;
  aspect = 16 / 9;
  readonly eye: Vec3 = [0, 0, 0];
  readonly right: Vec3 = [1, 0, 0];
  readonly up: Vec3 = [0, -1, 0];
  readonly fwd: Vec3 = [0, 0, -1];
  readonly viewProj: Mat4 = mat4();
  private view = mat4();
  private proj = mat4();
  private tmp = new Float32Array(4);

  /** Recomputes the basis and the matrix after changing any field. */
  update(): void {
    const s = Math.sin(this.tilt);
    const c = Math.cos(this.tilt);
    this.fwd[0] = 0;
    this.fwd[1] = -s;
    this.fwd[2] = -c;
    this.up[0] = 0;
    this.up[1] = -c;
    this.up[2] = s;
    this.eye[0] = this.tx;
    this.eye[1] = this.ty + s * this.dist;
    this.eye[2] = c * this.dist;
    viewFromBasis(this.view, this.eye, this.right, this.up, this.fwd);
    perspective(
      this.proj,
      this.fovY,
      this.aspect,
      Math.max(0.5, this.dist * 0.05),
      this.dist * 4 + 80,
    );
    mul(this.viewProj, this.proj, this.view);
  }

  /** Normalised device coordinates (-1..1, y up) of a world point. Call `update` first. */
  project(x: number, y: number, z: number, out: [number, number]): void {
    transformPoint(this.viewProj, x, y, z, this.tmp);
    const w = this.tmp[3]! || 1e-6;
    out[0] = this.tmp[0]! / w;
    out[1] = this.tmp[1]! / w;
  }

  /** Metres of ground across the screen at the target. */
  groundWidth(): number {
    return 2 * this.dist * Math.tan(this.fovY / 2) * this.aspect;
  }

  /** Metres of ground from the bottom to the top of the screen, roughly (it's a trapezoid). */
  groundHeight(): number {
    return (2 * this.dist * Math.tan(this.fovY / 2)) / Math.cos(this.tilt);
  }

  /**
   * Frames a W x H lot: the nearest camera that keeps the whole lot (and the roofs of the far
   * row) on screen, centred. `fill` < 1 moves in past that, for backdrops.
   */
  frame(W: number, H: number, fill = 1): void {
    const p: [number, number] = [0, 0];
    this.tx = W / 2;
    this.ty = H / 2;
    const roof = 1.6;
    const bounds = (): [number, number, number, number] => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < 6; i++) {
        const x = i % 2 ? W : 0;
        const y = i < 2 || i > 3 ? 0 : H;
        this.project(x, y, i > 3 ? roof : 0, p);
        x0 = Math.min(x0, p[0]);
        x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]);
        y1 = Math.max(y1, p[1]);
      }
      return [x0, x1, y0, y1];
    };
    for (let pass = 0; pass < 5; pass++) {
      let lo = 2;
      let hi = 600;
      for (let i = 0; i < 28; i++) {
        this.dist = (lo + hi) / 2;
        this.update();
        const [x0, x1, y0, y1] = bounds();
        if (x0 < -0.985 || x1 > 0.985 || y1 - y0 > 1.94) lo = this.dist;
        else hi = this.dist;
      }
      this.dist = hi;
      this.update();
      const [, , y0, y1] = bounds();
      // Lot too high on screen: look further north (-y), which slides it down.
      this.ty -= ((y0 + y1) / 2) * (this.groundHeight() / 2);
    }
    this.dist *= fill;
    this.update();
  }
}
