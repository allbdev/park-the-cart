import { CART_IDS, type CartId } from "../content/carts";
import { LOCALES, type Locale } from "../content/i18n";
import type { Result } from "../core/result";

/**
 * Per-player conveniences in localStorage: bests, unlocked levels, chosen cart, language,
 * today's daily result. Always in try/catch, always validated on the way in: storage can be
 * full, disabled, or edited by hand.
 */
export interface Progress {
  locale: Locale | null;
  /** Best parked result per level id. */
  best: Record<string, Result>;
  /** Highest level number finished. */
  finished: number;
  cart: CartId;
  reducedMotion: boolean;
  /** Daily results by date key: the first try only. */
  daily: Record<string, Result>;
}

const KEY = "park-the-cart.v1";

export function emptyProgress(): Progress {
  return { locale: null, best: {}, finished: 0, cart: "standard", reducedMotion: false, daily: {} };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, max = 1e9): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;

function cleanResult(v: unknown): Result | null {
  if (!isObj(v)) return null;
  if (typeof v.level !== "string" || v.level.length > 60) return null;
  if (!(CART_IDS as readonly string[]).includes(v.cart as string)) return null;
  if (typeof v.parked !== "boolean" || !isInt(v.damage) || !isInt(v.ticks) || !isInt(v.lines, 1e5))
    return null;
  return {
    level: v.level,
    cart: v.cart as CartId,
    parked: v.parked,
    damage: v.damage,
    ticks: v.ticks,
    lines: v.lines,
  };
}

function cleanResults(v: unknown, keyPattern: RegExp): Record<string, Result> {
  const out: Record<string, Result> = {};
  if (!isObj(v)) return out;
  for (const [k, r] of Object.entries(v)) {
    if (!keyPattern.test(k)) continue;
    const c = cleanResult(r);
    if (c) out[k] = c;
  }
  return out;
}

/** Parses whatever was stored; anything unexpected falls back to defaults. */
export function parseProgress(raw: string | null): Progress {
  const p = emptyProgress();
  if (!raw) return p;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return p;
  }
  if (!isObj(v)) return p;
  if ((LOCALES as readonly unknown[]).includes(v.locale)) p.locale = v.locale as Locale;
  p.best = cleanResults(v.best, /^[a-z0-9-]{1,40}$/);
  if (isInt(v.finished, 10)) p.finished = v.finished;
  if ((CART_IDS as readonly unknown[]).includes(v.cart)) p.cart = v.cart as CartId;
  if (typeof v.reducedMotion === "boolean") p.reducedMotion = v.reducedMotion;
  p.daily = cleanResults(v.daily, /^\d{4}-\d{2}-\d{2}$/);
  return p;
}

export function loadProgress(storage: Storage | null = safeStorage()): Progress {
  try {
    return parseProgress(storage?.getItem(KEY) ?? null);
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress, storage: Storage | null = safeStorage()): void {
  try {
    // Keep only the last 60 days of daily results.
    const days = Object.keys(p.daily).sort().slice(-60);
    const daily: Record<string, Result> = {};
    for (const d of days) daily[d] = p.daily[d]!;
    storage?.setItem(KEY, JSON.stringify({ ...p, daily }));
  } catch {
    // Storage full or disabled: the game still works, it just forgets.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
