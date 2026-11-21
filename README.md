# Park the Cart (Estacione o Carrinho)

> *Three wheels work. The fourth is free.* A free browser game: push a shopping cart with one bad wheel across a crowded supermarket car park and into the corral, without scratching the cars. Every scratch goes on the receipt.

**Play: https://allbdev.github.io/park-the-cart/** · Ten levels, a daily level that's the same for everyone, five carts, replays you can share as a link. Desktop and phone, English and Portuguese.

**Status:** built and playable end to end. What's left is playtesting and tuning (see `ROADMAP.md`).

Player-facing text is English by default, with a Brazilian Portuguese toggle. Code, comments and docs are in English.

| Doc | What's in it |
|---|---|
| [`GAME_PLAN.md`](GAME_PLAN.md) | Design, the cart model, hazards and prices, levels, look, architecture, risks |
| [`ROADMAP.md`](ROADMAP.md) | Ordered task list and current progress |
| [`CLAUDE.md`](CLAUDE.md) | Project rules (language, testing, git workflow, design sync, architecture) |
| [`TODO_FOR_YOU.md`](TODO_FOR_YOU.md) | Open decisions and things only the developer can do |
| [`ESTACIONE_O_CARRINHO.md`](ESTACIONE_O_CARRINHO.md) | The original one-page pitch |
| [`designs/`](designs) | The design canvas boards: screens captured from the game (PT-BR, and `en/`), plus carts, hazards and art direction |
| [`marketing/`](marketing) | Press kit and launch posts |

## How it plays

1. Push the cart. The bad wheel drags it to one side.
2. Steer against the pull. Hold the cart back on the slope and in the rain. Mind the door that opens as you pass and the car that backs out without looking. Don't touch the manager's car.
3. Get it into the corral.
4. The receipt: *"R$ 3.480 de prejuízo em 41 segundos."* Less damage wins; time breaks ties. Again for a cleaner one, or the next level.

## The interesting problem

The game is a pure function of the level, the cart and the player's inputs: `simulate(level, cart, inputs) → world`.

### A hand-written cart model

No physics engine. The cart is a rigid body on four wheels (`src/core/cart.ts`, about 200 lines):

- **Fixed rear wheels** cancel sideways slip with an impulse each tick, capped by friction. That's why a cart goes where it points.
- **Front casters** swivel and barely grip, except the **faulty one**: it alternates *stuck* and *rolling* phases drawn from the level's seed. Stuck, it points off the heading and grips a little, which yaws the cart; rolling, it just drags.
- **Steering** is a sideways force at the front axle, so the cart pivots around its rear wheels like a real one. **Holding** is heavy rolling drag. **Rain** cuts sideways grip and braking.
- The five carts are the same model with different numbers (`src/content/carts.ts`).

Nobody can "feel" a slider in a test suite, so the feel is pinned with measurements instead: the standard cart drifts about 10° per second to the right at full push, full steering beats the pull, it tops out near 2.3 m/s, coasts about 2 m, stops in a third of that when held, and slides more than 1.5× as far in the rain. A property test checks that no cart ever gains energy without input.

### Deterministic across browsers

A replay link is just the inputs, so the same inputs must give the same run in every browser. A fixed 120 Hz step and inputs quantised to 1/16 take care of most of it. The subtle part is floating point: `+ - * /` and `Math.sqrt` are exactly rounded by IEEE 754 in every engine, but `Math.sin`, `Math.cos` and `Math.atan2` are not specified to the last bit and do differ between V8, SpiderMonkey and JavaScriptCore. So the core has its own trig (`src/core/math.ts`), built only from exactly rounded operations, and an ESLint rule bans the others (and `Math.random`, `Date`, `performance`) in `src/core`.

An end-to-end test plays a messy 40-second run on *Horário de Pico* (reversing cars, doors, wind, a loose cart, a lot of crashing) in Chromium, Firefox and WebKit and checks the final state is **bit-identical** to Node's.

### Every level proven finishable

