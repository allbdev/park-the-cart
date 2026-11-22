# Park the Cart — Game Plan

> *Estacione o Carrinho.* Three good wheels. The fourth one is a free gift.
> A free, open-source browser game, played from a link. A portfolio piece: the code is part of the product.

**Author:** Vinícius Albuquerque Barros · **Written:** 18 Nov 2026 · **Updated:** 20 Nov 2026 · **Status:** first and second versions built (ten levels, replays, five carts, daily level); playtests next

The original one-page pitch is `ESTACIONE_O_CARRINHO.md`. Mockups live on the design canvas "Estacione o Carrinho — Mockups" (https://claude.ai/artifact/1saXC69MKJ1wjoqMoXJwCa) and as JPG exports in `designs/`. The canvas and this file are kept in sync both ways (see `CLAUDE.md`). All names, prices and lines are first drafts. Effort figures are estimates, not measurements.

---

## 1. Pitch

A shopping cart with one bad wheel, a crowded car park, and a cart corral that is always further than it looks. Every scratch goes on the receipt.

## 2. Decisions so far

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Concept | Seen from above: push a cart with a sticky caster into the corral without scratching the cars | Cart games are racing and stunts; car-parking games are cars. I found none about parking a cart with a bad wheel |
| D2 | Platform | Browser, client only, played from a link; phone first | No store, no review queue, no login |
| D3 | Stack | TypeScript strict, Vite, WebGL 2 (hand-written, no library) with a Canvas 2D fallback, Vitest + fast-check, Playwright smoke, GitHub Actions | Same scaffold as `../cartorio-simulator` and `../um-buraco-so`; see §12 |
| D4 | Physics | **A small hand-written cart model**, not Matter.js or Rapier (decided 20 Nov 2026) | The cart *is* the game; a model we own is easier to tune, deterministic across browsers, tiny, and a better story in the README |
| D5 | Determinism | Fixed time step; a run is `simulate(level, cart, inputs)` | Replays are an input list; bug reports are a level plus an input log |
| D6 | Text | **English by default, PT-BR toggle** | Same as the sibling games: the audience includes recruiters abroad |
| D7 | Session | Levels of about a minute; 2 to 5 minutes a sitting | It is opened from a link |
| D8 | Money | None. No ads, no accounts, no personal data stored. Carts unlock by playing; nothing is sold | Keeps it outside any compliance work |
| D9 | Look | A drone photo of a supermarket car park with the supermarket's flyer laid over it (see §10) | Different from the other three games |
| D10 | Repo | Public, MIT | The README is what a recruiter reads |

Open decisions are in `TODO_FOR_YOU.md`.

## 3. The loop

1. A car park seen from above and a little to the south, in 3D. You push the cart; the bad wheel drags it to one side.
2. Steer against the pull, hold the cart back on slopes and in the rain, dodge doors that open and cars that reverse.
3. Get it into the corral ("DEVOLVA AQUI"). The level ends when the cart is parked: inside the corral and nearly still.
4. Result: a till receipt itemising the damage, the total, and the time. *"R$ 3.480 de prejuízo em 41 segundos."*
5. Again for a cleaner receipt, or the next level.

**Score:** damage (R$) first, time second. Less damage always wins; time breaks ties. "Sem arranhar ninguém" (no scratches) is its own badge per level.

## 4. Scope

**First version**
- The cart: a rigid body with one caster that sticks and pulls (§6). Tuned before any level is made.
- 10 hand-made levels (§8), as data.
- Hazards and the price list (§7).
- Keyboard and touch controls; phone portrait with a camera that follows the cart.
- Result receipt, best per level, share string.

**Second version (from the mockups, in the roadmap after the first version)**
- Replays: the input list in a link; the replay viewer shows the path and where each line of the receipt happened.
- Five carts with different faults (§6.3), unlocked in a chain: finish all ten levels with one cart to get the next.
- The daily level: generated from the date, the same for everyone; the first try counts, the rest are practice.

**Later**
- A ghost of your best run.
- A tiny level editor on top of the JSON format.
- Share as an image.

## 5. Controls

| Keyboard | Touch (phone on its side) | Action |
|---|---|---|
| **Arrows** / **WASD** | Push the stick that way | Go that way on the screen |
| **Space** (hold) | **SEGURAR** button (hold) | Hold the cart: strong braking |
| **R** | RECOMEÇAR button | Restart the level |
| **Esc** | Pause button | Pause / back to levels |

- **You point, the cart turns** (22 Nov 2026, asked for by the developer). Up means up the screen whichever way the cart faces; two keys make a diagonal. The input layer turns the cart towards that direction and pushes once it's roughly lined up; pointing behind the cart pulls it backwards instead of turning it round. This replaced the classic scheme (up pushes, left and right twist the cart), where left and right swap whenever the cart faces down the screen.
- **The bad wheel is still the player's problem.** The self-steering is loose on purpose (`POINT_GAIN` in `src/ui/input.ts`): a tight one would cancel the pull by itself. Holding a direction, the cart settles a few degrees off it, on the side its wheel drags to, and the player aims a little the other way.
- **Classic steering is a setting** in the pause menu ("Classic steering: left and right turn the cart"), remembered with the rest of the progress.
- The simulation doesn't know which scheme is in use: either way it receives a push and a turn, so replays and par runs are unaffected.
- Touch: the stick appears wherever the left thumb lands; a big hold button sits under the right. Targets at least 48 px. The stick is analogue; the keyboard sends full strength.
- Inputs are sampled once per simulation tick and quantised (stick to 1/16 steps), so a replay stores exactly what the simulation saw.
- Remappable keys are not in the first version.

## 6. The cart

### 6.1 The model

A 2D rigid body: position, heading, velocity, angular velocity, mass, moment of inertia. Four wheels at fixed points on the body.

- **Rear wheels** are fixed: strong sideways grip, little rolling resistance. They are why a cart goes where it points.
- **Front casters** swivel and add little sideways grip, except the **bad caster**: it sticks at an angle and pulls, adding a yaw torque that grows with speed, plus extra drag on its side.
- **Sticking:** the bad caster alternates between "rolling" and "stuck" phases. Phase lengths come from the level's seeded RNG, so they are the same on every replay.
- **Push** is a force along the heading at the handle; **turn** is a torque; **hold** is high friction on all wheels.
- **Surfaces** change friction and grip: dry asphalt, wet asphalt (rain), painted lines (slightly slippery), speed bumps.
- **Fields** add forces: a slope pulls the cart downhill; wind pushes it sideways in gusts.

The model has a handful of numbers per cart (mass, pull strength and side, stick phase lengths, drag, turn rate, grip). They live in `src/content/carts.ts`, and a debug panel (`?debug=1`) shows the wheel forces and lets you tune them live. **The feel is tuned before levels are built** (roadmap Phase 1 exit).

### 6.2 Collisions

- The cart is an oriented box. Obstacles are oriented boxes or circles. Collision by separating axes, response by impulses with restitution and friction.
- At the top speed and the fixed step, the cart moves less than a quarter of its width per tick, so it never tunnels; a property test checks this.
- **Cars are static, with priced zones:** each car has zones (doors, mirrors, front and rear bumpers). A hit above a small speed threshold adds one receipt line for that car and zone. The same zone on the same car can't bill again for 1 second, so a long scrape is one line, not sixty.
- **Dynamic props** (cones, the abandoned cart) are light rigid bodies the cart can push.

### 6.3 The five carts (second version)

Each cart is the same model with different numbers, so the same level plays differently. They unlock in a chain (22 Nov 2026, asked for by the developer): finish all ten levels with one cart to open the next, so the whole game is played again with each cart. Levels stay open once reached; the tally of finished levels is kept per cart (level select shows "7 of 10 levels finished with this cart" and marks each level done with it). The bot proves every level with every cart that gates another (Standard, Rusty, Basket, Kiddie); the Wholesale cart is the last and gates nothing, and the bot can't finish four levels with it. (Canvas board "The carts".)

| Cart | Fault | Unlocks |
|---|---|---|
| Padrão (Standard) | Front right wheel bent. Pulls right | Free |
| Enferrujado (Rusty) | Two wheels seize and let go: it lurches, stalls and yaws | All ten levels with the Standard |
| Cestinha (Basket) | Light and nervous. Turns with the wind | All ten levels with the Rusty |
| Infantil (Kiddie) | Long, with a toy car on the front. Won't turn | All ten levels with the Basket |
| Atacarejo (Wholesale) | Heavy. Seconds to get moving, twice the Standard's top speed, metres to stop | All ten levels with the Kiddie |

## 7. Hazards and the price list

What can go wrong in a level and what it costs on the receipt. Prices are placeholders to tune. A level is a list of these with positions. (Canvas board "Hazards and price list".)

Door scratches, mirrors and bumpers bill once per car and part per second (a long scrape is one line). A car backing out bills only when it hits the player's cart. Prices in the code are integer centavos (`src/content/cars.ts`).

| Hazard | What it does | Price |
|---|---|---|
| Lombada (speed bump) | The cart jumps and changes direction | R$ 0 |
| Cone | Knocked over, keeps going. On the receipt | R$ 34 each |
| Carrinho abandonado (abandoned cart) | Several per level from level 4. They roll with the slope and the wind on their own, for free; once you've pushed one, what it hits is on your receipt | R$ 0 (what it hits is billed) |
| Carro passando (traffic) | Drives through the aisle, leaves, comes round again. Doesn't brake. From level 6 | R$ 3.900 per pass |
| Porta abrindo (door opening) | Opens when you pass beside it | R$ 1.840 |
| Carro saindo de ré (car reversing) | Doesn't look. Never looks | R$ 2.600 |
| Ladeira (slope) | The cart rolls by itself | R$ 0 |
| Vento (wind) | Pushes sideways, in gusts. The HUD has a wind gauge (an arrow for the direction, a bar that fills with the gust, and the word "calm" or "gust!"), and streaks sweep across the lot the way it blows, longer and faster in a gust | R$ 0 |
| Chuva (rain) | Less friction: it doesn't stop where you stopped | R$ 0 |
| Carro do gerente (manager's car) | Black, in his own space. Touch it and it's over | Level failed |
| Limite do cartão (card limit) | Every level has one. The receipt goes over it and the run ends: "cartão recusado" | Level failed |

**Car damage** (first draft): door scratch R$ 1.840, mirror R$ 620, bumper R$ 918. Each line names the car: "sedã prata", "SUV preto", "picape vermelha". Car models, colours and prices are content (`src/content/cars.ts`), with names in both locales.

**The card limit is what makes the game hard** (22 Nov 2026, asked for by the developer: "near impossible, but possible"). Before it, any run that reached the corral passed, however expensive. Now each level allows less damage than the one before: R$ 4.000 on level 1 (two doors), R$ 1.000 on level 7 (one mirror or one bumper, never a door), R$ 100 on level 10 (two cones). A hit from traffic is over every limit.

Hazards with timing (door, reversing car, traffic, wind gusts) run on the simulation tick, never on wall time. Where a traffic car is depends only on the tick. A door opens when the cart enters its trigger zone; a reversing car starts at a fixed tick or on a trigger. Both are the same on every replay.

## 8. The levels

Ten levels, each about a minute, unlocked in order, and meant to be brutal. They are generated: `tools/make-levels.ts` holds a spec per level (how full the lot is, how many doors, cones, carts and reversing cars, the wind, the traffic lanes, the card limit) and draws the level from a seed. Every level ships with a **par run**: an input log that parks the cart with R$ 0, recorded by the parking bot (a grid planner plus a steering controller driving the real simulation; in traffic it also picks where to cross the lane and how long to wait first). If the bot can't park a draw in 55 seconds the generator tries the next seed, so a level can be as nasty as its spec asks and is still possible by construction. A test replays every par run, so any change to the cart model that breaks a level fails CI. To tune difficulty, edit a spec and run `npm run make-levels`. (Canvas board "Level select": "Ofertas da semana".)

| # | Name (PT-BR) | English (draft) | Introduces |
|---|---|---|---|
| 1 | Vaga do Idoso | Seniors' Space | Push and the pull; cones; limit R$ 4.000 |
| 2 | Domingo de Manhã | Sunday Morning | Turning, out of a stall and across the lot; a speed bump; limit R$ 3.000 |
| 3 | Lombada | Speed Bump | Two speed bumps, ten cones; limit R$ 2.500 |
| 4 | Carrinho Abandonado | Abandoned Cart | Three abandoned carts, a door; limit R$ 2.000 |
| 5 | Ladeira | The Slope | A steep slope with carts rolling down it; limit R$ 1.900 |
| 6 | Vento | Wind | Strong gusts, and the first traffic; limit R$ 1.500 |
| 7 | Chuva | Rain | Wet asphalt, traffic, a speed bump; limit R$ 1.000 |
| 8 | Black Friday | Black Friday | A full lot, five doors (one beside your own stall), faster traffic; limit R$ 900 |
| 9 | Carro do Gerente | The Manager's Car | The manager's cars either side of the corral; limit R$ 700 |
| 10 | Horário de Pico | Rush Hour | Rain, wind, two cars in the lane, reversing cars, the manager; limit R$ 100 |

**Level format** (JSON in `src/content/levels/`, validated when loaded). Stalls come in rows, and cars are placed by stall, so a level reads like a car-park plan:

```jsonc
{
  "id": "03-speed-bump",
  "size": [32, 18],                       // metres; x right, y down
  "seed": 3,                              // the caster's stick phases, gusts, bump kicks
  "spawn": { "x": 4.3, "y": 15.2, "heading": -1.5708 },
  "corral": { "row": 0, "stall": 9 },     // a stall with rails on three sides
  "surface": "dry",                       // dry | wet
  "rows": [{ "x": 0.4, "y": 0, "stalls": 12, "opens": "down" },
           { "x": 0.4, "y": 12.4, "stalls": 12, "opens": "up" }],   // stalls 2.6 x 5.6 m
  "cars": [{ "row": 0, "stall": 2, "model": "suv", "colour": "black",
             "door": "right", "reverse": { "near": 5, "distance": 3 } }],
  "hazards": [{ "type": "speedBump", "x": 13, "y": 5.6, "w": 0.9, "h": 6.8 },
              { "type": "cone", "x": 8.6, "y": 14 }],   // also cart, island, slope, wind, traffic
  "limit": 250000,                        // the card limit, in centavos
  "paint": [{ "type": "text", "text": "IDOSO", "x": 8.2, "y": 2.6 }],
  "par": { "cart": "standard", "inputs": "…" }          // recorded by npm run record-par
}
```

The validator is hand-written (no schema library without asking) and rejects unknown types, overlaps between cars, a spawn inside an obstacle, and a corral the cart can't fit into.

**The daily level:** generated from the date (player's local midnight) by a seeded generator out of the same pieces: corral, spawn, cars, doors, reversing cars, the manager's car, cones, bumps, an abandoned cart, rain, wind or a slope. The parking bot must park it with R$ 0 within 45 s, or the generator re-rolls. Over 2,000 consecutive days (`npm run daily-report`) no day needed more than 3 attempts and none fell back to the plain lot; the bot's median is 20.6 s. Tests check 300 consecutive days and random dates on every run. The first try of the day counts; the rest are practice.

## 9. Result, replays and sharing

- **Receipt** (board 5): "SUPERMERCADO TRÊS RODAS · CUPOM NÃO FISCAL DE PREJUÍZO", one numbered line per hit with the car underneath, cones grouped ("3 UN x 34,00"), the total, time and level, and "OBRIGADO PELA PREFERÊNCIA / NÃO VOLTE SEMPRE".
- During play, the HUD shows level, time and the running damage, and an open receipt grows in the corner (board 4).
- **A hit** (board 4): a price tag pops ("RISCO NA PORTA · SEDÃ PRATA · + R$ 1.840,00") and the camera zooms in for half a second. The clock doesn't stop.
- Next to the receipt: your best for this level (damage · time) and the no-scratch badge.
- **Share string** (draft): `Park the Cart · level 3` / `R$ 3,480 of damage in 41 seconds` / the game URL. PT-BR: `Estacione o Carrinho · fase 3` / `R$ 3.480 de prejuízo em 41 segundos`. Numbers are formatted per locale; the run is the same.
- **Replays (second version):** the input log is run-length encoded, versioned, and put in the URL fragment with the level and the cart (`#r=<version>.<level>.<cart>.<inputs>`). Opening the link runs the simulation again and draws it. The viewer (board 8) has a scrubber with a red mark for each receipt line, the cart's path, and "COPIAR LINK DO REPLAY". *"The replay is just the list of keys: the game runs it again, the same."*
- A replay link is untrusted input: parsed with a length cap and strict validation; a bad link shows a message, never an error. The version number lets old links fail politely after a cart-model change.

## 10. Look

A drone photo of a supermarket car park with the supermarket's own flyer (encarte) laid over it. (Canvas page "Art direction".)

- **From above, in 3D, with real light:** the camera stands south of the lot and looks down at an angle, so cars have sides and roofs. A low sun throws long shadows towards the camera, also through the cart's wire mesh. Worn paint, oil stains, patched asphalt.
- **The interface is the flyer:** yellow price tags with red prices, tilted a degree or two. The result is a till receipt.
- **Money is the score.** Every number on screen is a price.
- **Nobody is in the picture.** No drivers, no shoppers: just the cart and what it hits.
- Against the other three: Dig to Japan is round cartoon, Um Buraco Só is dark glass on a photo, Cartório is paper and green signage. This one is loud retail yellow and red, and the only one in 3D.
- Play screens stay sharp. Blur only on the landing and how-to backdrops. On a hit the camera drops towards the cart for half a second (off with reduced motion).
- Red and yellow never carry meaning alone: every state also has a word or a price.

**Tokens**

| Token | Value | Use |
|---|---|---|
| tag | `#ffd400` | Price tags, secondary buttons, highlights |
| price | `#d21c18` | Prices, primary buttons, the level-select background |
| asphalt | `#141516` | HUD panels, dark buttons |
| receipt | `#fdfcf6` | The receipt, cards |

| Font | Use |
|---|---|
| Anton | Titles and prices ("R$ 3.480") |
| Barlow Semi Condensed | Interface |
| Cutive Mono | The receipt and the share string |

All three are OFL and are self-hosted in the build (no runtime calls to Google Fonts).

**Art.** Everything is built by code (decided 20 Nov 2026: Claude makes the art), and since 22 Nov 2026 in 3D, like the mockups. The models are meshes generated at load (`src/ui/gl/models.ts`): four car bodies and the manager's car lofted from cross-sections, with glass cabins, wheels, lamps and mirrors; the five carts with wire panels, frames, handles and groceries; cones, the corral's rails and sign, speed bumps, kerbs, pavement and hedges. The asphalt is still the painted texture (worn lines, stains, patches, puddles), laid on the ground. One sun with a shadow map lights it all; car paint and glass pick up a little sky. Sizes come from the same specs the collisions use, so what you see is what you hit. Rain is an overcast light, a glossy wet ground and falling streaks. Where WebGL 2 isn't available the game falls back to the flat top-down sprites it shipped with (`?test=1&gfx=flat` shows them).

**Phones** (22 Nov 2026, after the developer played on one: upright "sucks", sideways works but the HUD was in the way). The game is played with the phone on its side. Held upright, the play screen shows a card asking to turn it, and the game waits; a "play upright anyway" button is the way out for phones with rotation locked. On its side there are under 300 px of height, so the HUD is one thin strip (time, damage and limit, wind), the level name and the cart's fault aren't repeated, the tip fades after five seconds, and the stick isn't fixed in a corner any more: it appears wherever the left thumb lands, so it never sits on top of the cart. The pause menu lies down to fit, and the result puts the receipt and the price tag side by side.

**Camera.** Wide screens: the camera frames about 80% of the lot and slides with the cart, so the lot's edge comes into view as the cart nears it. Portrait phones: it follows the cart closely. In both, a hit pulls it down and in for half a second.

**Screens on the canvas:** 1 Landing · 2 How to play · 3 Playing · 4 A scratch · 5 Result: the receipt · 6 Level select · 7 Rain level · 8 Replay · Phone layouts (portrait, one thumb to steer and one to hold, the camera follows the cart; result and level select stacked) · The carts · Hazards and price list · Art direction.

## 11. Architecture

- **Pure simulation core.** `src/core` holds the cart model, collisions, hazards, damage, scoring and the replay codec: no DOM, no canvas, no globals, no `Math.random()`, no clock.
- **Fixed time step:** 120 ticks per second (first guess; the rule is "no tunnelling at top speed"). The render loop interpolates between the last two states.
- **Deterministic across browsers:** JavaScript numbers are IEEE doubles, and `+ - * / sqrt` are exactly rounded everywhere, but `Math.sin`, `Math.cos`, `Math.atan2`, `Math.exp` and `Math.pow` may differ in the last bit between engines. The core uses its own trig and exp (`src/core/math.ts`), so a replay recorded in Safari plays the same in Chrome. A test pins known outputs.
- **Seeded RNG** (small, fast) for the caster's stick phases, gusts and the daily generator.
- **Levels and carts are data**, validated at load.
- **Rendering** is WebGL 2 for the lot (3D, written by hand: no engine), with a Canvas 2D fallback; the HUD, receipt, menus and buttons are DOM (real `<button>`s, readable text, focusable).
- **Client only.** No server.

## 12. Stack and conventions

Shared with `../cartorio-simulator` and `../um-buraco-so`: one scaffold (Vite + TS + tests + CI + deploy), reused.

| Decision | Choice | Why |
|---|---|---|
| Language | TypeScript, strict | Day-to-day stack; readable to recruiters |
| Build | Vite | Fast, zero-config static output |
| Rendering | Hand-written WebGL 2 for the lot (Canvas 2D fallback); DOM for HUD, receipt and menus | 3D without a 3D library: the whole game is still under 60 KB gzipped |
| Physics | Hand-written (D4) | Deterministic, tunable, tiny |
| Tests | Vitest for logic, fast-check for property tests, Playwright for one end-to-end smoke test | Logic separate from drawing, and tested |
| CI | GitHub Actions: lint, typecheck, test, build, deploy on push | Shows the pipeline, not only the game |
| Hosting | Any static host (GitHub Pages by default) | No store, no review queue |
| Repo | Public, MIT, README explains the architecture and the interesting problem | The README is what a recruiter reads |
| Session | Levels of about a minute, works on a phone, no login | It is opened from a link |
| Sharing | A result you can paste; a replay link | That is how these spread |
| Text | English default, PT-BR toggle | D6 |
| Money | None. No ads, no accounts, no personal data stored | D8 |

## 13. What it shows

- Physics modelling and "feel" tuning, with a model small enough to read.
- Deterministic replay from inputs, across browsers, with the floating-point detail handled.
- Touch input done properly: analogue stick, hold button, phone portrait first.
- Levels proven finishable by committed par runs that CI replays.

## 14. Risks

| Risk | Mitigation |
|---|---|
| The cart feels bad, not funny-bad | Tune the one mechanic before making levels; a debug panel; the Phase 1 kill test |
| Touch controls | Design for the phone first; test on a real mid-range phone in Phase 2 |
| Replays drift between browsers | Own trig/exp in the core; fixed step; quantised inputs; a cross-engine test in CI (Chromium, Firefox, WebKit) |
| Tuning the cart breaks old levels and replays | Par runs replayed in CI; replay links carry a version |
| Art takes longer than code | The art is code; the flat renderer remains as a fallback where WebGL 2 is missing |
| Least engineering depth of the browser games | The hand-written model, cross-browser determinism and replays add it |

**Effort (estimate):** about 1 weekend for the first version with shapes, plus the art. The second version (replays, carts, daily level) another weekend. (Built in one long session on 20–21 Nov 2026.)

## 15. What already exists

A quick search on 18 Nov 2026, not exhaustive.

Shopping-cart games are mostly racing and stunts (*Grocery Kart*, *Shopping Cart Hero*), and there are many car-parking games. I did not find one about parking a cart with a bad wheel.

Sources:
- https://www.seeles.ai/games/racing/grocery-kart-shopping-cart-drifting-game
- https://www.seeles.ai/games/action/shopping-cart-hero
