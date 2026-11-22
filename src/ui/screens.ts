import { CART_IDS, cartBefore, type CartId } from "../content/carts";
import { t, type Locale } from "../content/i18n";
import { LEVEL_IDS, LEVELS, type LevelEntry } from "../content/levels";
import type { Level } from "../core/level";
import { createWorld } from "../core/world";
import { button, h } from "./dom";
import { bestText } from "./format";
import { poseOf, Renderer2D, type LotRenderer } from "./render";
import { Renderer3D, supports3d } from "./render3d";
import { cartUnlocked, doneWith, type Progress } from "./store";

/** Landing (board 1), how it works (board 2) and level select (board 6). */

export interface Nav {
  locale: Locale;
  progress: Progress;
  play(entry: LevelEntry): void;
  daily(): void;
  howto(): void;
  levels(): void;
  landing(): void;
  toggleLocale(): void;
  chooseCart(id: CartId): void;
  dailyStatus(): { label: string; done: boolean } | null;
}

const STILL_OPTIONS = {
  alpha: 1,
  time: 0,
  showYou: false,
  zoom: 0,
  zoomAt: null,
  labels: { you: "", returnHere: "" },
  reducedMotion: true,
} as const;

/** One hidden 3D renderer draws every still; browsers only allow a handful of GPU contexts. */
let stills: LotRenderer | null = null;
const thumbs = new Map<string, HTMLCanvasElement>();

/**
 * A still picture of a level, for backdrops and thumbnails. `fill` < 1 moves the camera in so
 * the lot covers the frame. Thumbnails are cached: a level's picture never changes.
 */
