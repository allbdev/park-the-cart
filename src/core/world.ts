import { CARTS, type CartId, type CartSpec } from "../content/carts";
import {
  CAR_SPECS,
  HAZARD_PRICES,
  ZONE_PRICES,
  type CarColour,
  type CarModel,
  type Zone,
} from "../content/cars";
import {
  containsPoint,
  corners,
  makeBox,
  makeCircle,
  speed,
  syncAxes,
  toLocalX,
  toLocalY,
  type Body,
} from "./body";
import {
  createCart,
  DRY,
  integrate,
  stepCart,
  stepFaults,
  stepLooseCart,
  TICK_RATE,
  WET,
  type Cart,
  type Input,
  type Surface,
} from "./cart";
import { closingSpeed, collide, makeContact, resolve, type Material } from "./collide";
import { carPlacement, stallRect, type Level, type Rect } from "./level";
import { atan2, cos, sin } from "./math";
import { createRng, type Rng } from "./rng";

/** One line on the receipt. Prices in centavos; words come from the locale at the edge. */
export type ReceiptLine =
  | {
      kind: "car";
      zone: Zone;
      car: number;
      model: CarModel;
      colour: CarColour;
      price: number;
      tick: number;
    }
  | { kind: "door"; car: number; model: CarModel; colour: CarColour; price: number; tick: number }
  | {
      kind: "reversing";
      car: number;
      model: CarModel;
      colour: CarColour;
      price: number;
      tick: number;
    }
  | { kind: "cone"; price: number; tick: number };

export interface DoorState {
  side: 1 | -1;
  /** 0 closed .. 1 fully open. */
  open: number;
  opening: boolean;
  body: Body;
}

export interface ReverseState {
  at: number | null;
  near: number | null;
  distance: number;
  moved: number;
  moving: boolean;
  done: boolean;
  billed: boolean;
}

export interface CarEntity {
  index: number;
  model: CarModel;
  colour: CarColour;
  body: Body;
  manager: boolean;
  door: DoorState | null;
  reverse: ReverseState | null;
  /** Tick until which each zone can't bill again. */
  cooldown: Record<Zone | "door", number>;
}

export interface Cone {
  body: Body;
  down: boolean;
}

export interface Slope {
  rect: Rect;
  ax: number;
  ay: number;
}

export interface Wind {
  ax: number;
  ay: number;
  /** Current gust level 0..1 (base breeze included). */
  level: number;
  target: number;
  left: number;
}

export type Status = "playing" | "parked" | "failed";

export interface World {
  level: Level;
  cartId: CartId;
  tick: number;
  rng: Rng;
  surface: Surface;
  cart: Cart;
  cars: CarEntity[];
  statics: Body[];
  cones: Cone[];
  loose: Body | null;
  bumps: Rect[];
  slopes: Slope[];
  wind: Wind | null;
  corral: Rect;
  receipt: ReceiptLine[];
  damage: number;
  status: Status;
  /** Ticks the cart has been still inside the corral. */
  settle: number;
  /** Tick the run ended (parked or failed). */
  endTick: number;
  /** For bump entry detection. */
  onBump: boolean;
  /** The last tick something was hit, for the camera and the price tag. */
  lastHit: number;
  /** The car that ended the run, if any. */
  failedOn: number;
}

const WALL = 2;
const RAIL = 0.12;
const HIT_SPEED = 0.3;
const COOLDOWN_TICKS = TICK_RATE;
export const SETTLE_TICKS = TICK_RATE / 2;
const DOOR_LENGTH = 1.05;
const DOOR_OPEN_ANGLE = 1.05;
const DOOR_OPEN_TICKS = Math.round(0.35 * TICK_RATE);
const REVERSE_SPEED = 1.3;
const CART_MATERIAL: Material = { restitution: 0.25, friction: 0.3 };
const CONE_MASS = 1.5;
const CONE_RADIUS = 0.18;

function rectBody(r: Rect): Body {
  return makeBox(r.x + r.w / 2, r.y + r.h / 2, 0, r.w, r.h);
}

function setCooldown(): Record<Zone | "door", number> {
  return { door: 0, mirror: 0, frontBumper: 0, rearBumper: 0 };
}

