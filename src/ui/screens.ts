import { CART_IDS, CARTS, type CartId } from "../content/carts";
import { t, type Locale } from "../content/i18n";
import { LEVELS, type LevelEntry } from "../content/levels";
import type { Level } from "../core/level";
import { createWorld } from "../core/world";
import { button, h } from "./dom";
import { bestText } from "./format";
import { Renderer } from "./render";
import type { Progress } from "./store";

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

/** A still, blurred drawing of a level, for backgrounds and thumbnails. */
export function levelPicture(level: Level, w: number, h: number, cls: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.className = cls;
  c.setAttribute("aria-hidden", "true");
  const r = new Renderer(c);
  r.setLevel(level);
  r.resize(w, h, Math.min(2, devicePixelRatio || 1));
  r.fit(null);
  // Cover rather than fit, so there are no bars around the lot.
  const [W, H] = level.size;
  r.camera.scale = Math.max(w / W, h / H);
  r.camera.cx = W / 2;
  r.camera.cy = H / 2;
  const world = createWorld(level, "standard");
  const pose = { x: world.cart.body.x, y: world.cart.body.y, a: world.cart.body.a };
  r.draw(world, {
    alpha: 1,
    prevCart: pose,
    prevLoose: world.loose ? { x: world.loose.x, y: world.loose.y, a: world.loose.a } : null,
    time: 0,
    showYou: false,
    zoom: 0,
    zoomAt: null,
    labels: { you: "", returnHere: "" },
    reducedMotion: true,
  });
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
  const bg = levelPicture(LEVELS[2]!.level, innerWidth, innerHeight, "backdrop");
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
  const bg = levelPicture(LEVELS[2]!.level, innerWidth, innerHeight, "backdrop");
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
    const spec = CARTS[id];
    const unlocked = spec.unlockAfter <= p.finished;
    const name = t(L, `carts.${id}`);
    const b = h(
      "button",
      {
        type: "button",
        role: "radio",
        "aria-checked": p.cart === id ? "true" : "false",
        "aria-disabled": unlocked ? undefined : "true",
        class: `cart-choice${p.cart === id ? " on" : ""}${unlocked ? "" : " locked"}`,
        title: unlocked
          ? t(L, `carts.${id}Fault`)
          : t(L, "levelsScreen.cartLocked", { n: spec.unlockAfter }),
      },
      h("span", { class: "cart-name" }, name),
      h(
        "span",
        { class: "cart-fault" },
        unlocked
          ? t(L, `carts.${id}Fault`)
          : t(L, "levelsScreen.cartLocked", { n: spec.unlockAfter }),
      ),
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
      h("h2", {}, t(L, `carts.${p.cart}`)),
      h("p", {}, t(L, "levelsScreen.cartBody")),
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
