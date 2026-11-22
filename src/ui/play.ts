import { CARTS, type CartId } from "../content/carts";
import { formatMoney, formatTime, moneyParts, t, type Locale } from "../content/i18n";
import { DT, type Input } from "../core/cart";
import type { Level } from "../core/level";
import { decodeInputs } from "../core/replay";
import { receiptItems } from "../core/result";
import { createWorld, elapsed, step, type ReceiptLine, type World } from "../core/world";
import { button, h } from "./dom";
import { itemText } from "./format";
import { bindHold, bindStick, Controls, type SteerMode } from "./input";
import { receiptEl } from "./receipt";
import { copyPoses, createRenderer, poseOf, type LotRenderer, type Pose } from "./render";

/**
 * The play screen: canvas, HUD (board 3), the open receipt and price tags (board 4), touch
 * controls on phones. Owns the fixed-step loop; the world itself is pure.
 */

export interface PlayOptions {
  locale: Locale;
  level: Level;
  levelLabel: string;
  cart: CartId;
  reducedMotion: boolean;
  touch: boolean;
  /** Called once the run ends (after a short beat), with the world and the input log. */
  onEnd: (world: World, inputs: Input[]) => void;
  onPause: () => void;
  /** "point": go the way the keys or stick point on screen. "cart": push and twist the cart. */
  steer: SteerMode;
  /** Speeds the simulation up for tests (?test=1&speed=N). */
  speed: number;
}

function tipFor(level: Level): string | null {
  // The wind gauge needs explaining more than a car coming at you does.
  if (level.hazards.some((h) => h.type === "wind")) return "tips.wind";
  if (level.hazards.some((h) => h.type === "traffic")) return "tips.traffic";
  if (level.surface === "wet") return "tips.rain";
  if (level.hazards.some((h) => h.type === "slope")) return "tips.slope";
  if (level.cars.some((c) => c.reverse)) return "tips.reversing";
  if (level.cars.some((c) => c.model === "manager")) return "tips.manager";
  if (level.cars.some((c) => c.door)) return "tips.door";
  if (level.hazards.some((h) => h.type === "cart")) return "tips.cart";
  if (level.hazards.some((h) => h.type === "speedBump")) return "tips.bump";
  return null;
}

/** The locale key of the controls text for this device and steering mode. */
export function hintKey(prefix: "hud.hint" | "howto.", touch: boolean, steer: SteerMode): string {
  const device = prefix === "howto." ? (touch ? "touch" : "keys") : touch ? "Touch" : "Keys";
  return `${prefix}${device}${steer === "cart" ? "Cart" : ""}`;
}

/** The little cart icon with its bad wheel, for the HUD. */
function wheelIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 64 44");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("wheel-icon");
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  };
  add("rect", {
    x: "10",
    y: "8",
    width: "40",
    height: "26",
    rx: "2",
    fill: "none",
    stroke: "#fff",
    "stroke-width": "3",
  });
  add("line", {
    x1: "6",
    y1: "6",
    x2: "6",
    y2: "36",
    stroke: "#d21c18",
    "stroke-width": "4",
    "stroke-linecap": "round",
  });
  add("rect", { x: "10", y: "2", width: "9", height: "6", rx: "2", fill: "#fff" });
  add("rect", { x: "10", y: "34", width: "9", height: "6", rx: "2", fill: "#fff" });
  add("rect", { x: "42", y: "2", width: "9", height: "6", rx: "2", fill: "#fff" });
  add("rect", {
    x: "41",
    y: "34",
    width: "9",
    height: "6",
    rx: "2",
    fill: "#d21c18",
    transform: "rotate(25 46 37)",
  });
  add("path", {
    d: "M54 22 q8 6 2 16 l-3 -4 m3 4 l4 -2",
    fill: "none",
    stroke: "#ffd400",
    "stroke-width": "3",
    "stroke-linecap": "round",
  });
  return svg;
}

/** Set once the player chooses to play upright; remembered until the page is closed. */
let playUpright = false;