/** Builds the runtime world from a level and a cart. Same inputs, same world. */
export function createWorld(level: Level, cartId: CartId): World {
  const rng = createRng(`${level.id}:${level.seed}`);
  const [W, H] = level.size;
  const statics: Body[] = [
    rectBody({ x: -WALL, y: -WALL, w: W + 2 * WALL, h: WALL }),
    rectBody({ x: -WALL, y: H, w: W + 2 * WALL, h: WALL }),
    rectBody({ x: -WALL, y: 0, w: WALL, h: H }),
    rectBody({ x: W, y: 0, w: WALL, h: H }),
  ];

  // The corral: rails on the three closed sides of its stall.
  const corralRow = level.rows[level.corral.row]!;
  const corral = stallRect(corralRow, level.corral.stall);
  const backY = corralRow.opens === "down" ? corral.y : corral.y + corral.h - RAIL;
  statics.push(rectBody({ x: corral.x, y: backY, w: corral.w, h: RAIL }));
  statics.push(rectBody({ x: corral.x, y: corral.y, w: RAIL, h: corral.h }));
  statics.push(rectBody({ x: corral.x + corral.w - RAIL, y: corral.y, w: RAIL, h: corral.h }));

  const cars: CarEntity[] = level.cars.map((c, index) => {
    const spec = CAR_SPECS[c.model];
    const row = level.rows[c.row]!;
    const p = carPlacement(row, c, spec.length);
    const body = makeBox(p.x, p.y, p.a, spec.length, spec.width);
    let door: DoorState | null = null;
    if (c.door) {
      door = {
        side: c.door === "right" ? 1 : -1,
        open: 0,
        opening: false,
        body: makeBox(0, 0, 0, DOOR_LENGTH, 0.1),
      };
    }
    const car: CarEntity = {
      index,
      model: c.model,
      colour: c.colour,
      body,
      manager: c.model === "manager",
      door,
      reverse: c.reverse
        ? {
            at: c.reverse.at ?? null,
            near: c.reverse.near ?? null,
            distance: c.reverse.distance,
            moved: 0,
            moving: false,
            done: false,
            billed: false,
          }
        : null,
      cooldown: setCooldown(),
    };
    if (door) placeDoor(car);
    return car;
  });

  const cones: Cone[] = [];
  let loose: Body | null = null;
  const bumps: Rect[] = [];
  const slopes: Slope[] = [];
  let wind: Wind | null = null;
  for (const h of level.hazards) {
    switch (h.type) {
      case "cone":
        cones.push({ body: makeCircle(h.x, h.y, CONE_RADIUS, CONE_MASS), down: false });
        break;
      case "cart": {
        const spec = CARTS.standard;
        loose = makeBox(h.x, h.y, h.heading, spec.length, spec.width, spec.mass);
        break;
      }
      case "island":
        statics.push(rectBody(h));
        break;
      case "speedBump":
        bumps.push({ x: h.x, y: h.y, w: h.w, h: h.h });
        break;
      case "slope":
        slopes.push({ rect: h, ax: cos(h.dir) * h.accel, ay: sin(h.dir) * h.accel });
        break;
      case "wind":
        wind = {
          ax: cos(h.dir) * h.accel,
          ay: sin(h.dir) * h.accel,
          level: 0.3,
          target: 0.3,
          left: TICK_RATE * 2,
        };
        break;
    }
  }

  const cart = createCart(CARTS[cartId], level.spawn.x, level.spawn.y, level.spawn.heading, rng);
  return {
    level,
    cartId,
    tick: 0,
    rng,
    surface: level.surface === "wet" ? WET : DRY,
    cart,
    cars,
    statics,
    cones,
    loose,
    bumps,
    slopes,
    wind,
    corral,
    receipt: [],
    damage: 0,
    status: "playing",
    settle: 0,
    endTick: 0,
    onBump: false,
    lastHit: -1000,
    failedOn: -1,
  };
}

/** Door hinge near the front of the front door; it swings its rear edge outwards. */
function placeDoor(car: CarEntity): void {
  const d = car.door!;
  const b = car.body;
  const hingeX = b.hx * 0.22;
  const hingeY = d.side * b.hy;
  const theta = d.open * DOOR_OPEN_ANGLE;
  // Local direction from the hinge along the door: towards the rear, rotated outwards.
  const dx = -cos(theta);
  const dy = d.side * sin(theta);
  const lx = hingeX + (dx * DOOR_LENGTH) / 2;
  const ly = hingeY + (dy * DOOR_LENGTH) / 2 + d.side * 0.05;
  const db = d.body;
  db.x = b.x + lx * b.c - ly * b.s;
  db.y = b.y + lx * b.s + ly * b.c;
  db.a = b.a + atan2(dy, dx);
  syncAxes(db);
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Quantises an input the way a replay stores it: 1/16 steps. */
export function quantise(input: Input): Input {
  const q = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 16) / 16;
  return { push: q(input.push), turn: q(input.turn), hold: input.hold };
}

