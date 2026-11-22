# CLAUDE.md — Park the Cart (Estacione o Carrinho)

Browser game in **TypeScript (strict) + Vite**, drawn in 3D with hand-written WebGL 2. Client only, played from a link. Sibling of `../cartorio-simulator` and `../um-buraco-so` (same scaffold and habits: data-driven content, logic separate from views, tests for everything). Design: `GAME_PLAN.md`. Ordered task list: `ROADMAP.md`. Things only the developer can do: `TODO_FOR_YOU.md`. Original pitch: `ESTACIONE_O_CARRINHO.md`. Art references: the design canvas and `/designs`.

Repo: https://github.com/allbdev/park-the-cart (remote `origin`, branch `main`).

## Security audit before every push (strict)

- **Run the `security-audit` skill on the changes being pushed before every `git push`.** No exceptions: not for small fixes, docs-only changes or a push the developer asked for in a hurry.
- Fix every finding, or get the developer to explicitly accept it, before pushing. Mention the audit result in your message when you push.
- If the audit can't run, don't push; say why.
- Replay links and anything else read from the URL are untrusted input: length caps, strict parsing, never `innerHTML`.

## Design canvas (two-way sync, strict)

The mockups live on the claude.ai design canvas **"Estacione o Carrinho — Mockups"**: https://claude.ai/artifact/1saXC69MKJ1wjoqMoXJwCa (pages: Screens, Screens (English), Mobile, Carts & hazards, Art direction, 3D look (new)). `designs/*.jpg` are exports of its boards; `designs/README.md` maps each board to its file.

The game, the docs and the canvas must always agree:

- **Game → canvas.** Any change to something a board shows (layout, colours, fonts, copy, HUD, the receipt, level names, carts and their faults, hazards and prices, the share string, phone layouts) updates that board in the same task, and its JPG in `designs/`. A task isn't done until both match.
- **Canvas → game.** The developer edits boards by hand. Before starting any UI or content task, re-read the boards it touches (Artifact `read`), and bring every difference into the code, the content files and `GAME_PLAN.md`. If a canvas change conflicts with the plan, ask.
- **Docs too.** `GAME_PLAN.md` §5–§10 (controls, the cart, hazards, levels, result, look and tokens) describe the same things as the boards; keep them in step.
- **New looks are tried on the canvas first**, on a new page, then built in the game.
- **Boards show the real game:** the screen boards (pages "Screens" in PT-BR and "Screens (English)", and both phone boards) are captures from the game. After any visible change: `npm run build && npm run preview`, then `npm run designs` (writes `design-captures/`, git-ignored); convert to JPG (`sips -s format jpeg -s formatOptions 82 --resampleWidth 1920`), copy into `designs/` (PT-BR) and `designs/en/`, upload them as canvas assets and point each board's `<img>` at its new `/_blob/` id. The text boards (Carts, Hazards, Art direction) are edited by hand on the canvas.
- If Claude can't regenerate a JPG export itself, list the stale files in `TODO_FOR_YOU.md`.

## Language rules (strict)

| What | Language |
|---|---|
| Code: identifiers, file/folder names, CSS classes, content keys, test names | **English** |
| Code comments, docstrings, commit messages, PR descriptions | **English** |
| Docs (`*.md`, including this file) | **English** |
| **Player-facing text** (UI, HUD, receipt lines, level and cart names, car names, share string, `<title>`/meta) | **English (default) and Brazilian Portuguese (PT-BR)**, both complete |

- There is **one small translation layer** with exactly two locales: `en` (default) and `pt-BR`. Don't add a third locale or an i18n library without asking.
- Player-facing strings live in locale content files (`src/content/locales/en.ts`, `src/content/locales/pt-BR.ts`), never inline in UI or logic code. Keys stay in English.
- Both locales have the same keys; a test fails on any missing or extra key and on slot mismatches (`{price}` present in one locale but not the other).
- English copy is **written**, not machine-translated. The joke must land in English on its own ("Not valid while bumpers last", "Please don't come again").
- Money is always shown in **reais** (R$) in both locales; only the number format changes (`R$ 3.480,00` in PT-BR, `R$ 3,480.00` in English). Damage is stored as integer **centavos** in the core, never floats.
- The locale changes words and number formatting only. It never changes the simulation, the score or a replay.
- The language toggle is on the landing screen and in the pause menu; the choice is remembered in `localStorage` (try/catch, works without it).
- Example: `const label = t("receipt.thanks")` is fine. `const label = "Obrigado pela preferência"` is not.

