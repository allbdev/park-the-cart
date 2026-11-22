import type { CartId } from "../content/carts";
import { DEFAULT_LOCALE, formatMoney, formatTime, t, type Locale } from "../content/i18n";
import { LEVEL_IDS, LEVELS, levelById, type LevelEntry } from "../content/levels";
import type { Input } from "../core/cart";
import { dailyLevel, dateKey, isDateKey, type Daily } from "../core/daily";
import type { Level } from "../core/level";
import { decodeReplay, encodeReplay } from "../core/replay";
import { isBetter, resultOf, seconds } from "../core/result";
import type { World } from "../core/world";
import { button, h } from "./dom";
import { formatDate } from "./format";
import { PlayScreen } from "./play";
import { ReplayScreen } from "./replay";
import { resultScreen } from "./result";
import { howtoScreen, landingScreen, levelsScreen, type Nav } from "./screens";
import { cartUnlocked, loadProgress, markDone, saveProgress, type Progress } from "./store";

export interface AppOptions {
  root: HTMLElement;
  url: string;
  speed: number;
  levelParam: string | null;
  /** The part after #r= in the URL, if any. */
  replayParam: string | null;
  /** Test only: pretend today is this date. */
  dateParam: string | null;
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
  replay: ReplayScreen | null = null;
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
    if (this.o.replayParam !== null) {
      if (!this.startReplay(this.o.replayParam)) {
        this.landing();
        const note = h("p", { class: "notice", role: "alert" }, t(this.locale, "replay.bad"));
        this.root.querySelector("main")?.append(note);
      }
    } else if (this.o.levelParam === "daily") this.playDaily();
    else if (entry) this.playLevel(entry);
    else this.landing();
  }

  private show(el: HTMLElement, destroy: (() => void) | null, rerender: () => void): void {
    this.closePause();
    this.destroyCurrent?.();
    this.play = null;
    this.replay = null;
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

  private dailyEnabled(): boolean {
    return true;
  }

  /** Today's date key in the player's local time (rollover at local midnight). */
  todayKey(): string {
    if (this.o.dateParam && isDateKey(this.o.dateParam)) return this.o.dateParam;
    const d = new Date();
    return dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  private dailyCache: { key: string; daily: Daily } | null = null;

  private dailyFor(key: string): Daily {
    if (this.dailyCache?.key !== key) this.dailyCache = { key, daily: dailyLevel(key) };
    return this.dailyCache.daily;
  }

  private dailyStatus(): { label: string; done: boolean } | null {
    const r = this.progress.daily[this.todayKey()];
    if (!r) return null;
    return {
      done: true,
      label: r.parked
        ? t(this.locale, "levelsScreen.dailyDone", {
            price: formatMoney(this.locale, r.damage, false),
            time: formatTime(seconds(r.ticks)),
          })
        : t(this.locale, "levelsScreen.dailyFailed"),
    };
  }

  playDaily(): void {
    const key = this.todayKey();
    const daily = this.dailyFor(key);
    const date = formatDate(this.locale, key);
    const label = t(this.locale, "hud.dailyTag", { date });
    const first = !this.progress.daily[key];
    this.startPlay(
      daily.level,
      label,
      (world, inputs) => {
        const result = resultOf(world);
        if (first) {
          this.progress.daily[key] = result;
          // A test date override (?test=1&date=) stays in memory: a link must not spend a real
          // day's first try.
          if (!this.o.dateParam) saveProgress(this.progress);
        }
        const counted = this.progress.daily[key]!;
        this.showResult({
          world,
          inputs,
          label,
          best: counted,
          newBest: false,
          share: { levelNumber: null, date, url: this.o.url },
          note: t(this.locale, first ? "result.dailyFirst" : "result.dailyPractice"),
          onAgain: () => this.playDaily(),
          onNext: null,
        });
      },
      () => this.playDaily(),
    );
  }

  private chooseCart(id: CartId): void {
    if (!cartUnlocked(this.progress, id, LEVEL_IDS)) return;
    this.progress.cart = id;
    saveProgress(this.progress);
    this.levels();
  }

  levelLabel(entry: LevelEntry): string {
    return `${entry.number} · ${t(this.locale, `levels.${entry.key}`)}`;
  }

  playLevel(entry: LevelEntry): void {
    this.startPlay(
      entry.level,
      this.levelLabel(entry),
      (world, inputs) => this.finishLevel(entry, world, inputs),
      () => this.playLevel(entry),
    );
  }

  private currentCart(): CartId {
    return cartUnlocked(this.progress, this.progress.cart, LEVEL_IDS)
      ? this.progress.cart
      : "standard";
  }

  private startPlay(
    level: Level,
    label: string,
    onEnd: (world: World, inputs: Input[]) => void,
    again: () => void,
  ): void {
    const screen = new PlayScreen({
      locale: this.locale,
      level,
      levelLabel: label,
      cart: this.currentCart(),
      reducedMotion: this.progress.reducedMotion,
      touch: this.touch,
      speed: this.o.speed,
      onEnd,
      onPause: () => this.togglePause(),
    });
    this.show(screen.el, () => screen.destroy(), again);
    this.play = screen;
    screen.mount();
  }

  private finishLevel(entry: LevelEntry, world: World, inputs: Input[]): void {
    const result = resultOf(world);
    const prev = this.progress.best[entry.level.id] ?? null;
    const newBest = isBetter(result, prev);
    if (newBest) this.progress.best[entry.level.id] = result;
    if (result.parked && entry.number > this.progress.finished)
      this.progress.finished = entry.number;
    if (result.parked) markDone(this.progress, result.cart, entry.level.id);
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

  private showResult(r: {
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
        reason: r.world.failReason,
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

  private watchReplay(world: World, inputs: Input[], label: string): void {
    const back = this.rerender;
    const link = `${this.o.url}#r=${encodeReplay({ level: world.level.id, cart: world.cartId, inputs })}`;
    this.openReplay(world.level, world.cartId, inputs, label, link, () =>
      back ? back() : this.landing(),
    );
  }

  private openReplay(
    level: Level,
    cart: CartId,
    inputs: readonly Input[],
    label: string,
    link: string,
    onClose: () => void,
  ): void {
    const screen = new ReplayScreen({
      locale: this.locale,
      level,
      label,
      cart,
      inputs,
      link,
      reducedMotion: this.progress.reducedMotion,
      onClose,
    });
    this.show(
      screen.el,
      () => screen.destroy(),
      () => this.openReplay(level, cart, inputs, label, link, onClose),
    );
    this.replay = screen;
    screen.mount();
  }

  /** Opens a replay link (#r=...). Untrusted: anything malformed shows a message instead. */
  private startReplay(param: string): boolean {
    const r = decodeReplay(param);
    if (!r) return false;
    let level: Level | null = null;
    let label = "";
    const entry = levelById(r.level);
    const daily = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(r.level);
    if (entry) {
      level = entry.level;
      label = this.levelLabel(entry);
    } else if (daily && isDateKey(daily[1]!)) {
      level = this.dailyFor(daily[1]!).level;
      label = t(this.locale, "hud.dailyTag", { date: formatDate(this.locale, daily[1]!) });
    }
    if (!level) return false;
    const link = `${this.o.url}#r=${param}`;
    this.openReplay(level, r.cart, r.inputs, label, link, () => {
      history.replaceState(null, "", location.pathname + location.search);
      this.landing();
    });
    return true;
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
