import { CARTS, type CartId } from "../content/carts";
import { DEFAULT_LOCALE, t, type Locale } from "../content/i18n";
import { LEVELS, levelById, type LevelEntry } from "../content/levels";
import type { Input } from "../core/cart";
import { isBetter, resultOf } from "../core/result";
import type { World } from "../core/world";
import { button, h } from "./dom";
import { PlayScreen } from "./play";
import { resultScreen } from "./result";
import { howtoScreen, landingScreen, levelsScreen, type Nav } from "./screens";
import { loadProgress, saveProgress, type Progress } from "./store";

export interface AppOptions {
  root: HTMLElement;
  url: string;
  speed: number;
  levelParam: string | null;
}

/** Wires screens, storage and the language. Owns no game rules. */
export class App {
  locale: Locale;
  progress: Progress;
  private root: HTMLElement;
  private o: AppOptions;
  private destroyCurrent: (() => void) | null = null;
  private rerender: (() => void) | null = null;
  play: PlayScreen | null = null;
  private touch: boolean;
  private pauseEl: HTMLElement | null = null;

  constructor(o: AppOptions) {
    this.o = o;
    this.root = o.root;
    this.progress = loadProgress();
    this.locale = this.progress.locale ?? guessLocale();
    this.touch = matchMedia("(pointer: coarse)").matches;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) this.progress.reducedMotion = true;
  }

  start(): void {
    this.applyLocale();
    const entry = this.o.levelParam ? levelById(this.o.levelParam) : undefined;
    if (entry) this.playLevel(entry);
    else this.landing();
  }

  private show(el: HTMLElement, destroy: (() => void) | null, rerender: () => void): void {
    this.closePause();
    this.destroyCurrent?.();
    this.play = null;
    this.root.replaceChildren(el);
    this.destroyCurrent = destroy;
    this.rerender = rerender;
    // Focus the screen's heading (or the play field) so keyboard and screen-reader users start
    // at the top of the new screen.
    const focus = el.matches("[data-autofocus]")
      ? el
      : (el.querySelector<HTMLElement>("[data-autofocus]") ??
        el.querySelector<HTMLElement>("h1") ??
        el.querySelector<HTMLElement>("button"));
    if (focus && !(focus instanceof HTMLButtonElement) && !focus.hasAttribute("tabindex"))
      focus.setAttribute("tabindex", "-1");
    focus?.focus({ preventScroll: true });
  }

  private nav(): Nav {
    return {
      locale: this.locale,
      progress: this.progress,
      play: (e) => this.playLevel(e),
      daily: () => this.playDaily(),
      howto: () => this.howto(),
      levels: () => this.levels(),
      landing: () => this.landing(),
      toggleLocale: () => this.toggleLocale(),
      chooseCart: (id) => this.chooseCart(id),
      dailyStatus: () => this.dailyStatus(),
    };
  }

  landing(): void {
    this.show(landingScreen(this.nav()), null, () => this.landing());
  }

  howto(): void {
    this.show(howtoScreen(this.nav(), this.touch), null, () => this.howto());
  }

  levels(): void {
    this.show(levelsScreen(this.nav(), { dailyEnabled: this.dailyEnabled() }), null, () =>
      this.levels(),
    );
  }

  /** Overridden when the daily level exists (roadmap Phase 4). */
  protected dailyEnabled(): boolean {
    return false;
  }

  protected playDaily(): void {
    this.levels();
  }

  protected dailyStatus(): { label: string; done: boolean } | null {
    return null;
  }

  private chooseCart(id: CartId): void {
    if (CARTS[id].unlockAfter > this.progress.finished) return;
    this.progress.cart = id;
    saveProgress(this.progress);
    this.levels();
  }

  levelLabel(entry: LevelEntry): string {
    return `${entry.number} · ${t(this.locale, `levels.${entry.key}`)}`;
  }

  playLevel(entry: LevelEntry): void {
    const cart =
      CARTS[this.progress.cart].unlockAfter <= this.progress.finished
        ? this.progress.cart
        : "standard";
    const screen = new PlayScreen({
      locale: this.locale,
      level: entry.level,
      levelLabel: this.levelLabel(entry),
      cart,
      reducedMotion: this.progress.reducedMotion,
      touch: this.touch,
      speed: this.o.speed,
      onEnd: (world, inputs) => this.finishLevel(entry, world, inputs),
      onPause: () => this.togglePause(),
    });
    this.show(
      screen.el,
      () => screen.destroy(),
      () => this.playLevel(entry),
    );
    this.play = screen;
    screen.mount();
  }

  protected finishLevel(entry: LevelEntry, world: World, inputs: Input[]): void {
    const result = resultOf(world);
    const prev = this.progress.best[entry.level.id] ?? null;
    const newBest = isBetter(result, prev);
    if (newBest) this.progress.best[entry.level.id] = result;
    if (result.parked && entry.number > this.progress.finished)
      this.progress.finished = entry.number;
    saveProgress(this.progress);
    const next = LEVELS[entry.number];
    this.showResult({
      world,
      inputs,
      label: this.levelLabel(entry),
      best: this.progress.best[entry.level.id] ?? null,
      newBest: newBest && prev !== null,
      share: { levelNumber: entry.number, date: null, url: this.o.url },
      note: null,
      onAgain: () => this.playLevel(entry),
      onNext: next ? () => this.playLevel(next) : null,
    });
  }

  protected showResult(r: {
    world: World;
    inputs: Input[];
    label: string;
    best: ReturnType<typeof resultOf> | null;
    newBest: boolean;
    share: { levelNumber: number | null; date: string | null; url: string };
    note: string | null;
    onAgain: () => void;
    onNext: (() => void) | null;
  }): void {
    const render = () =>
      resultScreen({
        locale: this.locale,
        level: r.world.level,
        levelLabel: r.label,
        result: resultOf(r.world),
        lines: r.world.receipt,
        best: r.best,
        newBest: r.newBest,
        share: r.share,
        note: r.note,
        hasNext: r.onNext !== null,
        onAgain: r.onAgain,
        onNext: () => r.onNext?.(),
        onLevels: () => this.levels(),
        onReplay: () => this.watchReplay(r.world, r.inputs, r.label),
      });
    this.show(render(), null, () => this.showResult(r));
  }

  /** Overridden when the replay viewer exists (roadmap Phase 4). */
  protected watchReplay(world: World, inputs: Input[], label: string): void {
    void world;
    void inputs;
    void label;
  }

  togglePause(): void {
    if (!this.play) return;
    if (this.pauseEl) return this.closePause();
    const L = this.locale;
    const play = this.play;
    play.setPaused(true);
    const motion = h("input", { type: "checkbox", id: "reduce-motion" });
    motion.checked = this.progress.reducedMotion;
    motion.addEventListener("change", () => {
      this.progress.reducedMotion = motion.checked;
      saveProgress(this.progress);
    });
    const resume = button(t(L, "pause.resume"), "btn btn-red", () => this.closePause(), {
      "data-autofocus": true,
    });
    const el = h(
      "div",
      { class: "pause", role: "dialog", "aria-modal": "true", "aria-labelledby": "pause-title" },
      h(
        "div",
        { class: "pause-card" },
        h("h2", { id: "pause-title" }, t(L, "pause.title")),
        resume,
        button(t(L, "pause.restart"), "btn btn-dark", () => {
          this.closePause();
          play.restart();
        }),
        button(t(L, "pause.levels"), "btn btn-dark", () => this.levels()),
        h("label", { class: "check" }, motion, t(L, "pause.sound")),
      ),
    );
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.closePause();
      }
    });
    this.pauseEl = el;
    this.root.append(el);
    resume.focus();
  }

  private closePause(): void {
    if (!this.pauseEl) return;
    this.pauseEl.remove();
    this.pauseEl = null;
    this.play?.setPaused(false);
  }

  toggleLocale(): void {
    this.locale = this.locale === "en" ? "pt-BR" : "en";
    this.progress.locale = this.locale;
    saveProgress(this.progress);
    this.applyLocale();
    this.rerender?.();
  }

  private applyLocale(): void {
    document.documentElement.lang = this.locale;
    document.title = t(this.locale, "meta.title");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t(this.locale, "meta.description"));
  }
}

function guessLocale(): Locale {
  const langs = navigator.languages ?? [navigator.language];
  return langs.some((l) => l?.toLowerCase().startsWith("pt")) ? "pt-BR" : DEFAULT_LOCALE;
}