## Testing rules

- **Every feature ships with tests.** A roadmap task isn't done until its tests are written and passing.
- Frameworks: **Vitest** (unit), **fast-check** (property-based), **Playwright** (one end-to-end smoke test, the cross-browser replay test, and later the board captures).
- Tests go in `tests/`, mirroring `src/` (`src/core/cart.ts` → `tests/core/cart.test.ts`). The e2e tests are in `tests/e2e/`.
- Cover the logic: RNG, the deterministic math (`src/core/math.ts` pinned outputs), the cart model (pull side, stick phases, hold, surfaces, fields), collisions (no tunnelling, separation, impulses), car zones and the per-zone billing cooldown, hazards on the tick (door triggers, reversing cars, gusts), parking detection, scoring (centavos, damage then time), the receipt lines, the share string, the replay codec, level validation, locale completeness, and edge cases (corrupt `localStorage`, malformed replay links, a cart spawning against a wall, zero input for a whole level).
- **Determinism is a test, not a hope:** `simulate(level, cart, inputs)` run twice gives bit-identical state; a replay encoded and decoded gives the same run (property test over random input logs).
- **Every level has a par run** (`par.inputs` in its JSON). A test replays it and checks the cart parks with R$ 0 within par time. If a cart-model change breaks a par run, re-record it with `npm run record-par` and say so in the commit.
- **Physics properties** (fast-check): no tunnelling through any obstacle at top speed, the cart never leaves the lot, kinetic energy never grows without input or a field, separation after every collision.
- UI gets tests too: what's rendered for a given state, focus order, labels on every button. Test the state, not the pixels.
- Keep game logic out of UI code so it can be tested without a DOM or a canvas.
- Bug fixes start with a failing test that reproduces the bug (usually a level + input log).
- Run the full check before every commit, and don't commit when it fails:
  ```sh
  npm run check && git commit ...
  ```
  (`npm run check` = lint + typecheck + unit tests + build + bundle-size budget.)

## Git workflow

- **Before every push, run the `security-audit` skill** (see the section at the top).
- Commit or push only when asked. Never push with failing checks.
- Small, logical commits (one feature or chore each).
- Large binary assets (`.png`, `.jpg`, `.webp`, `.woff2`, `.ogg`, `.wav`) go through Git LFS (see `.gitattributes`); CI checks out with `lfs: true`.

## Code conventions

- TypeScript `strict: true`, no `any` (use `unknown` and narrow). ESLint + Prettier, enforced in CI.
- `camelCase` for variables and functions, `PascalCase` for types and classes, `CONSTANT_CASE` for module constants, `kebab-case` for file names.
- Content is data: levels (JSON, generated by `tools/make-levels.ts`), carts, car models and prices, hazards and their prices, receipt lines and tips are typed data under `src/content/`, not hardcoded in logic. Adding a level means adding a JSON file, its par run, and its name in both locales.
- No runtime dependencies without asking (no physics engine, no schema library). Dev dependencies are fine when they serve the stack above.
- In `src/core`: no `Math.random()`, no `Date.now()` / `new Date()` / `performance.now()`, and no `Math.sin`/`cos`/`tan`/`atan2`/`exp`/`pow`/`hypot` (use `src/core/math.ts`). An ESLint rule enforces it.
- Money is integer centavos. Physics is floats in SI units (metres, seconds, kilograms, radians).

## Architecture notes

