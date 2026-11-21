/**
 * Captures every screen board of the design canvas from the real game, so the mockups match it.
 * Needs a running build: `npm run build && npm run preview`, then in another terminal
 * `npm run designs [-- --url=http://localhost:4183 --out=design-captures]`.
 * Writes PNGs per locale (en/, pt-BR/) named after the canvas boards, plus og.png. Convert them
 * to JPG, copy into designs/ (PT-BR) and designs/en/, and upload them to the canvas
 * (see CLAUDE.md and designs/README.md).
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { drive } from "../../src/core/bot";
import type { Input } from "../../src/core/cart";
import type { Level } from "../../src/core/level";
import { decodeInputs, encodeReplay } from "../../src/core/replay";
import { simulate } from "../../src/core/world";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const URL_BASE = arg("url", "http://localhost:4183");
const OUT = arg("out", "design-captures");
const LOCALES = ["pt-BR", "en"] as const;
type Locale = (typeof LOCALES)[number];

const level = (id: string) => JSON.parse(readFileSync(`src/content/levels/${id}.json`, "utf8")) as Level;
const L3 = level("03-speed-bump");

/** A run on level 3 that scrapes a few cars and still parks: a person, then the bot. */
function messyRun(): Input[] {
  for (let k = 0; k < 40; k++) {
    const prefix: Input[] = [];
    for (let i = 0; i < 260 + k * 10; i++)
      prefix.push({ push: 1, turn: i < 70 ? 1 : i < 200 ? -0.6 + k * 0.02 : 0.8, hold: false });
    const run = drive(L3, "standard", { margin: 0.5, cruise: 1.4, timeout: 90 }, prefix);
    if (run && run.world.status === "parked" && run.world.receipt.length >= 2) return run.inputs;
  }
  throw new Error("no messy run found");
}

const progress = (locale: Locale, extra: object = {}) =>
  JSON.stringify({
    locale,
    finished: 4,
    cart: "standard",
    best: {
      "01-seniors-space": { level: "01-seniors-space", cart: "standard", parked: true, damage: 0, ticks: 19 * 120, lines: 0 },
      "02-sunday-morning": { level: "02-sunday-morning", cart: "standard", parked: true, damage: 0, ticks: 24 * 120, lines: 0 },
      "03-speed-bump": { level: "03-speed-bump", cart: "standard", parked: true, damage: 62000, ticks: 38 * 120, lines: 1 },
    },
    ...extra,
  });

async function open(
  browser: Browser,
  locale: Locale,
  query: string,
  opts: { viewport?: { width: number; height: number }; mobile?: boolean; hash?: string; store?: string } = {},
): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    isMobile: opts.mobile ?? false,
    hasTouch: opts.mobile ?? false,
  });
  await ctx.addInitScript((s) => localStorage.setItem("park-the-cart.v1", s), opts.store ?? progress(locale));
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/?test=1&date=2026-11-20&site=public${query}${opts.hash ?? ""}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return page;
}

type Hooks = { __cart: { playInputs(i: Input[]): void; app: { play: { setPaused(p: boolean): void } | null } } };

const play = (page: Page, inputs: Input[]) =>
  page.evaluate((i) => (window as unknown as Hooks).__cart.playInputs(i), inputs);

async function shot(page: Page, locale: Locale, name: string, wait = 400) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(OUT, locale, `${name}.png`) });
}

