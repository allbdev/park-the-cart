/**
 * Seeded random numbers: sfc32 (small, fast, passes PractRand), seeded through a string hash.
 * Only integer operations, so the sequence is identical in every engine.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** The raw 4-word state, so a simulation can be snapshotted. */
  state(): [number, number, number, number];
}

/** xmur3-style hash: a string into a 32-bit seed stream. */
export function hashString(s: string): () => number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function rngFromState(s: readonly [number, number, number, number]): Rng {
  let [a, b, c, d] = s;
  const nextU32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  const rng: Rng = {
    next: () => nextU32() / 4294967296,
    int: (min, max) => min + Math.floor((nextU32() / 4294967296) * (max - min + 1)),
    range: (min, max) => min + (nextU32() / 4294967296) * (max - min),
    pick: (items) => items[Math.floor((nextU32() / 4294967296) * items.length)]!,
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
  return rng;
}

export function createRng(seed: string | number): Rng {
  const h = hashString(String(seed));
  const rng = rngFromState([h(), h(), h(), h()]);
  for (let i = 0; i < 12; i++) rng.next(); // warm up
  return rng;
}