- **Layout.** `src/core` is pure logic (no DOM, no canvas, no globals). `src/content` is data and locale strings. `src/ui` draws state and turns keys and touches into inputs; it never owns game rules. `src/main.ts` wires them.
- **Determinism.** A run is `simulate(level, cart, inputs) → state`, advanced in fixed ticks (120 per second, first guess). Inputs are sampled once per tick and quantised. The renderer interpolates between the last two states and never feeds anything back.
- **Cross-browser floats.** Only exactly-rounded operations (`+ - * /`, `Math.sqrt`, `Math.abs`, `Math.floor`, `Math.min`/`max`) plus our own trig/exp. That is what makes a replay link recorded in Safari play the same in Chrome; the Playwright replay test runs in Chromium, Firefox and WebKit.
- **The cart model** (`GAME_PLAN.md` §6): rigid body, four wheels, a bad caster with seeded stick phases; per-cart numbers in `src/content/carts.ts`. `?debug=1` shows wheel forces and a tuning panel (never linked from the UI).
- **Collisions.** Oriented boxes and circles, separating axes, impulses. Cars are static with priced zones; cones and the abandoned cart are light dynamic bodies.
- **Damage.** A hit above the speed threshold on a car zone adds one receipt line; the same car + zone can't bill again for 1 second. Receipt lines are built in `src/core` (car, zone, price in centavos, tick) and localised at the edge.
- **Levels** are JSON in `src/content/levels/`, validated at load by a hand-written validator, each with a par run and a card limit (`limit`, centavos: more damage than that fails the run). The ten levels are generated by `npm run make-levels` from the specs in `tools/make-levels.ts`; change difficulty there, not in the JSON, which it overwrites. They are meant to be brutal: the only bar is that the bot parks each with R$ 0.
- **Carts unlock in a chain:** all ten levels finished with one cart opens the next (`cartBefore`, `cartUnlocked`; the tally is `Progress.done`, per cart). `make-levels` only keeps a level the bot can park with every cart that gates another, and writes those runs to `tests/content/cart-pars.json`, which a test replays.
- **Things that move.** Traffic cars (`traffic` hazards) are placed from the tick alone and bill the player once per pass. Abandoned carts (any number) roll with slope and wind; what one hits is billed only after the player has pushed it.
- **Rendering.** The lot is 3D on hand-written WebGL 2 (`src/ui/render3d.ts`, helpers in `src/ui/gl/`): meshes generated by code from the same specs the collisions use (`gl/models.ts`), the painted asphalt as the ground texture (`art.ts`), one sun with a shadow map, a camera south of the lot looking down at an angle. No 3D library. Wide screens frame about 80% of the lot and slide with the cart; phone portrait follows the cart; a hit drops the camera in for half a second. Where WebGL 2 is missing, `createRenderer` returns the flat Canvas 2D renderer (`render.ts`); both implement `LotRenderer`. Keep the maths, camera and models free of GL and DOM so they stay unit-tested. One hidden renderer draws every still (thumbnails, backdrops): browsers allow only a few GPU contexts, so screens must `dispose()` theirs. HUD, receipt, menus and buttons are DOM.
- **Replays.** Run-length-encoded inputs in the URL fragment with a format version, the level and the cart. Untrusted: length cap, strict parse, polite failure.
- **Accessibility.** Menus, receipt and result are keyboard and screen-reader friendly; text contrast 4.5:1; colour never carries meaning alone (every state has a word or a price); `prefers-reduced-motion` disables the hit zoom and tag pops. The driving itself needs fine control; say so honestly rather than pretend otherwise.
- **Storage.** `localStorage` only, for per-player conveniences (best per level, unlocked levels and carts, language, settings), always in try/catch. No accounts, no server, no personal data.
- **Sharing.** The share string is built in `src/core` from the result and localised at the edge. Copy to clipboard with a visible fallback.
- **Test hooks.** `?test=1` exposes `window.__cart` with `play(inputs)`, `paused` and `&speed=N`; `?level=` picks a level; `&gfx=flat` forces the flat fallback renderer. Used by the e2e tests and the board capture; never linked from the UI.
- **Performance budget.** First load under 200 KB gzipped JS+CSS (fonts and art aside), first level's art under 600 KB, interactive in under 2 s on a mid-range phone over 4G, 60 fps on that phone. No per-frame allocations in the simulation step or the render loop.

## Workflow

- Work through `ROADMAP.md` in order. Mark tasks `[~]` when started and `[x]` when done and tested.
- Don't add scope that isn't in the roadmap without asking first.
- Keep `TODO_FOR_YOU.md` current: anything that needs the developer (decisions, art, accounts, domain, playtests) goes there, newest at the top of each section.
- Keep the design canvas, `designs/` and `GAME_PLAN.md` in sync with the game (see the section near the top).
