import { CART_IDS, cartBefore, type CartId } from "../content/carts";
import { LOCALES, type Locale } from "../content/i18n";
import type { Result } from "../core/result";
import { STEER_MODES, type SteerMode } from "./input";

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
  /** The level ids each cart has finished (parked, under the limit). Carts unlock on this. */
  done: Partial<Record<CartId, string[]>>;
  cart: CartId;
  reducedMotion: boolean;
  /** How the player steers (see SteerMode). */
  steer: SteerMode;
  /** Daily results by date key: the first try only. */
  daily: Record<string, Result>;
}

const KEY = "park-the-cart.v1";
const LEVEL_ID = /^[a-z0-9-]{1,40}$/;

export function emptyProgress(): Progress {
  return {
    locale: null,
    best: {},
    finished: 0,
    done: {},
    cart: "standard",
    reducedMotion: false,
    steer: "point",
    daily: {},
  };
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
  p.best = cleanResults(v.best, LEVEL_ID);
  if (isInt(v.finished, 10)) p.finished = v.finished;
  if (isObj(v.done)) {
    for (const id of CART_IDS) {
      const list = v.done[id];
      if (!Array.isArray(list)) continue;
      const ids = list.filter((x): x is string => typeof x === "string" && LEVEL_ID.test(x));
      p.done[id] = [...new Set(ids)].slice(0, 100);
    }
  } else {
    // Saved before carts kept their own tally: a level's best run says which cart parked it.
    for (const r of Object.values(p.best)) {
      if (r.parked) (p.done[r.cart] ??= []).push(r.level);
    }
  }
  if ((CART_IDS as readonly unknown[]).includes(v.cart)) p.cart = v.cart as CartId;
  if (typeof v.reducedMotion === "boolean") p.reducedMotion = v.reducedMotion;
  if ((STEER_MODES as readonly unknown[]).includes(v.steer)) p.steer = v.steer as SteerMode;
  p.daily = cleanResults(v.daily, /^\d{4}-\d{2}-\d{2}$/);
  return p;
}

/** Records that `cart` parked `level`. */
export function markDone(p: Progress, cart: CartId, level: string): void {
  const list = (p.done[cart] ??= []);
  if (!list.includes(level)) list.push(level);
}

/** How many of `levels` this cart has finished. */
export function doneWith(p: Progress, cart: CartId, levels: readonly string[]): number {
  const list = p.done[cart] ?? [];
  return levels.filter((id) => list.includes(id)).length;
}

/** A cart is open once the cart before it has finished every level. The first is always open. */
export function cartUnlocked(p: Progress, cart: CartId, levels: readonly string[]): boolean {
  const before = cartBefore(cart);
  return before === null || doneWith(p, before, levels) === levels.length;
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
