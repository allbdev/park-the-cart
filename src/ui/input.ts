import type { Input } from "../core/cart";

/**
 * Turns keys and touches into the simulation's Input. Keyboard gives 0 or 1; the touch stick is
 * analogue. The simulation quantises whatever comes out of here, so replays store exactly what
 * it saw.
 */

export type Action = "restart" | "pause";

const PUSH_KEYS = new Set(["KeyW", "ArrowUp"]);
const BACK_KEYS = new Set(["KeyS", "ArrowDown"]);
const LEFT_KEYS = new Set(["KeyA", "ArrowLeft"]);
const RIGHT_KEYS = new Set(["KeyD", "ArrowRight"]);
const HOLD_KEYS = new Set(["Space"]);
const GAME_KEYS = new Set([...PUSH_KEYS, ...BACK_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS, ...HOLD_KEYS]);

/**
 * Left means "go left", whichever way the cart is travelling. The simulation's `turn` swings the
 * cart's nose, and when you pull the cart backwards a nose swung left sends the cart back and to
 * the right, like reversing a car. So while pulling back, the steering is mirrored here.
 */
export function steerFor(push: number, turn: number): number {
  return push < 0 && turn !== 0 ? -turn : turn;
}

const HOLD_KEYS_HELD = (held: ReadonlySet<string>): boolean => {
  for (const k of held) if (HOLD_KEYS.has(k)) return true;
  return false;
};

/** Pure: the input from a set of held keys, in "cart" mode. */
export function keysToInput(held: ReadonlySet<string>): Input {
  let push = 0;
  let turn = 0;
  for (const k of held) {
    if (PUSH_KEYS.has(k)) push = 1;
  }
  for (const k of held) {
    if (BACK_KEYS.has(k)) push = push === 1 ? 0 : -1;
  }
  let left = false;
  let right = false;
  for (const k of held) {
    if (LEFT_KEYS.has(k)) left = true;
    if (RIGHT_KEYS.has(k)) right = true;
  }
  if (left !== right) turn = left ? -1 : 1;
  turn = steerFor(push, turn);
  let hold = false;
  for (const k of held) if (HOLD_KEYS.has(k)) hold = true;
  return { push, turn, hold };
}

/**
 * How the player steers. "point": press or push the way you want the cart to go on screen, and
 * the cart turns itself that way. "cart": up pushes, left and right twist the cart (the classic
 * top-down driving scheme, where left and right swap when the cart faces down the screen).
 */
export type SteerMode = "point" | "cart";
export const STEER_MODES: readonly SteerMode[] = ["point", "cart"];

/** The direction the held keys point at, on screen (x right, y down), unit length or zero. */
export function keysToDirection(held: ReadonlySet<string>): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (const k of held) {
    if (PUSH_KEYS.has(k)) dy -= 1;
    if (BACK_KEYS.has(k)) dy += 1;
    if (LEFT_KEYS.has(k)) dx -= 1;
    if (RIGHT_KEYS.has(k)) dx += 1;
  }
  dx = Math.sign(dx);
  dy = Math.sign(dy);
  const m = Math.hypot(dx, dy);
  return m > 0 ? { dx: dx / m, dy: dy / m } : { dx: 0, dy: 0 };
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * How firmly the cart is turned towards where the player points, and how much its own spin is
 * damped. Loose on purpose: a tight controller would cancel the bad wheel by itself, and
 * compensating for that wheel is the game. With these, the cart settles a few degrees off where
 * you point, on the side its wheel drags to, and you aim a little the other way.
 */
const POINT_GAIN = 1.5;
const POINT_DAMPING = 0.25;
/** Pointing further than this behind the cart pulls it backwards instead of turning it round. */
const REVERSE_BEYOND = 2.2;
const FORWARD_WITHIN = 1.0;

/**
 * Pure: "go that way" turned into push and turn. (dx, dy) is the wanted direction on screen,
 * length 0..1; `heading` and `spin` are the cart's; `reversing` is what this returned last time
 * (it keeps the cart from flipping between forwards and backwards at the boundary).
 */
export function pointToInput(
  dx: number,
  dy: number,
  heading: number,
  spin: number,
  reversing: boolean,
): { push: number; turn: number; reversing: boolean } {
  const mag = Math.min(1, Math.hypot(dx, dy));
  if (mag < 0.12) return { push: 0, turn: 0, reversing: false };
  const target = Math.atan2(dy, dx);
  const ahead = wrap(target - heading);
  const back = reversing ? Math.abs(ahead) > FORWARD_WITHIN : Math.abs(ahead) > REVERSE_BEYOND;
  // Backwards, it's the cart's tail that has to point at the target.
  const err = back ? wrap(target - heading - Math.PI) : ahead;
  const turn = Math.max(-1, Math.min(1, POINT_GAIN * err - POINT_DAMPING * spin));
  // Push only once it's roughly lined up; until then it turns on the spot.
  const lined = Math.cos(err);
  const push = lined > 0.35 ? mag * lined : 0;
  return { push: back ? -push : push, turn, reversing: back };
}

/** Pure: the input from the stick's offset (-1..1 each, y down) and the hold button. */
export function stickToInput(dx: number, dy: number, hold: boolean): Input {
  const dead = 0.12;
  const shape = (v: number) => {
    const a = Math.abs(v);
    if (a < dead) return 0;
    return Math.sign(v) * Math.min(1, (a - dead) / (1 - dead));
  };
  const push = shape(-dy);
  return { push, turn: steerFor(push, shape(dx)), hold };
}

