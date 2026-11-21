// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { receiptEl } from "../../src/ui/receipt";
import type { ReceiptLine } from "../../src/core/world";

const lines: ReceiptLine[] = [
  { kind: "car", zone: "door", car: 0, model: "sedan", colour: "silver", price: 184000, tick: 10 },
  { kind: "car", zone: "mirror", car: 1, model: "suv", colour: "black", price: 62000, tick: 20 },
  { kind: "cone", price: 3400, tick: 30 },
  { kind: "cone", price: 3400, tick: 31 },
];

describe("receipt", () => {
  it("lists numbered lines, groups cones and totals", () => {
    const el = receiptEl("pt-BR", lines, {
      open: false,
      total: 252800,
      time: 41,
      levelLabel: "3 · Lombada",
    });
    const items = [...el.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toEqual([
      "001Risco na porta1.840,00sedã prata",
      "002Retrovisor620,00SUV preto",
      "003Cone atropelado68,002 UN x 34,00",
    ]);
    expect(el.textContent).toContain("R$ 2.528,00");
    expect(el.textContent).toContain("00:41");
    expect(el.textContent).toContain("Não volte sempre");
    expect(el.getAttribute("aria-label")).toBe("Supermercado Três Rodas");
  });

  it("says when there was no damage, and that an open receipt is still open", () => {
    const el = receiptEl("en", [], { open: true, total: 0 });
    expect(el.textContent).toContain("No damage. Suspicious.");
    expect(el.textContent).toContain("The receipt closes when the cart is parked");
  });

  it("never turns text into markup", () => {
    const el = receiptEl("en", lines, {
      open: false,
      total: 1,
      levelLabel: "<img src=x onerror=alert(1)>",
    });
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
