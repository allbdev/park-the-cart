import { describe, expect, it } from "vitest";
import { bestText, carName, itemText, shareText } from "../../src/ui/format";
import type { Result } from "../../src/core/result";

const r = (damage: number, ticks: number): Result => ({
  level: "03-speed-bump",
  cart: "standard",
  parked: true,
  damage,
  ticks,
  lines: 4,
});

describe("formatting", () => {
  it("names cars per locale", () => {
    expect(carName("pt-BR", "sedan", "silver")).toBe("sedã prata");
    expect(carName("en", "suv", "black")).toBe("black SUV");
    expect(carName("en", "manager", "black")).toBe("manager's car");
  });

  it("prints receipt items like the mockup", () => {
    expect(
      itemText("pt-BR", {
        kind: "car",
        zone: "door",
        model: "sedan",
        colour: "silver",
        price: 184000,
      }),
    ).toEqual({
      title: "Risco na porta",
      sub: "sedã prata",
    });
    expect(itemText("pt-BR", { kind: "cone", count: 3, unit: 3400, price: 10200 })).toEqual({
      title: "Cone atropelado",
      sub: "3 UN x 34,00",
    });
    expect(
      itemText("en", { kind: "reversing", model: "pickup", colour: "red", price: 260000 }).title,
    ).toBe("Backed into");
  });

  it("builds the share string with the same numbers in both languages", () => {
    const ctx = { levelNumber: 3, date: null, url: "https://example.test/" };
    expect(shareText("pt-BR", r(348000, 41 * 120 + 30), ctx)).toBe(
      "Estacione o Carrinho · fase 3\nR$ 3.480 de prejuízo em 41 segundos\nhttps://example.test/",
    );
    expect(shareText("en", r(348000, 41 * 120 + 30), ctx)).toBe(
      "Park the Cart · level 3\nR$ 3,480 of damage in 41 seconds\nhttps://example.test/",
    );
    expect(shareText("en", r(0, 19 * 120), ctx)).toContain("without a scratch in 19 seconds");
    expect(shareText("pt-BR", r(0, 19 * 120), { ...ctx, date: "20/11/2026" })).toContain(
      "fase do dia 20/11/2026",
    );
  });

  it("shows bests as money and time", () => {
    expect(bestText("pt-BR", r(62000, 38 * 120))).toBe("R$ 620 · 00:38");
  });
});
