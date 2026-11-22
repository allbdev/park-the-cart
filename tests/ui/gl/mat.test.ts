import { describe, expect, it } from "vitest";
import {
  cross,
  mat4,
  modelZ,
  mul,
  normalize,
  ortho,
  perspective,
  transformPoint,
  viewFromBasis,
} from "../../../src/ui/gl/mat";

const p = new Float32Array(4);

describe("mat4", () => {
  it("multiplies by the identity without changing anything", () => {
    const m = modelZ(mat4(), 3, -2, 1, 0.7, 2);
    expect(Array.from(mul(mat4(), m, mat4()))).toEqual(Array.from(m));
    expect(Array.from(mul(mat4(), mat4(), m))).toEqual(Array.from(m));
  });

  it("applies the right-hand matrix first", () => {
    const move = modelZ(mat4(), 10, 0, 0, 0);
    const turn = modelZ(mat4(), 0, 0, 0, Math.PI / 2);
    transformPoint(mul(mat4(), move, turn), 1, 0, 0, p);
    expect(p[0]).toBeCloseTo(10);
    expect(p[1]).toBeCloseTo(1);
  });

  it("turns a model's nose from +x to its heading", () => {
    transformPoint(modelZ(mat4(), 5, 6, 0.5, Math.PI / 2), 2, 0, 1, p);
    expect(p[0]).toBeCloseTo(5);
    expect(p[1]).toBeCloseTo(8);
    expect(p[2]).toBeCloseTo(1.5);
  });

  it("puts a point straight ahead of the camera at the centre of the screen", () => {
    const view = viewFromBasis(mat4(), [0, 10, 10], [1, 0, 0], [0, -1, 0], [0, 0, -1]);
    const vp = mul(mat4(), perspective(mat4(), 1, 1.5, 0.1, 100), view);
    transformPoint(vp, 0, 10, 0, p);
    expect(p[0]! / p[3]!).toBeCloseTo(0);
    expect(p[1]! / p[3]!).toBeCloseTo(0);
    // +x is screen right, north (-y) is screen up.
    transformPoint(vp, 1, 9, 0, p);
    expect(p[0]! / p[3]!).toBeGreaterThan(0);
    expect(p[1]! / p[3]!).toBeGreaterThan(0);
  });

  it("maps an orthographic box onto the clip cube", () => {
    const o = ortho(mat4(), -2, 6, -1, 3, 1, 9);
    transformPoint(o, -2, -1, -1, p);
    expect(Array.from(p.subarray(0, 3)).map((v) => Math.round(v))).toEqual([-1, -1, -1]);
    transformPoint(o, 6, 3, -9, p);
    expect(Array.from(p.subarray(0, 3)).map((v) => Math.round(v))).toEqual([1, 1, 1]);
  });

  it("has a cross product and a normalise", () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    const n = normalize([3, 0, 4]);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[2]).toBeCloseTo(0.8);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
