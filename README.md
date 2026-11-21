# Park the Cart (Estacione o Carrinho)

> *Three good wheels. The fourth one is a free gift.* A free browser game: push a shopping cart with one bad wheel across a crowded supermarket car park and into the corral, without scratching the cars. Every scratch goes on the receipt.

**Status:** plan only, nothing built yet. Next: Phase 0 in `ROADMAP.md`.

Player-facing text is English by default, with a Brazilian Portuguese toggle. Code, comments and docs are in English.

| Doc | What's in it |
|---|---|
| [`GAME_PLAN.md`](GAME_PLAN.md) | Design, the cart model, hazards and prices, levels, look, architecture, risks |
| [`ROADMAP.md`](ROADMAP.md) | Ordered task list and current progress |
| [`CLAUDE.md`](CLAUDE.md) | Project rules (language, testing, git workflow, design sync, architecture) |
| [`TODO_FOR_YOU.md`](TODO_FOR_YOU.md) | Open decisions and things only the developer can do |
| [`ESTACIONE_O_CARRINHO.md`](ESTACIONE_O_CARRINHO.md) | The original one-page pitch |
| [`designs/`](designs) | Exports of the design canvas boards: screens, phone layouts, carts, hazards, art direction |

## How it plays

1. Push the cart. The bad wheel drags it to one side.
2. Steer against the pull. Hold the cart back on the slope and in the rain. Mind the door that opens as you pass and the car that reverses without looking.
3. Get it into the corral.
4. The receipt: *"R$ 3.480 de prejuízo em 41 segundos."* Again for a cleaner one, or the next level.

Ten levels of about a minute each. Later: replays you can share as a link, five carts with different faults, and a daily level that is the same for everyone.

## The interesting problem

The game is a pure function of the level, the cart and the player's inputs.

- **A hand-written cart model.** No physics engine: a small rigid body with four wheels and one caster that sticks and pulls, tuned for "funny-bad". Small enough to read in one sitting.
- **Deterministic across browsers.** A fixed time step, quantised inputs, and our own trig and exp functions (engines may round `Math.sin` differently in the last bit), so a replay recorded in Safari plays the same in Chrome. CI checks it in three engines.
- **Levels proven finishable.** Every level ships with a recorded par run that CI replays; a change to the cart model that breaks a level fails the build.

## Requirements

- **Node.js 22 LTS** and npm
- **Git LFS** (images and fonts are stored in LFS)

```sh
brew install node git-lfs && git lfs install
npm install
```

## Running

Once Phase 0 is done:

```sh
npm run dev          # local dev server
npm run build        # static build in dist/
npm run preview      # serve the build
```

| Keyboard | Touch | Action |
|---|---|---|
| **W** / **↑** | Stick forward | Push |
| **A D** / **← →** | Stick left / right | Turn |
| **S** / **↓** | Stick back | Pull back |
| **Space** (hold) | **SEGURAR** (hold) | Hold the cart |
| **R** | Restart | Restart the level |
| **Esc** | Back | Pause |

Dev and test URL parameters (not offered in the UI): `?level=03-speed-bump` opens a level, `?debug=1` shows wheel forces and the tuning panel, `?test=1` exposes `window.__cart` and allows `&speed=N`.

## Tests and tools

```sh
npm run check        # lint + typecheck + unit tests + build + size (run before every commit)
npm test             # Vitest (unit + property tests, including par runs)
npm run e2e          # Playwright smoke test and cross-browser replay test
npm run record-par   # record a level's par run in the sandbox
npm run designs      # capture the design-canvas screen boards from the game
```

GitHub Actions runs `check` and the e2e tests on every push and pull request, and deploys `main`.

## Project layout

```
src/
  core/        Pure game logic: RNG, deterministic math, cart model, collisions,
               hazards, damage, scoring, replay codec, daily generator. No DOM.
  content/     Carts, cars and prices, hazards, levels/*.json (typed data),
               and locales/en.ts + locales/pt-BR.ts.
  ui/          Canvas lot, DOM HUD / receipt / menus, input (keys, stick), app loop, storage.
  main.ts      Wiring.
tests/         Vitest tests mirroring src/, plus e2e/ (Playwright).
tools/         Size check, par-run recorder, design-board capture.
designs/       Mockups (reference only, not used in the game).
```

## Contributing workflow

1. Pick the next task in `ROADMAP.md`.
2. Write the feature together with its tests, keeping logic in `src/core/`.
3. If it changes something a design board shows, update the board (see `CLAUDE.md`).
4. Run `npm run check` and make sure it passes.
5. Commit. Before every push, run the `security-audit` skill on the changes (see `CLAUDE.md`).

## License

MIT.
