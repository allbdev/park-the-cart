import { formatMoney, formatTime, t, type Locale } from "../content/i18n";
import { DT, TICK_RATE, type Input } from "../core/cart";
import type { Level } from "../core/level";
import type { CartId } from "../content/carts";
import { createWorld, simulate, step, type World } from "../core/world";
import { button, h } from "./dom";
import { copyText } from "./result";
import { copyPoses, createRenderer, poseOf, type LotRenderer, type Pose } from "./render";

/**
 * The replay viewer (board 8). A replay is the level, the cart and the input log; the viewer runs
 * the simulation again from the start, so scrubbing backwards re-simulates (a minute of play is
 * a few milliseconds of simulation).
 */
export interface ReplayOptions {
  locale: Locale;
  level: Level;
  label: string;
  cart: CartId;
  inputs: readonly Input[];
  link: string;
  reducedMotion: boolean;
  onClose(): void;
}

export class ReplayScreen {
  readonly el: HTMLElement;
  private o: ReplayOptions;
  private renderer: LotRenderer;
  private world: World;
  private total: number;
  private path: [number, number][] = [];
  private marks: [number, number][] = [];
  private markTicks: number[] = [];
  private playing = true;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private prev: Pose;
  private prevLoose: Pose[] = [];
  private range: HTMLInputElement;
  private clock: HTMLElement;
  private playBtn: HTMLButtonElement;
  private resizeObs: ResizeObserver | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === "Escape") this.o.onClose();
  };

  constructor(o: ReplayOptions) {
    this.o = o;
    const L = o.locale;
    // One pass to learn the length, the path and where each receipt line happened.
    const probe = createWorld(o.level, o.cart);
    for (let i = 0; i < o.inputs.length && probe.status === "playing"; i++) {
      step(probe, o.inputs[i]!);
      if (probe.tick % 6 === 0) this.path.push([probe.cart.body.x, probe.cart.body.y]);
      while (this.markTicks.length < probe.receipt.length) {
        this.markTicks.push(probe.tick);
        this.marks.push([probe.cart.body.x, probe.cart.body.y]);
      }
    }
    this.total = probe.tick;
    const end = probe;

    this.world = createWorld(o.level, o.cart);
    this.prev = poseOf(this.world.cart.body);
    copyPoses(this.prevLoose, this.world.loose);

    const canvas = h("canvas", { class: "lot", role: "img", "aria-label": t(L, "a11y.canvas") });
    this.renderer = createRenderer(canvas);
    this.renderer.setLevel(o.level);

    this.range = h("input", {
      type: "range",
      min: "0",
      max: String(this.total),
      step: "1",
      value: "0",
      class: "scrub",
      "aria-label": t(L, "replay.scrub"),
    });
    this.range.addEventListener("input", () => this.seek(Number(this.range.value)));
    const marks = h("div", { class: "scrub-marks", "aria-hidden": "true" });
    for (const tk of this.markTicks) {
      const m = h("span", { class: "scrub-mark" });
      m.style.left = `${(100 * tk) / Math.max(1, this.total)}%`;
      marks.append(m);
    }
    this.clock = h("span", { class: "replay-clock" }, "00:00");
    this.playBtn = button("❚❚", "btn btn-yellow play-toggle", () => this.toggle(), {
      "aria-label": t(L, "replay.pause"),
    });
    const feedback = h("span", { class: "share-feedback", "aria-live": "polite" });
    const copy = button(
      t(L, "replay.copyLink"),
      "btn btn-yellow",
      async () => {
        const ok = await copyText(o.link);
        feedback.textContent = ok ? t(L, "result.copied") : o.link;
      },
      { "data-testid": "copy-replay" },
    );

    this.el = h(
      "main",
      { class: "replay", tabindex: "-1", "data-autofocus": true },
      canvas,
      h(
        "div",
        { class: "hud-box replay-title" },
        h("span", { class: "hud-label" }, t(L, "replay.title")),
        h(
          "span",
          { class: "hud-value", "data-testid": "replay-title" },
          `${o.label} · ${formatTime(this.total / TICK_RATE)} · ${formatMoney(L, end.damage, false)}`,
        ),
      ),
      h(
        "div",
        { class: "replay-actions" },
        feedback,
        copy,
        button(t(L, "replay.close"), "btn btn-dark", () => o.onClose()),
      ),
      h(
        "div",
        { class: "replay-bar" },
        this.playBtn,
        this.clock,
        h("div", { class: "scrub-wrap" }, marks, this.range),
        h("span", { class: "replay-clock" }, formatTime(this.total / TICK_RATE)),
        h("p", { class: "replay-note" }, t(L, "replay.note")),
      ),
    );
  }

  mount(): void {
    const fit = () => {
      const r = this.el.getBoundingClientRect();
      this.renderer.resize(r.width, r.height, devicePixelRatio || 1);
      this.renderer.fit(this.world);
    };
    fit();
    this.resizeObs = new ResizeObserver(fit);
    this.resizeObs.observe(this.el);
    addEventListener("keydown", this.onKey);
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.renderer.dispose();
    removeEventListener("keydown", this.onKey);
  }

  private toggle(): void {
    if (!this.playing && this.world.tick >= this.total) this.seek(0);
    this.playing = !this.playing;
    this.playBtn.textContent = this.playing ? "❚❚" : "▶";
    this.playBtn.setAttribute(
      "aria-label",
      t(this.o.locale, this.playing ? "replay.pause" : "replay.play"),
    );
  }

  /** Jump to a tick by re-simulating from the start. */
  seek(tick: number): void {
    const target = Math.max(0, Math.min(this.total, Math.round(tick)));
    if (target < this.world.tick) this.world = createWorld(this.o.level, this.o.cart);
    while (this.world.tick < target && this.world.status === "playing") {
      step(this.world, this.o.inputs[this.world.tick]!);
    }
    this.prev = poseOf(this.world.cart.body);
    copyPoses(this.prevLoose, this.world.loose);
    this.acc = 0;
  }

  /** The final world of the replay (tests). */
  finalWorld(): World {
    return simulate(this.o.level, this.o.cart, this.o.inputs);
  }

  private frame(now: number): void {
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (this.playing) {
      this.acc += dt;
      while (this.acc >= DT && this.world.tick < this.total && this.world.status === "playing") {
        this.acc -= DT;
        this.prev = poseOf(this.world.cart.body);
        copyPoses(this.prevLoose, this.world.loose);
        step(this.world, this.o.inputs[this.world.tick]!);
      }
      if (this.world.tick >= this.total) {
        this.playing = false;
        this.playBtn.textContent = "▶";
      }
    }
    this.range.value = String(this.world.tick);
    this.clock.textContent = formatTime(this.world.tick / TICK_RATE);
    const b = this.world.cart.body;
    this.renderer.track(b.x, b.y);
    const upto = Math.floor(this.world.tick / 6);
    this.renderer.draw(this.world, {
      alpha: this.playing ? Math.min(1, this.acc / DT) : 1,
      prevCart: this.prev,
      prevLoose: this.prevLoose,
      time: now / 1000,
      showYou: false,
      zoom: 0,
      zoomAt: null,
      labels: { you: "", returnHere: t(this.o.locale, "hud.returnHere") },
      path: this.path.slice(0, upto + 1),
      marks: this.marks.filter((_, i) => this.markTicks[i]! <= this.world.tick),
      reducedMotion: this.o.reducedMotion,
    });
  }
}