export function levelPicture(
  level: Level,
  w: number,
  h: number,
  cls: string,
  fill = 1,
): HTMLCanvasElement {
  const key = `${level.id}:${w}x${h}:${fill}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.className = cls;
  c.setAttribute("aria-hidden", "true");
  const dpr = Math.min(2, devicePixelRatio || 1);
  const world = createWorld(level, "standard");
  const pose = { x: world.cart.body.x, y: world.cart.body.y, a: world.cart.body.a };
  const o = {
    ...STILL_OPTIONS,
    prevCart: pose,
    prevLoose: world.loose.map(poseOf),
  };
  const small = w < 400;
  if (supports3d()) {
    stills ??= new Renderer3D(document.createElement("canvas"));
    stills.setLevel(level, small ? 20 : 48);
    stills.resize(w, h, dpr);
    stills.fit(null, fill);
    stills.draw(world, o);
    // Copy straight away: the GPU canvas only keeps its picture until the browser next paints.
    c.width = stills.canvas.width;
    c.height = stills.canvas.height;
    c.getContext("2d")!.drawImage(stills.canvas, 0, 0);
  } else {
    const r = new Renderer2D(c);
    r.setLevel(level);
    r.resize(w, h, dpr);
    r.fit(null, fill);
    r.draw(world, o);
  }
  if (small) thumbs.set(key, c);
  return c;
}

function langButton(nav: Nav): HTMLButtonElement {
  return button(t(nav.locale, "lang.short"), "btn btn-ghost lang", () => nav.toggleLocale(), {
    "aria-label": t(nav.locale, "lang.switchTo"),
    lang: nav.locale === "en" ? "pt-BR" : "en",
  });
}

export function landingScreen(nav: Nav): HTMLElement {
  const L = nav.locale;
  const bg = levelPicture(LEVELS[2]!.level, innerWidth, innerHeight, "backdrop", 0.8);
  const play = button(
    t(L, "landing.play"),
    "btn btn-red big",
    () => (nav.progress.finished > 0 ? nav.levels() : nav.howto()),
    {
      "data-testid": "play",
    },
  );
  const daily = button(t(L, "landing.daily"), "btn btn-outline big", () => nav.daily(), {
    "data-testid": "daily",
  });
  return h(
    "main",
    { class: "landing" },
    bg,
    h("div", { class: "landing-shade" }),
    langButton(nav),
    h(
      "div",
      { class: "landing-body" },
      h(
        "h1",
        { class: "title" },
        h("span", { class: "title-1" }, t(L, "landing.title1")),
        h("span", { class: "title-2" }, t(L, "landing.title2")),
      ),
      h("p", { class: "pitch" }, t(L, "landing.pitch")),
      h("div", { class: "row" }, play, daily),
      h(
        "p",
        { class: "footer" },
        t(L, "landing.footer"),
        " · ",
        h(
          "a",
          { href: "https://github.com/allbdev/park-the-cart", rel: "noopener", target: "_blank" },
          t(L, "landing.source"),
        ),
      ),
    ),
    h(
      "aside",
      { class: "offer", "aria-label": t(L, "landing.offerKicker") },
      h("span", { class: "offer-kicker" }, t(L, "landing.offerKicker")),
      h("span", { class: "offer-big" }, t(L, "landing.offerBig")),
      h("span", { class: "offer-small" }, t(L, "landing.offerSmall")),
    ),
  );
}

export function howtoScreen(nav: Nav, touch: boolean): HTMLElement {
  const L = nav.locale;
  const bg = levelPicture(LEVELS[2]!.level, innerWidth, innerHeight, "backdrop", 0.8);
  const card = (n: number, title: string, body: string) =>
    h(
      "li",
      { class: "how-card" },
      h("span", { class: "how-n", "aria-hidden": "true" }, String(n)),
      h("h2", {}, title),
      h("p", {}, body),
    );
  const go = button(t(L, "howto.go"), "btn btn-red big", () => nav.play(LEVELS[0]!), {
    "data-testid": "go",
  });
  return h(
    "main",
    { class: "howto" },
    bg,
    h("div", { class: "landing-shade" }),
    h("h1", {}, t(L, "howto.title")),
    h(
      "ol",
      { class: "how-cards" },
      card(1, t(L, "howto.step1Title"), t(L, "howto.step1")),
      card(2, t(L, "howto.step2Title"), t(L, "howto.step2")),
      card(3, t(L, "howto.step3Title"), t(L, "howto.step3")),
    ),
    h("p", { class: "how-keys" }, touch ? t(L, "howto.touch") : t(L, "howto.keys")),
    go,
  );
}

export function levelsScreen(nav: Nav, opts: { dailyEnabled: boolean }): HTMLElement {
  const L = nav.locale;
  const p = nav.progress;
  // The cart in use: the chosen one, or the standard cart if that one isn't open (any more).
  const cart = cartUnlocked(p, p.cart, LEVEL_IDS) ? p.cart : "standard";
  const grid = h("ol", { class: "level-grid" });
  for (const entry of LEVELS) {
    const name = t(L, `levels.${entry.key}`);
    const locked = entry.number > p.finished + 1;
    const best = p.best[entry.level.id];
    const status = locked
      ? h("span", { class: "card-status" }, t(L, "levelsScreen.locked"))
      : best
        ? h(
            "span",
            { class: "card-status" },
            t(L, "levelsScreen.best", {
              price: bestText(L, best).split(" · ")[0]!,
              time: bestText(L, best).split(" · ")[1]!,
            }),
          )
        : h("span", { class: "card-status now" }, t(L, "levelsScreen.playNow"));
    const doneHere = !locked && (p.done[cart] ?? []).includes(entry.level.id);
    const thumb = levelPicture(entry.level, 260, 146, "thumb");
    const card = h(
      "button",
      {
        type: "button",
        class: `level-card${locked ? " locked" : ""}`,
        "aria-label": locked
          ? t(L, "levelsScreen.lockedLabel", { n: entry.number, name })
          : t(L, "levelsScreen.cardLabel", { n: entry.number, name }),
        "aria-disabled": locked ? "true" : undefined,
        "data-testid": `level-${entry.number}`,
      },
      h("span", { class: "card-pic" }, thumb, h("span", { class: "card-n" }, String(entry.number))),
      h("span", { class: "card-name" }, name),
      status,
      doneHere ? h("span", { class: "card-done" }, t(L, "levelsScreen.doneWith")) : null,
    );
    card.addEventListener("click", () => {
      if (!locked) nav.play(entry);
    });
    grid.append(h("li", {}, card));
  }

  const side = h("div", { class: "levels-side" });
  if (opts.dailyEnabled) {
    const st = nav.dailyStatus();
    side.append(
      h(
        "section",
        { class: "daily-card" },
        h("p", { class: "kicker" }, t(L, "levelsScreen.dailyKicker")),
        h("h2", {}, t(L, "levelsScreen.dailyTitle")),
        h("p", {}, st ? st.label : t(L, "levelsScreen.dailyBody")),
        button(t(L, "levelsScreen.dailyPlay"), "btn btn-red", () => nav.daily(), {
          "data-testid": "daily-play",
        }),
      ),
    );
  }
  const carList = h("div", {
    class: "cart-list",
    role: "radiogroup",
    "aria-label": t(L, "levelsScreen.cartKicker"),
  });
  for (const id of CART_IDS) {
    const unlocked = cartUnlocked(p, id, LEVEL_IDS);
    const before = cartBefore(id);
    const lockedText = before
      ? t(L, "levelsScreen.cartLocked", {
          name: t(L, `carts.${before}`),
          n: doneWith(p, before, LEVEL_IDS),
          total: LEVEL_IDS.length,
        })
      : "";
    const name = t(L, `carts.${id}`);
    const b = h(
      "button",
      {
        type: "button",
        role: "radio",
        "aria-checked": cart === id ? "true" : "false",
        "aria-disabled": unlocked ? undefined : "true",
        class: `cart-choice${cart === id ? " on" : ""}${unlocked ? "" : " locked"}`,
        title: unlocked ? t(L, `carts.${id}Fault`) : lockedText,
        "data-testid": `cart-${id}`,
      },
      h("span", { class: "cart-name" }, name),
      h("span", { class: "cart-fault" }, unlocked ? t(L, `carts.${id}Fault`) : lockedText),
    );
    b.addEventListener("click", () => {
      if (unlocked) nav.chooseCart(id);
    });
    carList.append(b);
  }
  side.append(
    h(
      "section",
      { class: "cart-card" },
      h("p", { class: "kicker" }, t(L, "levelsScreen.cartKicker")),
      h("h2", {}, t(L, `carts.${cart}`)),
      h("p", {}, t(L, "levelsScreen.cartBody")),
      h(
        "p",
        { class: "cart-progress", "data-testid": "cart-progress" },
        t(L, "levelsScreen.cartProgress", {
          n: doneWith(p, cart, LEVEL_IDS),
          total: LEVEL_IDS.length,
        }),
      ),
      carList,
    ),
  );

  return h(
    "main",
    { class: "levels" },
    h(
      "header",
      { class: "levels-head" },
      h("h1", { class: "tag-title" }, t(L, "levelsScreen.title")),
      h("p", {}, t(L, "levelsScreen.subtitle")),
      h(
        "div",
        { class: "row" },
        langButton(nav),
        button(t(L, "levelsScreen.back"), "btn btn-dark", () => nav.landing()),
      ),
    ),
    h("div", { class: "levels-body" }, grid, side),
  );
}
