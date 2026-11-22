import { describe, expect, it } from "vitest";
import { Camera3D } from "../../../src/ui/gl/camera";

const ASPECTS = [16 / 9, 4 / 3, 21 / 9, 1, 0.6];
const out: [number, number] = [0, 0];

describe("the camera over the lot", () => {
  it.each(ASPECTS)("frames the whole lot at aspect %f", (aspect) => {
    const cam = new Camera3D();
    cam.aspect = aspect;
    cam.frame(32, 18);
    for (const [x, y, z] of [
      [0, 0, 0],
      [32, 0, 0],
      [0, 18, 0],
      [32, 18, 0],
      [0, 0, 1.6],
      [32, 0, 1.6],
    ] as const) {
      cam.project(x, y, z, out);
      expect(Math.abs(out[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(out[1])).toBeLessThanOrEqual(1);
    }
  });

  it("uses the screen: the lot touches an edge and sits centred", () => {
    const cam = new Camera3D();
    cam.frame(32, 18);
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y, z] of [
      [32, 18, 0],
      [0, 18, 0],
      [0, 0, 1.6],
    ] as const) {
      cam.project(x, y, z, out);
      x1 = Math.max(x1, Math.abs(out[0]));
      y0 = Math.min(y0, out[1]);
      y1 = Math.max(y1, out[1]);
    }
    expect(Math.max(x1, (y1 - y0) / 2)).toBeGreaterThan(0.93);
    expect(Math.abs(y0 + y1)).toBeLessThan(0.05);
  });

  it("keeps east on the right and north at the top", () => {
    const cam = new Camera3D();
    cam.frame(32, 18);
    cam.project(32, 9, 0, out);
    expect(out[0]).toBeGreaterThan(0.5);
    cam.project(16, 0, 0, out);
    expect(out[1]).toBeGreaterThan(0.3);
  });

  it("stands south of the lot, above it, looking down at an angle", () => {
    const cam = new Camera3D();
    cam.frame(32, 18);
    expect(cam.eye[1]).toBeGreaterThan(cam.ty);
    expect(cam.eye[2]).toBeGreaterThan(10);
    expect(cam.fwd[2]).toBeLessThan(0);
    // Tall things lean away from the camera: a roof draws above its wheels.
    const ground: [number, number] = [0, 0];
    cam.project(16, 9, 0, ground);
    cam.project(16, 9, 1.5, out);
    expect(out[1]).toBeGreaterThan(ground[1]);
  });

  it("moves in when asked to fill the frame", () => {
    const whole = new Camera3D();
    whole.frame(32, 18);
    const close = new Camera3D();
    close.frame(32, 18, 0.8);
    expect(close.dist).toBeCloseTo(whole.dist * 0.8, 3);
    expect(close.groundWidth()).toBeLessThan(whole.groundWidth());
  });
});
