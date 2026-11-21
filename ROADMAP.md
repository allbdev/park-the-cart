# Roadmap — Park the Cart

> Tasks **in order**. Work top to bottom; move to the next phase only when the current phase's exit criteria are met.
> **The risky thing gets proven first:** that pushing the cart feels funny-bad, not just bad. One cart, one empty lot, a tuning panel, and a kill test before any level is built. Then a vertical slice, then the ten levels, then replays, carts and the daily level.
> Design details live in `GAME_PLAN.md`. Mockups on the design canvas and in `/designs`. Project rules in `CLAUDE.md`. Things only the developer can do in `TODO_FOR_YOU.md`.

**Language rule:** player-facing text in **English (default) and PT-BR**, both complete, through the two-locale content files. Code, comments and docs in English.

**Design rule:** any task that changes what a board shows also updates the board and its `designs/` JPG (see `CLAUDE.md`).

**Definition of done:** a task is `[x]` only when it's implemented **and covered by passing tests** (see `CLAUDE.md`).

**Target (from `GAME_PLAN.md`):** levels of about a minute. The first version is about a weekend with shapes, plus the art. Every number below is a first guess.

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 · Setup

1. [x] `git init`, public GitHub repo, MIT `LICENSE`, Git LFS (`.gitattributes` already lists the binary types) (`origin` = https://github.com/allbdev/park-the-cart.git)
2. [x] Vite + TypeScript strict scaffold (copy the setup from `../cartorio-simulator`); `src/core`, `src/content`, `src/ui`, `tests/`, `public/`, `tools/`
3. [x] ESLint + Prettier, with a rule banning `Math.random`, `Date`, `performance.now` and non-deterministic `Math` functions in `src/core`; `npm run check` (lint + typecheck + unit tests + build + size)
4. [x] Vitest + fast-check, first test; Playwright with a "page loads" smoke test (Chromium, Firefox, WebKit)
5. [x] GitHub Actions: `check` + e2e on every push/PR; deploy `main` to GitHub Pages
6. [x] Fonts self-hosted (Anton, Barlow Semi Condensed, Cutive Mono; OFL, full PT-BR accents) and the colour tokens from `GAME_PLAN.md` §10 as CSS custom properties
7. [x] Locale layer: `t(key, slots)`, `en` default + `pt-BR`, toggle remembered in `localStorage`; money formatting from centavos per locale; test that both locales have the same keys and slots
8. [x] `tools/size-check.ts` (`npm run size`): bundle budget from `CLAUDE.md`, part of `check`

**Exit:** the empty page builds, deploys, and CI is green.

---

## Phase 1 · Core: the cart (the risky part)

> Pure logic in `src/core`, tested without a DOM, plus the thinnest possible view to feel it.

9. [x] Seeded RNG + tests for repeatability and distribution
10. [x] Deterministic math (`src/core/math.ts`): sin, cos, atan2, exp; pinned-output tests; accuracy tests against `Math` within a tolerance
11. [x] Vector and oriented-box helpers; fixed-step loop (120 ticks/s) with an accumulator; input sampling and quantisation
12. [x] The cart model: rigid body, four wheels, rear grip, swivel casters, the bad caster (pull torque, drag, seeded stick phases), push / turn / pull back / hold; tests for each (pulls to its side, holds stop it, zero input coasts to a stop)
13. [x] Surfaces (dry, wet; painted lines dropped: too subtle to feel) and fields (slope, wind gusts on the tick)
14. [x] Collisions: oriented boxes and circles, separating axes, impulse response; property tests: no tunnelling at top speed, separation after contact, energy never grows without input
15. [x] `simulate(level, cart, inputs)`: the whole run as a pure function; determinism test (twice → bit-identical state)
16. [x] Sandbox view: playing any level with `?level=<id>`; the cart was tuned with measured handling numbers (pull rate, steering, top speed, coasting, holding) that the cart tests pin (the live `?debug=1` panel was dropped: nobody here can feel a slider)
17. [x] Tune the Padrão cart; numbers into `src/content/carts.ts`

**Exit (kill test, in `TODO_FOR_YOU.md`):** the developer pushes the cart around the empty lot for five minutes and laughs at least once. Steering against the pull is a skill, not a fight. If not, retune before going on.

---

## Phase 2 · Vertical slice: level 3 "Lombada", start to receipt

> One full level with real stakes. Re-read the screen boards before starting each screen (see `CLAUDE.md`).

18. [x] Level format, types and the hand-written validator (unknown types, overlaps, spawn inside an obstacle, corral too small); tests with good and bad levels
19. [x] Cars with priced zones (door, mirror, bumpers); hit threshold; the per-zone 1-second billing cooldown; damage in centavos
20. [x] Hazards for this level: speed bump, cones (dynamic, priced per unit)
21. [x] Parking detection (inside the corral, nearly still, for half a second); the manager's-car fail state
22. [x] Scoring and result: receipt lines (car, zone, price, tick), cones grouped, total, time; best per level ranked by damage then time; no-scratch badge
23. [x] Playing (board 3): Canvas 2D lot with shapes, HUD (level, time, damage tag), the "bad wheel" panel, control hint, restart
24. [x] A scratch (board 4): price tag pop, half-second zoom, the open receipt in the corner; `prefers-reduced-motion` respected
25. [x] Result (board 5): the receipt, total tag, best, no-scratch badge, again / next / share; share string localised at the edge
26. [x] Level 3 as JSON with its par run, and the par-run test; `tools/record-par.ts` (`npm run record-par`) to record one in the sandbox
27. [x] Touch controls: analogue stick + hold button, portrait camera that follows the cart (board "Phone layouts"); a real-phone check is in `TODO_FOR_YOU.md`

**Exit (in `TODO_FOR_YOU.md`):** the developer plays level 3 ten times, on desktop and on a phone, and wants a cleaner receipt each time.

---

## Phase 3 · First version complete

28. [x] Remaining hazards: abandoned cart, door opening (trigger zone), car reversing (on a tick or trigger), slope, wind, rain; tests for each on the tick
29. [x] The other 9 levels as JSON (`GAME_PLAN.md` §8), each with its par run; levels unlock in order
30. [x] Car models and colours (`src/content/cars.ts`), names in both locales; receipt lines name the car
31. [x] Landing (board 1): title tags, "offer of the day" tag, play, language toggle (the "Daily level" button stays hidden until Phase 4)
32. [x] How to play (board 2): push, compensate, return
33. [x] Level select (board 6): ten cards with name and best, locked cards say "finish the previous one"
34. [x] Phone layouts (board "Phone layouts"): result and level select stacked; HUD fits portrait
35. [x] Progress saved in `localStorage` (best per level, unlocked levels, language), corrupt-storage tests
36. [~] Keyboard and screen-reader pass on every menu and the receipt; focus order tests
37. [~] Performance budget check (bundle size, 60 fps and load on a mid-range phone) (`npm run size` in `check` and CI: 38 KB gzipped of 200 KB; a real phone check is in `TODO_FOR_YOU.md`)

**Exit:** the first version from `GAME_PLAN.md` §4 is playable end to end on desktop and phone, in both languages, with shapes (art may still be pending).

---

## Phase 4 · Second version: replays, carts, daily level

38. [x] Replay codec: run-length encoding, format version, level and cart, URL fragment; property test (encode → decode → same run); malformed-link tests with a length cap
39. [ ] Replay viewer (board 8): playback, scrubber with a red mark per receipt line, the cart's path, copy replay link
40. [ ] Cross-browser replay test: the same input log in Chromium, Firefox and WebKit ends in a bit-identical state
41. [ ] The five carts (board "The carts"): Enferrujado, Cestinha, Infantil, Atacarejo tuned in the sandbox; unlock at levels 3, 5, 7, 9; change cart at the corral; every par run still passes with Padrão
42. [ ] Rain level look (board 7): wet tint, reflections, drops
43. [ ] Daily level generator: lot layout, corral and hazards from the date's seed (rollover rule in `TODO_FOR_YOU.md`)
44. [ ] Parking bot: grid planner with the cart's turning radius + steering controller; parks generated levels with R$ 0
45. [ ] Property tests: for 10,000 days the daily level is valid and the bot parks it within the time bound, or the generator re-rolls; failing days become fixed regression tests
46. [ ] Daily level on the landing and level select: first try counts, the rest are practice; today's result saved

---

## Phase 5 · Art

> Claude makes the art (decided 20 Nov 2026): drawn procedurally in Canvas 2D, pre-rendered once into offscreen sprites, so it costs no download.

47. [x] Procedural sprites: asphalt with worn paint, stains and patches; cars by model and colour; carts (wire mesh with shadow); cones, corral with sign, abandoned cart, speed bump; baked shadows
48. [x] Lot composition from level data into a cached background layer; markings, "IDOSO" and "CARRINHOS" paint, arrows
49. [x] Landing and how-to backgrounds: the lot drawn and blurred (the only blurred screens)

---

## Phase 6 · Design sync tooling

50. [ ] `tools/designs/`: Playwright captures every screen board from the real game (fixed level, fixed input log, fixed tick) at board size
51. [ ] Upload the captures to the canvas and replace the drawn screen mockups; refresh `designs/` JPGs
52. [ ] English versions of the screen boards on the canvas (English is the default locale)

---

## Phase 7 · Launch

53. [ ] README: architecture write-up, the cart model, cross-browser determinism, par runs, how to replay a bug
54. [ ] Open Graph image and meta tags for link previews, in both locales
55. [ ] Playtests: 5 people, including at least 2 on phones and 2 English speakers
56. [ ] Tune the cart, prices and levels from playtests
57. [ ] Domain and production deploy (decision in `TODO_FOR_YOU.md`) (GitHub Pages by default)
58. [ ] Press kit and launch posts (`marketing/`), with a replay link of a spectacular run

---

## Later (not in the first or second version)

- A ghost of your best run
- A tiny level editor on top of the JSON format
- Share as an image
- The 3D close-up for hits (board 4's art target)
