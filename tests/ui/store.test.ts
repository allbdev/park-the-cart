import { describe, expect, it } from "vitest";
import { CART_IDS } from "../../src/content/carts";
import {
  cartUnlocked,
  doneWith,
  emptyProgress,
  loadProgress,
  markDone,
  parseProgress,
  saveProgress,
} from "../../src/ui/store";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const good = {
  level: "03-speed-bump",
  cart: "standard",
  parked: true,
  damage: 62000,
  ticks: 4560,
  lines: 1,
};

describe("progress storage", () => {
  it("round-trips", () => {
    const s = memoryStorage();
    const p = emptyProgress();
    p.locale = "pt-BR";
    p.finished = 3;
    p.best["03-speed-bump"] = good as never;
    p.daily["2026-11-20"] = good as never;
    saveProgress(p, s);
    expect(loadProgress(s)).toEqual(p);
  });

  it("survives corrupt, hostile or missing storage", () => {
    expect(parseProgress("{not json")).toEqual(emptyProgress());
    expect(parseProgress("[]")).toEqual(emptyProgress());
    expect(parseProgress("null")).toEqual(emptyProgress());
    const hostile = parseProgress(
      JSON.stringify({
        locale: "xx",
        finished: 9999,
        cart: "<img>",
        best: {
          "../x": good,
          ok: { ...good, damage: -5 },
          "05-the-slope": { ...good, cart: "tank" },
        },
        daily: { yesterday: good, "2026-11-19": good },
        __proto__: { polluted: true },
      }),
    );
    expect(hostile.locale).toBeNull();
    expect(hostile.finished).toBe(0);
    expect(hostile.cart).toBe("standard");
    expect(hostile.best).toEqual({});
    expect(Object.keys(hostile.daily)).toEqual(["2026-11-19"]);
    expect(loadProgress(null)).toEqual(emptyProgress());
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    } as unknown as Storage;
    expect(loadProgress(throwing)).toEqual(emptyProgress());
    expect(() => saveProgress(emptyProgress(), throwing)).not.toThrow();
  });

  it("keeps only the last 60 daily results", () => {
    const s = memoryStorage();
    const p = emptyProgress();
    for (let d = 1; d <= 80; d++) p.daily[`2026-01-${String(d).padStart(2, "0")}`] = good as never;
    saveProgress(p, s);
    expect(Object.keys(loadProgress(s).daily).length).toBe(60);
  });
});

describe("unlocking carts", () => {
  const LEVELS = ["l1", "l2", "l3"];

  it("opens only the standard cart on a fresh save", () => {
    const p = emptyProgress();
    expect(CART_IDS.map((id) => cartUnlocked(p, id, LEVELS))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("opens the next cart only when every level is finished with the one before", () => {
    const p = emptyProgress();
    markDone(p, "standard", "l1");
    markDone(p, "standard", "l2");
    expect(doneWith(p, "standard", LEVELS)).toBe(2);
    expect(cartUnlocked(p, "rusty", LEVELS)).toBe(false);
    markDone(p, "standard", "l3");
    expect(cartUnlocked(p, "rusty", LEVELS)).toBe(true);
    // One link at a time: the standard cart's levels don't count for the rusty one.
    expect(cartUnlocked(p, "basket", LEVELS)).toBe(false);
    for (const l of LEVELS) markDone(p, "rusty", l);
    expect(cartUnlocked(p, "basket", LEVELS)).toBe(true);
    expect(cartUnlocked(p, "kiddie", LEVELS)).toBe(false);
  });

  it("counts a level once, and ignores levels that aren't in the game", () => {
    const p = emptyProgress();
    markDone(p, "standard", "l1");
    markDone(p, "standard", "l1");
    markDone(p, "standard", "daily-2026-11-22");
    expect(p.done.standard).toEqual(["l1", "daily-2026-11-22"]);
    expect(doneWith(p, "standard", LEVELS)).toBe(1);
  });

  it("survives a round trip through storage", () => {
    const p = emptyProgress();
    for (const l of LEVELS) markDone(p, "standard", l);
    markDone(p, "rusty", "l2");
    const back = parseProgress(JSON.stringify(p));
    expect(back.done).toEqual({ standard: LEVELS, rusty: ["l2"] });
    expect(cartUnlocked(back, "rusty", LEVELS)).toBe(true);
  });

  it("works out who finished what from an older save", () => {
    const result = (level: string, cart: string, parked = true) => ({
      level,
      cart,
      parked,
      damage: 0,
      ticks: 100,
      lines: 0,
    });
    const old = JSON.stringify({
      finished: 3,
      best: {
        l1: result("l1", "standard"),
        l2: result("l2", "rusty"),
        l3: result("l3", "standard", false),
      },
    });
    const p = parseProgress(old);
    expect(p.done).toEqual({ standard: ["l1"], rusty: ["l2"] });
  });

  it("throws away a tampered tally", () => {
    const p = parseProgress(
      JSON.stringify({
        done: { standard: ["l1", "l1", 7, "<script>", null], tank: ["l1"], rusty: "all" },
      }),
    );
    expect(p.done).toEqual({ standard: ["l1"] });
    expect(parseProgress(JSON.stringify({ done: [1, 2] })).done).toEqual({});
  });
});