export class PlayScreen {
  readonly el: HTMLElement;
  private o: PlayOptions;
  private world: World;
  private inputs: Input[] = [];
  private renderer: LotRenderer;
  private controls = new Controls();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private prevCart: Pose;
  private prevLoose: Pose[] = [];
  private ended = false;
  private endTimer = 0;
  paused = false;
  private hud: { time: HTMLElement; damage: HTMLElement; status: HTMLElement };
  /** The wind gauge, on windy levels: the bar's fill and the word beside it. */
  private windBar: HTMLElement | null = null;
  private windWord: HTMLElement | null = null;
  private gusting: boolean | null = null;
  /** Phones held upright: the "turn it sideways" card is up and the game waits. */
  private upright = false;
  private portrait: MediaQueryList | null = null;
  private onTurn = () => this.checkTurn();
  private receiptSlot: HTMLElement;
  private tags: HTMLElement;
  private lastLines = 0;
  private resizeObs: ResizeObserver | null = null;
  private unbindStick: (() => void) | null = null;
  private startWall = 0;

  constructor(o: PlayOptions) {
    this.o = o;
    this.world = createWorld(o.level, o.cart);
    this.prevCart = poseOf(this.world.cart.body);
    copyPoses(this.prevLoose, this.world.loose);

    const L = o.locale;
    const canvas = h("canvas", { class: "lot", role: "img", "aria-label": t(L, "a11y.canvas") });
    this.renderer = createRenderer(canvas);
    this.renderer.setLevel(o.level);

    const time = h("span", { class: "hud-value" }, "00:00");
    const damage = h("span", { class: "tag-price" });
    const status = h("p", { class: "visually-hidden", "aria-live": "polite" });
    this.hud = { time, damage, status };

    const spec = CARTS[o.cart];
    const tip = tipFor(o.level);
    this.receiptSlot = h("div", { class: "receipt-slot" });
    this.tags = h("div", { class: "tags", "aria-hidden": "true" });

    const hudLeft = h(
      "div",
      { class: "hud-left" },
      h(
        "div",
        { class: "hud-box" },
        h("span", { class: "hud-label" }, t(L, "hud.level")),
        h("span", { class: "hud-value" }, o.levelLabel),
      ),
      h("div", { class: "hud-box" }, h("span", { class: "hud-label" }, t(L, "hud.time")), time),
      h(
        "div",
        { class: "hud-tag" },
        h("span", { class: "hud-label" }, t(L, "hud.damage")),
        damage,
        o.level.limit === undefined
          ? null
          : h(
              "span",
              { class: "hud-limit", "data-testid": "limit" },
              t(L, "hud.limit", { price: formatMoney(L, o.level.limit, false) }),
            ),
      ),
    );
    const wind = this.world.wind;
    if (wind) {
      // An arrow pointing where the wind blows, a bar that fills with the gust, and a word,
      // so the state never depends on colour alone.
      const arrow = h("span", { class: "wind-arrow", "aria-hidden": "true" }, "➜");
      arrow.style.transform = `rotate(${(Math.atan2(wind.ay, wind.ax) * 180) / Math.PI}deg)`;
      this.windBar = h("span", { class: "wind-fill" });
      this.windWord = h("span", { class: "wind-word", "data-testid": "wind-word" });
      hudLeft.append(
        h(
          "div",
          { class: "hud-box hud-wind", "data-testid": "wind" },
          h("span", { class: "hud-label" }, t(L, "hud.windLabel")),
          h(
            "span",
            { class: "wind-row" },
            arrow,
            h("span", { class: "wind-bar" }, this.windBar),
            this.windWord,
          ),
        ),
      );
    }
    const hudRight = h(
      "div",
      { class: "hud-wheel" },
      wheelIcon(),
      h(
        "span",
        {},
        h("span", { class: "hud-label" }, t(L, "hud.wheel")),
        h("span", { class: "hud-pull" }, t(L, `hud.pulls.${spec.pulls}`)),
      ),
    );
    const restart = button(t(L, "hud.restart"), "btn btn-dark restart", () => this.restart());
    const pause = button("II", "btn btn-dark pause-btn", () => o.onPause(), {
      "aria-label": t(L, "hud.pause"),
    });
    const hint = h(
      "p",
      { class: "hint" },
      tip ? t(L, tip) : t(L, hintKey("hud.hint", o.touch, o.steer)),
    );

    this.el = h(
      "main",
      { class: `play${o.touch ? " touch" : ""}`, tabindex: "-1", "data-autofocus": true },
      canvas,
      this.tags,
      hudLeft,
      hudRight,
      pause,
      this.receiptSlot,
      hint,
      restart,
      status,
    );

    if (o.touch) {
      const knob = h("span", { class: "stick-knob" });
      const stick = h("div", { class: "stick" }, h("span", { class: "stick-ring" }), knob);
      // The whole left half takes the thumb; the stick appears wherever it lands.
      const zone = h(
        "div",
        { class: "stick-zone", "aria-label": t(L, "a11y.stick"), role: "group" },
        stick,
      );
      const hold = h("button", { type: "button", class: "hold-btn" }, t(L, "hud.hold"));
      this.el.append(zone, hold);
      this.unbindStick = bindStick(zone, stick, knob, this.controls);
      bindHold(hold, this.controls);
    }

    if (o.touch) {
      // The lot is wide: on a phone held upright, ask for landscape before anything else.
      const anyway = button(t(L, "hud.rotateAnyway"), "btn btn-outline", () => {
        playUpright = true;
        this.checkTurn();
      });
      this.el.append(
        h(
          "div",
          {
            class: "rotate",
            role: "dialog",
            "aria-labelledby": "rotate-title",
            "data-testid": "rotate",
          },
          h("span", { class: "rotate-phone", "aria-hidden": "true" }),
          h("h2", { id: "rotate-title" }, t(L, "hud.rotateTitle")),
          h("p", {}, t(L, "hud.rotateBody")),
          anyway,
        ),
      );
    }

    this.controls.onAction = (a) => (a === "restart" ? this.restart() : o.onPause());
    this.updateHud();
  }

