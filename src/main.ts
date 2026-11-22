import "@fontsource/anton/latin-400.css";
import "@fontsource/anton/latin-ext-400.css";
import "@fontsource/barlow-semi-condensed/latin-400.css";
import "@fontsource/barlow-semi-condensed/latin-600.css";
import "@fontsource/barlow-semi-condensed/latin-700.css";
import "@fontsource/barlow-semi-condensed/latin-ext-400.css";
import "@fontsource/barlow-semi-condensed/latin-ext-600.css";
import "@fontsource/cutive-mono/latin-400.css";
import "@fontsource/cutive-mono/latin-ext-400.css";
import "./styles.css";
import receiptAUrl from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-300-normal.woff2?url";
import { App } from "./ui/app";
import { forceFlat } from "./ui/render3d";
import type { Input } from "./core/cart";

addEventListener("hashchange", () => {
  if (location.hash.startsWith("#r=")) location.reload();
});

const PUBLIC_URL = "https://park-the-cart.vinicius-albuquerque.com.br/";
const params = new URLSearchParams(location.search);
const test = params.get("test") === "1";
const speed = test ? Math.min(20, Math.max(1, Number(params.get("speed") ?? 1) || 1)) : 1;

// Cutive Mono's capital Ã puts its tilde over the next letter ("NAÕ"). Patch that one glyph
// with IBM Plex Mono Light; unicode-range means it only downloads when an Ã is on screen.
try {
  document.fonts.add(new FontFace("Receipt A", `url(${receiptAUrl})`, { unicodeRange: "U+00C3" }));
} catch {
  // Old browsers: the tilde is just misplaced.
}

// Test-only: the flat fallback renderer, so the browser tests can cover it.
if (test && params.get("gfx") === "flat") forceFlat();

async function boot() {
  // The lot paints its words with Anton; wait for the fonts (but not forever).
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  const app = new App({
    root: document.getElementById("app")!,
    // Test-only: the design boards show the public address instead of localhost. Only this fixed
    // address, never a value from the URL: a link must not choose what players share.
    url: test && params.get("site") === "public" ? PUBLIC_URL : location.origin + location.pathname,
    speed,
    levelParam: params.get("level"),
    dateParam: test ? params.get("date") : null,
    replayParam: location.hash.startsWith("#r=") ? location.hash.slice(3) : null,
  });
  app.start();
  if (test) {
    (window as unknown as { __cart: unknown }).__cart = {
      app,
      playInputs: (inputs: Input[]) => app.play?.playInputs(inputs),
      playPar: () => app.play?.playPar(),
      world: () => app.play?.getWorld(),
      replayEnd: () => {
        const w = app.replay?.finalWorld();
        return (
          w && {
            x: w.cart.body.x,
            y: w.cart.body.y,
            a: w.cart.body.a,
            tick: w.tick,
            damage: w.damage,
          }
        );
      },
    };
  }
}

void boot();