function zoneOf(car: Body, px: number, py: number): Zone {
  const lx = toLocalX(car, px, py);
  const ly = toLocalY(car, px, py);
  if (lx > car.hx - 0.55) return "frontBumper";
  if (lx < -car.hx + 0.55) return "rearBumper";
  const mirrorX = car.hx * 0.3;
  if (Math.abs(ly) > car.hy - 0.35 && lx > mirrorX && lx < mirrorX + 0.5) return "mirror";
  return "door";
}

function bill(world: World, line: ReceiptLine): void {
  world.receipt.push(line);
  world.damage += line.price;
  world.lastHit = world.tick;
}

const contact = makeContact();

/** A moving body (the player's cart or the loose one) against everything solid. */
function collideBody(world: World, b: Body, isPlayer: boolean): void {
  for (const s of world.statics) {
    if (collide(b, s, contact)) resolve(b, s, contact, CART_MATERIAL);
  }
  for (const car of world.cars) {
    if (collide(b, car.body, contact)) {
      const v = closingSpeed(b, car.body, contact);
      if (car.manager) {
        if (world.status === "playing") {
          world.status = "failed";
          world.failedOn = car.index;
          world.endTick = world.tick;
          world.lastHit = world.tick;
        }
      } else if (car.reverse?.moving) {
        // Only the player pays for walking into a car that's backing out.
        if (isPlayer && !car.reverse.billed) {
          car.reverse.billed = true;
          bill(world, {
            kind: "reversing",
            car: car.index,
            model: car.model,
            colour: car.colour,
            price: HAZARD_PRICES.reversing,
            tick: world.tick,
          });
        }
      } else if (v > HIT_SPEED) {
        const zone = zoneOf(car.body, contact.px, contact.py);
        if (world.tick >= car.cooldown[zone]) {
          car.cooldown[zone] = world.tick + COOLDOWN_TICKS;
          bill(world, {
            kind: "car",
            zone,
            car: car.index,
            model: car.model,
            colour: car.colour,
            price: ZONE_PRICES[zone],
            tick: world.tick,
          });
        }
      }
      resolve(b, car.body, contact, CART_MATERIAL);
    }
    const door = car.door;
    if (door && door.open > 0.05 && collide(b, door.body, contact)) {
      if (world.tick >= car.cooldown.door) {
        car.cooldown.door = world.tick + COOLDOWN_TICKS * 3;
        bill(world, {
          kind: "door",
          car: car.index,
          model: car.model,
          colour: car.colour,
          price: HAZARD_PRICES.doorOpening,
          tick: world.tick,
        });
      }
      resolve(b, door.body, contact, CART_MATERIAL);
    }
  }
  for (const cone of world.cones) {
    if (cone.down) continue;
    if (collide(b, cone.body, contact)) {
      cone.down = true;
      cone.body.vx = b.vx * 1.3 + contact.nx * 0.6;
      cone.body.vy = b.vy * 1.3 + contact.ny * 0.6;
      cone.body.w = (world.rng.next() - 0.5) * 10;
      bill(world, { kind: "cone", price: HAZARD_PRICES.cone, tick: world.tick });
    }
  }
  if (isPlayer && world.loose && collide(b, world.loose, contact)) {
    resolve(b, world.loose, contact, CART_MATERIAL);
  }
}

function fieldAccel(world: World, b: Body, windFactor: number): [number, number] {
  let ax = 0;
  let ay = 0;
  for (const s of world.slopes) {
    if (inRect(s.rect, b.x, b.y)) {
      ax += s.ax;
      ay += s.ay;
    }
  }
  if (world.wind) {
    ax += world.wind.ax * world.wind.level * windFactor;
    ay += world.wind.ay * world.wind.level * windFactor;
  }
  return [ax, ay];
}

function stepWind(world: World): void {
  const w = world.wind;
  if (!w) return;
  if (--w.left <= 0) {
    // Alternate calm and gust phases from the seed.
    if (w.target > 0.5) {
      w.target = world.rng.range(0.15, 0.35);
      w.left = Math.round(world.rng.range(1.2, 3.5) * TICK_RATE);
    } else {
      w.target = world.rng.range(0.8, 1);
      w.left = Math.round(world.rng.range(0.8, 2) * TICK_RATE);
    }
  }
  w.level += (w.target - w.level) * 0.04;
}