  mount(): void {
    this.controls.attach();
    const fit = () => {
      const r = this.el.getBoundingClientRect();
      this.renderer.resize(r.width, r.height, devicePixelRatio || 1);
      // Full bleed, like board 3: the HUD floats over the top row of cars.
      this.renderer.fit(this.world);
    };
    fit();
    this.resizeObs = new ResizeObserver(fit);
    this.resizeObs.observe(this.el);
    if (this.o.touch && typeof matchMedia === "function") {
      this.portrait = matchMedia("(orientation: portrait)");
      this.portrait.addEventListener("change", this.onTurn);
      this.checkTurn();
    }
    this.startWall = performance.now();
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.endTimer);
    this.controls.detach();
    this.resizeObs?.disconnect();
    this.portrait?.removeEventListener("change", this.onTurn);
    this.renderer.dispose();
    this.unbindStick?.();
  }

  /** Shows or hides the "turn your phone" card, and holds the game while it's up. */
  private checkTurn(): void {
    const upright = !!this.portrait?.matches && !playUpright;
    if (upright === this.upright) return;
    this.upright = upright;
    this.el.classList.toggle("upright", upright);
    this.last = performance.now();
    this.controls.reset();
  }

  /** Changes how the player steers, mid-level (from the pause menu). */
  setSteer(mode: SteerMode): void {
    this.o.steer = mode;
    this.controls.reset();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.last = performance.now();
    this.controls.reset();
  }

  restart(): void {
    clearTimeout(this.endTimer);
    this.world = createWorld(this.o.level, this.o.cart);
    this.inputs = [];
    this.prevCart = poseOf(this.world.cart.body);
    copyPoses(this.prevLoose, this.world.loose);
    this.ended = false;
    this.lastLines = 0;
    this.acc = 0;
    this.controls.reset();
    this.receiptSlot.replaceChildren();
    this.tags.replaceChildren();
    this.renderer.fit(this.world);
    this.updateHud();
  }

  /** For tests: feed a whole input log at once. */
  playInputs(inputs: readonly Input[]): void {
    for (const i of inputs) this.tick(i);
    this.updateHud();
  }

  /** For tests: play the level's recorded par run. */
  playPar(): void {
    const inputs = this.o.level.par ? decodeInputs(this.o.level.par.inputs) : null;
    if (inputs) this.playInputs(inputs);
  }

  getWorld(): World {
    return this.world;
  }

  private tick(input: Input): void {
    if (this.world.status !== "playing") return;
    this.prevCart = poseOf(this.world.cart.body);
    copyPoses(this.prevLoose, this.world.loose);
    this.inputs.push(input);
    step(this.world, input);
    if (this.world.receipt.length !== this.lastLines) this.onHits();
    if (this.world.status !== "playing") this.onEnd();
  }

  private frame(now: number): void {
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused && !this.upright && !this.ended) {
      this.acc += dt * this.o.speed;
      // The clock starts on the first key or touch.
      if (this.world.tick === 0 && !this.controls.touched) this.acc = 0;
      while (this.acc >= DT && this.world.status === "playing") {
        this.acc -= DT;
        const b = this.world.cart.body;
        this.tick(this.controls.read(this.o.steer, b.a, b.w));
      }
      this.updateHud();
    }
    const b = this.world.cart.body;
    this.renderer.track(b.x, b.y);
    const sinceHit = (this.world.tick - this.world.lastHit) * DT;
    const zoom = sinceHit < 0.5 ? Math.sin((sinceHit / 0.5) * Math.PI) : 0;
    this.renderer.draw(this.world, {
      alpha: this.ended ? 1 : Math.min(1, this.acc / DT),
      prevCart: this.prevCart,
      prevLoose: this.prevLoose,
      time: (now - this.startWall) / 1000,
      showYou: this.world.tick === 0,
      zoom,
      zoomAt: [b.x, b.y],
      labels: { you: t(this.o.locale, "hud.you"), returnHere: t(this.o.locale, "hud.returnHere") },
      reducedMotion: this.o.reducedMotion,
    });
  }

  private updateHud(): void {
    const L = this.o.locale;
    this.hud.time.textContent = formatTime(elapsed(this.world));
    const [whole, cents] = moneyParts(L, this.world.damage);
    this.hud.damage.replaceChildren(
      h("small", {}, "R$"),
      document.createTextNode(whole),
      h("sup", {}, (L === "pt-BR" ? "," : ".") + cents),
    );
    const wind = this.world.wind;
    if (wind && this.windBar && this.windWord) {
      this.windBar.style.width = `${Math.round(Math.min(1, wind.level) * 100)}%`;
      // "Gust" from the moment it starts building, so there's time to react.
      const gusting = wind.target > 0.5 || wind.level > 0.6;
      if (gusting !== this.gusting) {
        this.gusting = gusting;
        this.windWord.textContent = t(L, gusting ? "hud.gust" : "hud.calm");
        this.windBar.parentElement!.classList.toggle("gusting", gusting);
      }
    }
  }

  private onHits(): void {
    const L = this.o.locale;
    const fresh: ReceiptLine[] = this.world.receipt.slice(this.lastLines);
    this.lastLines = this.world.receipt.length;
    this.receiptSlot.replaceChildren(
      receiptEl(L, this.world.receipt, { open: true, total: this.world.damage }),
    );
    const b = this.world.cart.body;
    const [sx, sy] = this.renderer.toScreen(b.x, b.y);
    for (const line of fresh) {
      const item = receiptItems([line])[0]!;
      const { title, sub } = itemText(L, item);
      const [whole, cents] = moneyParts(L, line.price);
      const tag = h(
        "div",
        { class: "price-pop" },
        h("span", { class: "pop-what" }, `${title} · ${sub}`),
        h(
          "span",
          { class: "pop-price" },
          h("small", {}, "+ R$"),
          whole,
          h("sup", {}, (L === "pt-BR" ? "," : ".") + cents),
        ),
      );
      const w = this.el.clientWidth;
      tag.style.left = `${Math.max(8, Math.min(w - 300, sx + 30))}px`;
      tag.style.top = `${Math.max(90, sy - 110)}px`;
      if (this.o.reducedMotion) tag.classList.add("still");
      this.tags.append(tag);
      setTimeout(() => tag.remove(), 1600);
      this.hud.status.textContent = `${title}, ${sub}: ${formatMoney(L, line.price)}`;
    }
  }

  private onEnd(): void {
    if (this.ended) return;
    this.ended = true;
    this.updateHud();
    const world = this.world;
    const inputs = this.inputs.slice();
    this.endTimer = window.setTimeout(
      () => this.o.onEnd(world, inputs),
      world.status === "parked" ? 700 : 1100,
    );
  }
}
