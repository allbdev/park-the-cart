import { describe, expect, it } from "vitest";
import { createRng, rngFromState } from "../../src/core/rng";

describe("rng", () => {
  it("repeats for the same seed", () => {
    const a = createRng("lombada");
    const b = createRng("lombada");
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it("differs between seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("pins its first outputs (same in every engine)", () => {
    const r = createRng("park-the-cart");
    const first = [r.int(0, 1_000_000), r.int(0, 1_000_000), r.int(0, 1_000_000)];
    expect(first).toMatchSnapshot();
  });

  it("is roughly uniform", () => {
    const r = createRng(42);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) buckets[Math.floor(r.next() * 10)]++;
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(500);
  });

  it("keeps int, range and pick in bounds", () => {
    const r = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const n = r.int(-3, 3);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(3);
      const x = r.range(2, 5);
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThan(5);
      expect(["a", "b"]).toContain(r.pick(["a", "b"]));
    }
  });

  it("resumes from a snapshot of its state", () => {
    const a = createRng("snap");
    a.next();
    const b = rngFromState(a.state());
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });
});