function stepCars(world: World): void {
  const cb = world.cart.body;
  for (const car of world.cars) {
    const d = car.door;
    if (d) {
      if (!d.opening && world.status === "playing") {
        const lx = toLocalX(car.body, cb.x, cb.y);
        const ly = toLocalY(car.body, cb.x, cb.y) * d.side;
        if (Math.abs(lx) < car.body.hx + 1.2 && ly > car.body.hy && ly < car.body.hy + 1.7)
          d.opening = true;
      }
      if (d.opening && d.open < 1) {
        d.open = Math.min(1, d.open + 1 / DOOR_OPEN_TICKS);
        placeDoor(car);
      }
    }
    const r = car.reverse;
    if (r && !r.done) {
      if (!r.moving) {
        const tailX = car.body.x - car.body.c * car.body.hx;
        const tailY = car.body.y - car.body.s * car.body.hx;
        const dx = cb.x - tailX;
        const dy = cb.y - tailY;
        const near = r.near !== null && dx * dx + dy * dy < r.near * r.near;
        const timed = r.at !== null && world.tick >= Math.round(r.at * TICK_RATE);
        if ((near || timed) && world.status === "playing") r.moving = true;
      }
      if (r.moving) {
        const step = REVERSE_SPEED / TICK_RATE;
        car.body.vx = -car.body.c * REVERSE_SPEED;
        car.body.vy = -car.body.s * REVERSE_SPEED;
        car.body.x -= car.body.c * step;
        car.body.y -= car.body.s * step;
        r.moved += step;
        if (r.moved >= r.distance) {
          r.moving = false;
          r.done = true;
          car.body.vx = 0;
          car.body.vy = 0;
        }
        if (car.door) placeDoor(car);
      }
    }
  }
}

function stepCones(world: World): void {
  for (const cone of world.cones) {
    if (!cone.down) continue;
    const b = cone.body;
    const s = speed(b);
    if (s > 0) {
      const k = Math.max(0, s - 3 / TICK_RATE) / s;
      b.vx *= k;
      b.vy *= k;
    }
    b.w *= 0.97;
    integrate(b);
  }
}

const cornerBuf: number[] = new Array(8).fill(0);

function insideCorral(world: World): boolean {
  corners(world.cart.body, cornerBuf);
  for (let i = 0; i < 8; i += 2)
    if (!inRect(world.corral, cornerBuf[i]!, cornerBuf[i + 1]!)) return false;
  return true;
}

/** Advances the world one tick with the player's input. Does nothing once the run has ended. */
export function step(world: World, raw: Input): void {
  if (world.status !== "playing") return;
  const input = quantise(raw);
  const cart = world.cart;
  const b = cart.body;

  stepWind(world);
  stepCars(world);
  stepFaults(cart, world.rng);

  const [ax, ay] = fieldAccel(world, b, cart.spec.windFactor);
  stepCart(cart, input, world.surface, ax, ay);
  if (world.loose) {
    const [lx, ly] = fieldAccel(world, world.loose, 1);
    stepLooseCart(world.loose, CARTS.standard as CartSpec, world.surface, lx, ly);
  }

  // Two passes settle stacked contacts (cart against a car against a rail).
  for (let pass = 0; pass < 2; pass++) {
    collideBody(world, b, true);
    if (world.loose) collideBody(world, world.loose, false);
  }
  stepCones(world);

  // Speed bumps: a jolt and a change of direction on the way onto the bump.
  let on = false;
  for (const r of world.bumps) if (inRect(r, b.x, b.y)) on = true;
  if (on && !world.onBump) {
    b.vx *= 0.75;
    b.vy *= 0.75;
    b.w += (world.rng.next() - 0.5) * 3.2;
  }
  world.onBump = on;

  world.tick++;

  if (world.status !== "playing") return;
  if (insideCorral(world) && speed(b) < 0.3 && Math.abs(b.w) < 0.6) {
    if (++world.settle >= SETTLE_TICKS) {
      world.status = "parked";
      world.endTick = world.tick;
    }
  } else {
    world.settle = 0;
  }
}

/** Seconds since the start (or until the end, once parked). */
export function elapsed(world: World): number {
  return (world.status === "playing" ? world.tick : world.endTick) / TICK_RATE;
}

/** The whole run as a pure function: same level, cart and inputs, same world. */
export function simulate(level: Level, cartId: CartId, inputs: readonly Input[]): World {
  const world = createWorld(level, cartId);
  for (const input of inputs) {
    if (world.status !== "playing") break;
    step(world, input);
  }
  return world;
}

/** Is a point inside a car, the corral rails or a wall? (Used by the validator and the bot.) */
export function solidAt(world: World, x: number, y: number): boolean {
  for (const s of world.statics) if (containsPoint(s, x, y)) return true;
  for (const c of world.cars) if (containsPoint(c.body, x, y)) return true;
  return false;
}
