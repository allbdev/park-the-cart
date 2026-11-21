import type { CarColour, CarModel } from "../content/cars";
import { formatMoney, formatTime, t, type Locale } from "../content/i18n";
import type { ReceiptItem, Result } from "../core/result";
import { seconds } from "../core/result";

/** Player-facing words for things the core describes with keys and numbers. */

export function carName(locale: Locale, model: CarModel, colour: CarColour): string {
  if (model === "manager") return t(locale, "cars.manager");
  return t(locale, "cars.named", {
    model: t(locale, `cars.${model}`),
    colour: t(locale, `cars.colour.${colour}`),
  });
}

/** The two printed lines of a receipt item: what, and on which car (or how many). */
export function itemText(locale: Locale, item: ReceiptItem): { title: string; sub: string } {
  switch (item.kind) {
    case "car":
      return {
        title: t(locale, `zones.${item.zone}`),
        sub: carName(locale, item.model, item.colour),
      };
    case "door":
      return {
        title: t(locale, "zones.doorOpening"),
        sub: carName(locale, item.model, item.colour),
      };
    case "reversing":
      return { title: t(locale, "zones.reversing"), sub: carName(locale, item.model, item.colour) };
    case "cone":
      return {
        title: t(locale, "zones.cone"),
        sub: t(locale, "receipt.unit", {
          n: item.count,
          price: formatMoney(locale, item.unit).replace("R$ ", ""),
        }),
      };
  }
}

/** The money printed on a receipt line, without "R$". */
export function receiptAmount(locale: Locale, centavos: number): string {
  return formatMoney(locale, centavos).replace("R$ ", "");
}

export interface ShareContext {
  levelNumber: number | null;
  date: string | null;
  url: string;
}

/** The pasteable result. Same numbers in both languages; only the words change. */
export function shareText(locale: Locale, r: Result, ctx: ShareContext): string {
  const line1 = ctx.date
    ? t(locale, "result.shareLine1Daily", { date: ctx.date })
    : t(locale, "result.shareLine1", { n: ctx.levelNumber ?? 0 });
  const secs = seconds(r.ticks);
  const line2 =
    r.damage === 0
      ? t(locale, "result.shareLine2Clean", { seconds: secs })
      : t(locale, "result.shareLine2", {
          price: formatMoney(locale, r.damage, false),
          seconds: secs,
        });
  return `${line1}\n${line2}\n${ctx.url}`;
}

export function bestText(locale: Locale, r: Result): string {
  return `${formatMoney(locale, r.damage, false)} · ${formatTime(seconds(r.ticks))}`;
}