export class Controls {
  private held = new Set<string>();
  private stick: { dx: number; dy: number } | null = null;
  private holdTouch = false;
  /** Set when anything has been pressed since the last reset (starts the clock). */
  touched = false;
  onAction: (a: Action) => void = () => {};
  private enabled = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (
      e.target instanceof HTMLElement &&
      e.target.closest("button, a, input") &&
      e.code === "Space"
    )
      return; // let Space press a focused button
    if (GAME_KEYS.has(e.code)) {
      this.held.add(e.code);
      this.touched = true;
      e.preventDefault();
    } else if (e.code === "KeyR" && !e.repeat) {
      this.onAction("restart");
    } else if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) {
      this.onAction("pause");
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
    this.stick = null;
    this.holdTouch = false;
  };

  attach(): void {
    this.enabled = true;
    addEventListener("keydown", this.onKeyDown);
    addEventListener("keyup", this.onKeyUp);
    addEventListener("blur", this.onBlur);
  }

  detach(): void {
    this.enabled = false;
    this.onBlur();
    removeEventListener("keydown", this.onKeyDown);
    removeEventListener("keyup", this.onKeyUp);
    removeEventListener("blur", this.onBlur);
  }

  reset(): void {
    this.held.clear();
    this.touched = false;
    this.reversing = false;
  }

  setStick(dx: number, dy: number): void {
    this.stick = { dx, dy };
    if (Math.abs(dx) > 0.12 || Math.abs(dy) > 0.12) this.touched = true;
  }

  releaseStick(): void {
    this.stick = null;
  }

  setHold(on: boolean): void {
    this.holdTouch = on;
    if (on) this.touched = true;
  }

  /** Whether the cart is being pulled backwards in "point" mode (see `pointToInput`). */
  private reversing = false;

  /**
   * The input for this tick. In "point" mode it needs the cart's heading and spin, since the
   * same key means a different push and turn depending on which way the cart faces.
   */
  read(mode: SteerMode = "cart", heading = 0, spin = 0): Input {
    if (mode === "point") {
      const hold = this.holdTouch || HOLD_KEYS_HELD(this.held);
      const d = this.stick ?? keysToDirection(this.held);
      const p = pointToInput(d.dx, d.dy, heading, spin, this.reversing);
      this.reversing = p.reversing;
      return { push: p.push, turn: p.turn, hold };
    }
    const k = keysToInput(this.held);
    if (this.stick) {
      const s = stickToInput(this.stick.dx, this.stick.dy, this.holdTouch || k.hold);
      return {
        push: Math.abs(s.push) > Math.abs(k.push) ? s.push : k.push,
        turn: Math.abs(s.turn) > Math.abs(k.turn) ? s.turn : k.turn,
        hold: s.hold,
      };
    }
    return { ...k, hold: k.hold || this.holdTouch };
  }
}

/**
 * A floating virtual stick: the thumb can land anywhere in `zone` and the stick jumps to it, so
 * it never has to sit on top of the cart. `stick` is the ring, `knob` the dot inside it. Between
 * touches the ring rests, faint, where the stylesheet puts it.
 */
export function bindStick(
  zone: HTMLElement,
  stick: HTMLElement,
  knob: HTMLElement,
  controls: Controls,
): () => void {
  let id: number | null = null;
  let ox = 0;
  let oy = 0;
  const radius = () => Math.max(40, stick.clientWidth * 0.32);
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const r = radius();
    let dx = (e.clientX - ox) / r;
    let dy = (e.clientY - oy) / r;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    knob.style.transform = `translate(${dx * r}px, ${dy * r}px)`;
    controls.setStick(dx, dy);
    e.preventDefault();
  };
  const down = (e: PointerEvent) => {
    if (id !== null) return;
    id = e.pointerId;
    ox = e.clientX;
    oy = e.clientY;
    // Centre the ring under the thumb.
    const rect = zone.getBoundingClientRect();
    stick.style.left = `${ox - rect.left - stick.clientWidth / 2}px`;
    stick.style.top = `${oy - rect.top - stick.clientHeight / 2}px`;
    stick.style.bottom = "auto";
    stick.classList.add("live");
    zone.setPointerCapture(e.pointerId);
    move(e);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    knob.style.transform = "";
    stick.style.left = "";
    stick.style.top = "";
    stick.style.bottom = "";
    stick.classList.remove("live");
    controls.releaseStick();
  };
  zone.addEventListener("pointerdown", down);
  zone.addEventListener("pointermove", move);
  zone.addEventListener("pointerup", up);
  zone.addEventListener("pointercancel", up);
  return () => {
    zone.removeEventListener("pointerdown", down);
    zone.removeEventListener("pointermove", move);
    zone.removeEventListener("pointerup", up);
    zone.removeEventListener("pointercancel", up);
  };
}

export function bindHold(btn: HTMLElement, controls: Controls): void {
  const on = (e: PointerEvent) => {
    btn.setPointerCapture(e.pointerId);
    controls.setHold(true);
    btn.classList.add("down");
    e.preventDefault();
  };
  const off = () => {
    controls.setHold(false);
    btn.classList.remove("down");
  };
  btn.addEventListener("pointerdown", on);
  btn.addEventListener("pointerup", off);
  btn.addEventListener("pointercancel", off);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}
