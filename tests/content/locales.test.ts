import { describe, expect, it } from "vitest";
import en from "../../src/content/locales/en";
import ptBR from "../../src/content/locales/pt-BR";
import { formatMoney, formatTime, moneyParts, t } from "../../src/content/i18n";

type Flat = Map<string, string | string[]>;

function flatten(node: unknown, prefix = "", out: Flat = new Map()): Flat {
  if (typeof node === "string") out.set(prefix, node);
  else if (Array.isArray(node)) out.set(prefix, node as string[]);
  else
    for (const [k, v] of Object.entries(node as object))
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("locales", () => {
  const a = flatten(en);
  const b = flatten(ptBR);

  it("have exactly the same keys", () => {
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
  });

  it("use the same slots and list lengths", () => {
    for (const [key, value] of a) {
      const other = b.get(key)!;
      if (Array.isArray(value)) {
        expect(Array.isArray(other), key).toBe(true);
        expect((other as string[]).length, key).toBe(value.length);
        value.forEach((v, i) => expect(slots((other as string[])[i]!), key).toEqual(slots(v)));
      } else {
        expect(slots(other as string), key).toEqual(slots(value));
      }
    }
  });

  it("have no empty strings", () => {
    for (const [key, value] of [...a, ...b]) {
      for (const s of Array.isArray(value) ? value : [value])
        expect(s.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("show a missing key as the key", () => {
    expect(t("en", "no.such.key")).toBe("no.such.key");
  });
});

describe("money and time", () => {
  it("formats reais per locale from integer centavos", () => {
    expect(formatMoney("pt-BR", 348000)).toBe("R$ 3.480,00");
    expect(formatMoney("en", 348000)).toBe("R$ 3,480.00");
    expect(formatMoney("pt-BR", 3400)).toBe("R$ 34,00");
    expect(formatMoney("en", 0)).toBe("R$ 0.00");
    expect(formatMoney("pt-BR", 123456789, false)).toBe("R$ 1.234.567");
    expect(moneyParts("pt-BR", 184050)).toEqual(["1.840", "50"]);
  });

  it("formats time as mm:ss", () => {
    expect(formatTime(41.9)).toBe("00:41");
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(-3)).toBe("00:00");
    expect(formatTime(754)).toBe("12:34");
  });
});
