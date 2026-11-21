import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decodeInputs,
  decodeReplay,
  encodeInputs,
  encodeReplay,
  MAX_REPLAY_LENGTH,
  packInput,
  unpackInput,
} from "../../src/core/replay";
import { quantise, simulate } from "../../src/core/world";
import type { Input } from "../../src/core/cart";
import { testLevel } from "./helpers";

const arbInput = fc.record({
  push: fc.integer({ min: -16, max: 16 }).map((n) => n / 16),
  turn: fc.integer({ min: -16, max: 16 }).map((n) => n / 16),
  hold: fc.boolean(),
});

describe("replay codec", () => {
  it("packs and unpacks every quantised input", () => {
    fc.assert(
      fc.property(arbInput, (i) => {
        expect(unpackInput(packInput(i))).toEqual(i);
      }),
    );
  });

  it("round-trips input logs (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbInput, fc.integer({ min: 1, max: 300 })), { maxLength: 60 }),
        (runs) => {
          const inputs: Input[] = runs.flatMap(([i, n]) => new Array(n).fill(i));
          expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
        },
      ),
    );
  });

  it("round-trips a whole replay and the run it describes", () => {
    const inputs: Input[] = [];
    for (let i = 0; i < 600; i++)
      inputs.push(
        quantise({ push: 1, turn: Math.round(Math.sin(i / 40) * 16) / 16, hold: i > 500 }),
      );
    const s = encodeReplay({ level: "test", cart: "standard", inputs });
    expect(s.startsWith("v1.test.standard.")).toBe(true);
    const r = decodeReplay(s)!;
    const a = simulate(testLevel(), "standard", inputs);
    const b = simulate(testLevel(), r.cart, r.inputs);
    expect([b.cart.body.x, b.cart.body.y, b.cart.body.a]).toEqual([
      a.cart.body.x,
      a.cart.body.y,
      a.cart.body.a,
    ]);
  });

  it("compresses a typical run to a short link", () => {
    const inputs = [
      ...new Array(300).fill({ push: 1, turn: 0, hold: false }),
      ...new Array(80).fill({ push: 1, turn: -1, hold: false }),
      ...new Array(200).fill({ push: 0, turn: 0, hold: true }),
    ];
    expect(encodeInputs(inputs).length).toBeLessThan(20);
  });

  it("rejects malformed links without throwing", () => {
    const bad = [
      "",
      "v1",
      "v2.test.standard.AAAA",
      "v1.TEST.standard.AAAA",
      "v1.test.racecar.AAAA",
      "v1.test.standard.!!!!",
      "v1.test.standard.",
      "v1.test.standard.AAAA.extra",
      "v1.<script>.standard.AAAA",
      "v1.test.standard." + "A".repeat(MAX_REPLAY_LENGTH + 10),
      // a run length of zero
      "v1.test.standard." + encodeRaw([5, 0]),
      // a value out of range
      "v1.test.standard." + encodeRaw([0xff, 0x7f, 1]),
      // an unterminated varint
      "v1.test.standard." + encodeRaw([0x80]),
      // too many ticks
      "v1.test.standard." + encodeRaw([5, 0xff, 0xff, 0x7f]),
    ];
    for (const s of bad) expect(decodeReplay(s), s.slice(0, 40)).toBeNull();
    expect(decodeReplay(null as unknown as string)).toBeNull();
  });

  it("survives random garbage (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        expect(() => decodeReplay(s)).not.toThrow();
        expect(() => decodeReplay("v1.test.standard." + s)).not.toThrow();
      }),
      { numRuns: 2000 },
    );
  });
});

function encodeRaw(bytes: number[]): string {
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    s += B64[a >> 2]!;
    s += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) s += B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) s += B64[c & 63]!;
  }
  return s;
}
