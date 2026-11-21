import type { CartId } from "../content/carts";
import type { CarColour, CarModel, Zone } from "../content/cars";
import { TICK_RATE } from "./cart";
import type { ReceiptLine, World } from "./world";

/** What's kept from a finished run. Damage in centavos, time in ticks. */
export interface Result {
  level: string;
  cart: CartId;
  parked: boolean;
  damage: number;
  ticks: number;
  lines: number;
}

export function resultOf(world: World): Result {
  return {
    level: world.level.id,
    cart: world.cartId,
    parked: world.status === "parked",
    damage: world.damage,
    ticks: world.status === "playing" ? world.tick : world.endTick,
    lines: world.receipt.length,
  };
}

/** Less damage wins; time breaks ties. Negative when `a` is better. */
export function compareResults(a: Result, b: Result): number {
  if (a.damage !== b.damage) return a.damage - b.damage;
  return a.ticks - b.ticks;
}

/** Only parked runs count. */
export function isBetter(candidate: Result, best: Result | null): boolean {
  if (!candidate.parked) return false;
  if (!best || !best.parked) return true;
  return compareResults(candidate, best) < 0;
}

export function seconds(ticks: number): number {
  return Math.floor(ticks / TICK_RATE);
}

/** One printed line on the receipt. Cones are grouped ("3 UN x 34,00"). */
export type ReceiptItem =
  | { kind: "car"; zone: Zone; model: CarModel; colour: CarColour; price: number }
  | { kind: "door"; model: CarModel; colour: CarColour; price: number }
  | { kind: "reversing"; model: CarModel; colour: CarColour; price: number }
  | { kind: "cone"; count: number; unit: number; price: number };

export function receiptItems(lines: readonly ReceiptLine[]): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  let cones: Extract<ReceiptItem, { kind: "cone" }> | null = null;
  for (const l of lines) {
    if (l.kind === "cone") {
      if (!cones) {
        cones = { kind: "cone", count: 0, unit: l.price, price: 0 };
        items.push(cones);
      }
      cones.count++;
      cones.price += l.price;
    } else if (l.kind === "car") {
      items.push({ kind: "car", zone: l.zone, model: l.model, colour: l.colour, price: l.price });
    } else {
      items.push({ kind: l.kind, model: l.model, colour: l.colour, price: l.price });
    }
  }
  return items;
}
