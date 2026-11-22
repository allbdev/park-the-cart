import { describe, expect, it } from "vitest";
import { modelZ, mat4 } from "../../../src/ui/gl/mat";
import { hex, MeshBuilder, shade, STRIDE } from "../../../src/ui/gl/mesh";

function vertices(d: Float32Array) {
  const out = [];
  for (let i = 0; i < d.length; i += STRIDE)
    out.push({
      p: [d[i]!, d[i + 1]!, d[i + 2]!],
      n: [d[i + 3]!, d[i + 4]!, d[i + 5]!],
      uv: [d[i + 10]!, d[i + 11]!],
    });
  return out;
}

const unit = (n: number[]) => Math.hypot(n[0]!, n[1]!, n[2]!);

describe("MeshBuilder", () => {
  it("reads hex colours and shades them without overflowing", () => {
    expect(hex("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(shade([0.5, 1, 0.2], 2)).toEqual([1, 1, 0.4]);
  });

  it("builds a box of twelve triangles with unit normals inside its bounds", () => {
    const b = new MeshBuilder();
    b.paint("#102030", 0.5);
    b.box(1, 2, 3, 2, 4, 6);
    const d = b.build();
    expect(b.vertexCount).toBe(36);
    expect(d.length).toBe(36 * STRIDE);
    for (const v of vertices(d)) {
      expect(unit(v.n)).toBeCloseTo(1);
      expect(Math.abs(v.p[0]! - 1)).toBeCloseTo(1);
      expect(Math.abs(v.p[1]! - 2)).toBeCloseTo(2);
      expect(Math.abs(v.p[2]! - 3)).toBeCloseTo(3);
    }
    expect(d[6]).toBeCloseTo(16 / 255);
    expect(d[9]).toBeCloseTo(0.5);
  });

  it("lofts a closed skin whose normals point outwards", () => {
    const b = new MeshBuilder();
    b.loft([
      { x: -1, wb: 0.5, wt: 0.5, z0: 0, z1: 1, r: 0.2 },
      { x: 0, wb: 0.6, wt: 0.5, z0: 0, z1: 1.2, r: 0.2 },
      { x: 1, wb: 0.5, wt: 0.5, z0: 0, z1: 1, r: 0.2 },
    ]);
    const vs = vertices(b.build());
    // 2 spans x 16 ring points x 2 triangles, plus two caps of 16 triangles.
    expect(vs.length).toBe(2 * 16 * 6 + 2 * 16 * 3);
    for (const v of vs) {
      expect(unit(v.n)).toBeCloseTo(1);
      const out = v.p[0]! * v.n[0]! + v.p[1]! * v.n[1]! + (v.p[2]! - 0.55) * v.n[2]!;
      expect(out).toBeGreaterThan(-1e-6);
      expect(Math.abs(v.p[1]!)).toBeLessThanOrEqual(0.6 + 1e-6);
    }
  });

  it("makes cylinders along any axis", () => {
    for (const axis of ["x", "y", "z"] as const) {
      const b = new MeshBuilder();
      b.cyl(axis, 0, 0, 1, 2, 0.5, 0.5, 8);
      const i = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      for (const v of vertices(b.build())) {
        expect(v.p[i]!).toBeGreaterThanOrEqual(1 - 1e-6);
        expect(v.p[i]!).toBeLessThanOrEqual(3 + 1e-6);
        expect(unit(v.n)).toBeCloseTo(1);
      }
    }
  });

  it("leaves the caps off a cone's point", () => {
    const b = new MeshBuilder();
    b.cyl("z", 0, 0, 0, 1, 0.5, 0, 8);
    expect(b.vertexCount).toBe(8 * 6 + 8 * 3);
  });

  it("runs beams between any two points, also straight up", () => {
    const b = new MeshBuilder();
    b.beam([0, 0, 0], [0, 0, 2], 0.1);
    b.beam([0, 0, 0], [3, 4, 0], 0.1);
    for (const v of vertices(b.build())) {
      expect(v.p.every(Number.isFinite)).toBe(true);
      expect(unit(v.n)).toBeCloseTo(1);
    }
  });

  it("moves and turns what's built inside a transform", () => {
    const b = new MeshBuilder();
    b.with(modelZ(mat4(), 10, 0, 0, Math.PI / 2), () =>
      b.quad([1, 0, 0], [2, 0, 0], [2, 0, 1], [1, 0, 1], [0, 1, 0]),
    );
    const v = vertices(b.build())[0]!;
    expect(v.p[0]).toBeCloseTo(10);
    expect(v.p[1]).toBeCloseTo(1);
    expect(v.n[0]).toBeCloseTo(-1);
  });

  it("keeps texture coordinates on textured quads", () => {
    const b = new MeshBuilder();
    b.quadUv([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, 3, 0, 3, 2, 0, 2]);
    const uv = vertices(b.build()).map((v) => v.uv);
    expect(uv[1]).toEqual([3, 0]);
    expect(uv[2]).toEqual([3, 2]);
    expect(uv[5]).toEqual([0, 2]);
  });

  it("draws rings and ellipsoids with unit normals", () => {
    const b = new MeshBuilder();
    b.annulus(0, 0, 0.1, 0.5, 1, 12);
    b.ellipsoid(0, 0, 1, 0.5, 0.3, 0.2, 8);
    for (const v of vertices(b.build())) expect(unit(v.n)).toBeCloseTo(1);
  });
});