A parking bot (`src/core/bot.ts`) plans a path with A* on a 25 cm grid around everything that can bill (cars inflated by the cart's size, open doors, the lane a car will back into, cones), string-pulls it, and drives the real simulation with a steering and speed controller. Whatever it presses is a valid input log.

- Each hand-made level ships with a **par run** recorded by the bot (`npm run record-par`). CI replays all ten: if a change to the cart model makes any level impossible, the build fails. Bot pars range from 16 to 30 seconds; people take roughly twice as long.
- The **daily level** is generated from the date. The bot must park it with R$ 0 within 45 seconds, or the generator re-rolls, so every day is finishable by construction.

`npm run daily-report -- 2000` over 2,000 consecutive days:

| | p10 | median | p90 | max |
|---|---|---|---|---|
| Bot par time | 16.3 s | 20.6 s | 25.0 s | 38.1 s |
| Generator attempts | 1 | 1 | 1 | 3 |

No day fell back to the plain lot. Hazard mix: cones 65% of days, doors 63%, reversing cars 58%, speed bumps 49%, an abandoned cart 37%, the manager's car 28%, rain 19%, wind 17%, a slope 12%.

### Replaying a bug

The result screen has *Watch replay* and *Copy replay link*. A link is `#r=v1.<level>.<cart>.<data>`, where data is the run-length-encoded inputs as varints in base64url. Keyboard input changes rarely, so a minute of play is usually well under a kilobyte; the bot's analogue par runs, which change every tick, are 2 to 5 KB. Links are untrusted input: length and tick caps, strict parsing, fuzzed with fast-check. A bug report is a replay link.

### The art is code

There are no image files. The car park is drawn procedurally on Canvas 2D (`src/ui/art.ts`): worn asphalt with patches, oil stains and cracks, nibbled stall paint, the hatched corral, cars, wire carts whose shadows fall through the mesh, cones, rain and puddles. Sprites are drawn once per scale into offscreen canvases. First load is about 45 KB of gzipped JS and CSS, plus fonts.

## Requirements

- **Node.js 22 LTS** and npm
- **Git LFS** (the design JPGs are stored in LFS)

```sh
brew install node git-lfs && git lfs install
git clone https://github.com/allbdev/park-the-cart.git && cd park-the-cart
npm install
```

## Running

```sh
npm run dev          # local dev server
npm run build        # static build in dist/
npm run preview      # serve the build (port 4183)
```

| Keyboard | Touch | Action |
|---|---|---|
| **W** / **↑** | Stick forward | Push |
| **A D** / **← →** | Stick left / right | Turn |
| **S** / **↓** | Stick back | Pull back |
| **Space** (hold) | **Hold** button | Hold the cart |
| **R** | Restart | Restart the level |
| **Esc** | Pause button | Pause |

Dev and test URL parameters (not offered in the UI): `?level=03-speed-bump` (or `?level=daily`) opens a level; `?test=1` exposes `window.__cart` and allows `&speed=N`, `&date=YYYY-MM-DD` (never saved) and `&site=public` (share the public address).

## Tests and tools

```sh
npm run check         # lint + typecheck + unit tests + build + size budget (run before every commit)
npm test              # Vitest: unit, property tests, par runs, 300 daily levels
npm run e2e           # Playwright: full runs, keyboard-only flow, replays (Chromium, Firefox, WebKit, phone)
npm run record-par    # re-record the levels' par runs with the bot
npm run daily-report  # daily-level statistics over many days
npm run designs       # capture the design-canvas screen boards from the game (needs npm run preview)
```

GitHub Actions runs `check` and the e2e tests on every push and pull request, and deploys `main` to GitHub Pages.

## Project layout

```
src/
  core/        Pure game logic: RNG, deterministic math, bodies and collisions, the cart model,
               the world (hazards, damage, parking), results, replay codec, level validator,
               parking bot, daily generator. No DOM.
  content/     Carts, cars and prices, levels/*.json, and locales/en.ts + locales/pt-BR.ts.
  ui/          Procedural art and renderer, input, play / replay / result / menu screens, storage.
  main.ts      Wiring.
tests/         Vitest tests mirroring src/, plus e2e/ (Playwright).
tools/         Size check, par recorder, daily report, design-board capture.
designs/       The design canvas boards (reference only, not used in the game).
marketing/     Press kit and posts.
```

## Contributing workflow

1. Pick the next task in `ROADMAP.md`.
2. Write the feature together with its tests, keeping logic in `src/core/`.
3. If it changes something a design board shows, update the board (see `CLAUDE.md`).
4. Run `npm run check` and make sure it passes.
5. Commit. Before every push, run the `security-audit` skill on the changes (see `CLAUDE.md`).

## License

MIT. Fonts: Anton, Barlow Semi Condensed, Cutive Mono and IBM Plex Mono, all under the SIL Open Font License, self-hosted.
