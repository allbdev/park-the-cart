import { CART_IDS, type CartId } from "../content/carts";
import type { Input } from "./cart";

/**
 * A replay is the list of inputs, one per tick, quantised to 1/16 and run-length encoded.
 * `v1.<level>.<cart>.<data>`, where data is base64url of varint pairs (value, run length).
 * Replay links are untrusted: everything here is length-capped and strictly parsed.
 */
export const REPLAY_VERSION = "v1";
export const MAX_REPLAY_LENGTH = 24_000;
export const MAX_REPLAY_TICKS = 120 * 60 * 10;
const LEVEL_ID = /^[a-z0-9-]{1,40}$/;
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export interface Replay {
  level: string;
  cart: CartId;
  inputs: Input[];
}

function q(v: number): number {
  return Math.round(Math.max(-1, Math.min(1, v)) * 16) + 16;
}

/** One input as an integer in [0, 33 * 33 * 2). */
export function packInput(i: Input): number {
  return (q(i.push) * 33 + q(i.turn)) * 2 + (i.hold ? 1 : 0);
}

export function unpackInput(n: number): Input {
  const hold = (n & 1) === 1;
  const rest = n >> 1;
  return { push: (Math.floor(rest / 33) - 16) / 16, turn: ((rest % 33) - 16) / 16, hold };
}

const MAX_PACKED = 33 * 33 * 2;

function pushVarint(out: number[], n: number): void {
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

function toBase64Url(bytes: number[]): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    s += B64[a >> 2]!;
    s += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) s += B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) s += B64[c & 63]!;
  }
  return s;
}

function fromBase64Url(s: string): number[] | null {
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  return bytes;
}

/** Just the inputs, as stored in a level's par run. */
export function encodeInputs(inputs: readonly Input[]): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < inputs.length) {
    const v = packInput(inputs[i]!);
    let run = 1;
    while (i + run < inputs.length && packInput(inputs[i + run]!) === v) run++;
    pushVarint(bytes, v);
    pushVarint(bytes, run);
    i += run;
  }
  return toBase64Url(bytes);
}

export function decodeInputs(data: string): Input[] | null {
  if (data.length > MAX_REPLAY_LENGTH) return null;
  const bytes = fromBase64Url(data);
  if (!bytes) return null;
  const out: Input[] = [];
  let p = 0;
  const readVarint = (): number | null => {
    let n = 0;
    let shift = 0;
    for (let k = 0; k < 4; k++) {
      if (p >= bytes.length) return null;
      const b = bytes[p++]!;
      n |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return n;
      shift += 7;
    }
    return null;
  };
  while (p < bytes.length) {
    const v = readVarint();
    const run = readVarint();
    if (v === null || run === null || v >= MAX_PACKED || run < 1) return null;
    if (out.length + run > MAX_REPLAY_TICKS) return null;
    const input = unpackInput(v);
    for (let k = 0; k < run; k++) out.push(input);
  }
  return out;
}

export function encodeReplay(r: Replay): string {
  return `${REPLAY_VERSION}.${r.level}.${r.cart}.${encodeInputs(r.inputs)}`;
}

/** Parses an untrusted replay string. Returns null for anything malformed. */
export function decodeReplay(s: string): Replay | null {
  if (typeof s !== "string" || s.length > MAX_REPLAY_LENGTH + 80) return null;
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const [version, level, cart, data] = parts as [string, string, string, string];
  if (version !== REPLAY_VERSION) return null;
  if (!LEVEL_ID.test(level)) return null;
  if (!(CART_IDS as readonly string[]).includes(cart)) return null;
  const inputs = decodeInputs(data);
  if (!inputs || inputs.length === 0) return null;
  return { level, cart: cart as CartId, inputs };
}