async function screens(browser: Browser, locale: Locale, messy: Input[]) {
  let page = await open(browser, locale, "", { store: JSON.stringify({ locale }) });
  await shot(page, locale, "Main");
  await page.getByTestId("play").click();
  await shot(page, locale, "HowTo");
  await page.context().close();

  // Playing: level 3, a few seconds in, the cart heading for the bump.
  const par = decodeInputs(L3.par!.inputs)!;
  page = await open(browser, locale, "&level=03-speed-bump");
  await shot(page, locale, "PlayStart");
  await play(page, par.slice(0, 5 * 120));
  await page.evaluate(() => (window as unknown as Hooks).__cart.app.play?.setPaused(true));
  await shot(page, locale, "Play");
  await page.context().close();

  // A scratch: stop right after the first receipt line.
  const firstHit = simulateUntilHit(messy);
  page = await open(browser, locale, "&level=03-speed-bump");
  await play(page, messy.slice(0, firstHit + 1));
  await page.evaluate(() => (window as unknown as Hooks).__cart.app.play?.setPaused(true));
  await shot(page, locale, "Scratch", 260);
  await page.context().close();

  // The receipt.
  page = await open(browser, locale, "&level=03-speed-bump");
  await play(page, messy);
  await page.waitForSelector("[data-testid=result-tag]");
  await shot(page, locale, "Result", 600);
  await page.context().close();

  page = await open(browser, locale, "");
  await page.getByTestId("play").click();
  await shot(page, locale, "Levels");
  await page.context().close();

  // Rain: a few seconds into level 7.
  const rain = level("07-rain");
  page = await open(browser, locale, "&level=07-rain");
  await play(page, decodeInputs(rain.par!.inputs)!.slice(0, 4 * 120));
  await page.evaluate(() => (window as unknown as Hooks).__cart.app.play?.setPaused(true));
  await shot(page, locale, "Rain");
  await page.context().close();

  // Replay of the messy run, near the end.
  page = await open(browser, locale, "", { hash: `#r=${encodeReplay({ level: L3.id, cart: "standard", inputs: messy })}` });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const r = document.querySelector<HTMLInputElement>(".scrub")!;
    r.value = String(Math.round(Number(r.max) * 0.62));
    r.dispatchEvent(new Event("input"));
    document.querySelector<HTMLButtonElement>(".play-toggle")!.click();
  });
  await shot(page, locale, "Replay");
  await page.context().close();
}

function simulateUntilHit(inputs: Input[]): number {
  for (let n = 1; n < inputs.length; n++) {
    if (simulate(L3, "standard", inputs.slice(0, n)).receipt.length > 0) return n;
  }
  return inputs.length - 1;
}

async function phones(browser: Browser, locale: Locale, messy: Input[]) {
  const vp = { width: 390, height: 844 };
  let page = await open(browser, locale, "&level=03-speed-bump", { viewport: vp, mobile: true });
  await play(page, decodeInputs(L3.par!.inputs)!.slice(0, 3 * 120));
  await page.evaluate(() => (window as unknown as Hooks).__cart.app.play?.setPaused(true));
  await shot(page, locale, "phone-play");
  await page.context().close();
  page = await open(browser, locale, "&level=03-speed-bump", { viewport: vp, mobile: true });
  await play(page, messy);
  await page.waitForSelector("[data-testid=result-tag]");
  await shot(page, locale, "phone-result", 600);
  await page.context().close();
  page = await open(browser, locale, "", { viewport: vp, mobile: true });
  await page.getByTestId("play").click();
  await shot(page, locale, "phone-levels");
  await page.context().close();

  const board = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  const img = (f: string) => `data:image/png;base64,${readFileSync(join(OUT, locale, f)).toString("base64")}`;
  const title = locale === "en" ? "On the phone" : "No celular";
  const sub =
    locale === "en"
      ? "Portrait, one thumb to steer and one to hold. The camera follows the cart instead of showing the whole lot."
      : "Retrato, um polegar pra virar e outro pra segurar. A câmera segue o carrinho em vez de mostrar o estacionamento inteiro.";
  await board.setContent(`<body style="margin:0;background:#232527;color:#fff;font-family:'Barlow Semi Condensed',sans-serif;height:1000px;box-sizing:border-box;padding:40px 60px">
    <div style="display:flex;align-items:baseline;gap:24px;margin-bottom:28px"><b style="font:400 46px Anton,Impact,sans-serif;text-transform:uppercase;white-space:nowrap">${title}</b><span style="font-size:20px">${sub}</span></div>
    <div style="display:flex;gap:60px;justify-content:center">
    ${["phone-play.png", "phone-result.png", "phone-levels.png"].map((f) => `<img src="${img(f)}" style="width:370px;height:800px;object-fit:cover;object-position:top;border:9px solid #0e0f10;border-radius:34px;box-shadow:0 14px 34px rgba(0,0,0,.4)">`).join("")}
    </div></body>`);
  await board.waitForTimeout(300);
  await board.screenshot({ path: join(OUT, locale, "Mobile.png") });
  await board.close();
}

const browser = await chromium.launch();
const messy = messyRun();
for (const locale of LOCALES) {
  mkdirSync(join(OUT, locale), { recursive: true });
  await screens(browser, locale, messy);
  await phones(browser, locale, messy);
  console.log(`${locale}: done`);
}
// The link-preview image (Open Graph), from the English landing page.
{
  const page = await open(browser, "en", "", { viewport: { width: 1200, height: 630 }, store: JSON.stringify({ locale: "en" }) });
  await page.addStyleTag({ content: ".lang, .footer { display: none !important; }" });
  await page.screenshot({ path: join(OUT, "og.png") });
  await page.context().close();
}
await browser.close();
