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
import { App } from "./ui/app";
import type { Input } from "./core/cart";

addEventListener("hashchange", () => {
  if (location.hash.startsWith("#r=")) location.reload();
});

const params = new URLSearchParams(location.search);
const test = params.get("test") === "1";
const speed = test ? Math.min(20, Math.max(1, Number(params.get("speed") ?? 1) || 1)) : 1;

async function boot() {
  // The lot paints its words with Anton; wait for the fonts (but not forever).
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  const app = new App({
    root: document.getElementById("app")!,
    url: location.origin + location.pathname,
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
