import en, { type LocaleDict } from "./locales/en";
import ptBR from "./locales/pt-BR";

/** Two locales, English first. The locale changes words and number formats only, never the game. */
export type Locale = "en" | "pt-BR";
export const LOCALES: readonly Locale[] = ["en", "pt-BR"];
export const DEFAULT_LOCALE: Locale = "en";

export const DICTS: Record<Locale, LocaleDict> = { en, "pt-BR": ptBR };

export type Slots = Record<string, string | number>;

type Node = string | readonly string[] | { readonly [k: string]: Node };

function lookup(locale: Locale, key: string): Node | undefined {
  let node: Node | undefined = DICTS[locale] as unknown as Node;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string" || Array.isArray(node)) return undefined;
    node = (node as { readonly [k: string]: Node })[part];
  }
  return node;
}

export function fill(template: string, slots: Slots = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in slots ? String(slots[name]) : m,
  );
}

/** A string by dotted key. Missing keys show the key itself, so they're easy to spot. */
export function t(locale: Locale, key: string, slots: Slots = {}): string {
  const node = lookup(locale, key);
  if (typeof node === "string") return fill(node, slots);
  return key;
}

export function list(locale: Locale, key: string): readonly string[] {
  const node = lookup(locale, key);
  return Array.isArray(node) ? (node as readonly string[]) : [];
}

export function has(locale: Locale, key: string): boolean {
  return lookup(locale, key) !== undefined;
}

function groupThousands(n: number, sep: string): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * Money is always reais; only the separators change. `centavos` is an integer.
 * pt-BR: "R$ 3.480,00", en: "R$ 3,480.00". `cents: false` drops the decimals.
 */
export function formatMoney(locale: Locale, centavos: number, cents = true): string {
  const negative = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const reais = Math.floor(abs / 100);
  const rest = abs % 100;
  const [thousands, decimal] = locale === "pt-BR" ? [".", ","] : [",", "."];
  let s = groupThousands(reais, thousands);
  if (cents) s += decimal + String(rest).padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${s}`;
}

/** The number part only, split for the big price tags: ["3.480", "00"]. */
export function moneyParts(locale: Locale, centavos: number): [string, string] {
  const abs = Math.abs(Math.round(centavos));
  const sep = locale === "pt-BR" ? "." : ",";
  return [groupThousands(Math.floor(abs / 100), sep), String(abs % 100).padStart(2, "0")];
}

/** "00:41" from seconds (floored). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
