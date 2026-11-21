import { describe, expect, it } from "vitest";
import { emptyProgress, loadProgress, parseProgress, saveProgress } from "../../src/ui/store";

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
