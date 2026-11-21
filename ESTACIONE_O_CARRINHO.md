# Estacione o Carrinho (Park the Cart)

**Author:** Vinícius Albuquerque Barros · **Written:** 18 Nov 2026 · **Status:** plan only, nothing built

Free, open-source, played from a link. A portfolio piece: the code is part of the product. Effort figures are estimates, not measurements.

**Pitch:** a shopping cart with one bad wheel, a crowded car park, and a cart corral that is always further than it looks.

## The loop
1. Top-down view. You push the cart; the bad wheel drags it to one side.
2. Get it into the corral without scratching the cars.
3. Result: time and a repair bill. "R$ 3.480 de prejuízo em 41 segundos."
4. Ten short levels, plus one daily level.

## Scope
**First version**
- The cart: a rigid body with one caster that sticks and pulls.
- 10 hand-made levels: parked cars, speed bumps, a slope, wind.
- Touch and keyboard controls.
- Result card.

**Later**
- Replays: record inputs, share a link that replays your run.
- A daily level and a ghost of your best run.
- A level format in JSON and a tiny editor.

## Architecture
- **Physics:** a 2D library (Matter.js, or Rapier compiled to WebAssembly) or a small hand-written model of the cart. The hand-written model is more work and a better story.
- **Fixed time step**, so a recorded list of inputs replays exactly.
- **Levels as data.**

## What it shows
- Physics modelling and "feel" tuning.
- Deterministic replay from inputs.
- Touch input done properly.

## Risks
| Risk | Mitigation |
|---|---|
| The cart feels bad, not funny-bad | Tune the one mechanic before making levels |
| Touch controls | Design for the phone first |
| Least engineering depth of the three | Replays and the hand-written physics model add it |

**Effort (estimate):** about 1 weekend for the first version. The smallest of the three.

## Look

A drone photo of a supermarket car park with the supermarket's own flyer laid over it: top-down, worn paint and oil stains on the asphalt, long shadows through the cart's wire mesh. The interface is yellow price tags with red prices, and the result screen is a till receipt itemising the damage. Nobody is in the picture, only the cart and what it hits. Mockups are in the design canvas "Estacione o Carrinho — Mockups" and in `designs/`. The mockups add ideas that are not in the scope above yet: five carts with different faults, a hazard price list, a rain level. All names, prices and lines are first drafts.

## Stack and conventions

Shared with the other two browser games; see `README.md`.

| Decision | Proposal | Why |
|---|---|---|
| Language | TypeScript, strict | Your day-to-day stack; readable to recruiters |
| Build | Vite | Fast, zero-config static output |
| Rendering | Canvas 2D (PixiJS only if a game needs it) | Small bundle, loads instantly on a phone |
| Tests | Vitest for logic, Playwright for one end-to-end smoke test | Same habit as the Godot repo: logic separate from drawing, and tested |
| CI | GitHub Actions: lint, test, build, deploy on push | Shows the pipeline, not only the game |
| Hosting | Any static host; the shared hole also needs a small real-time backend | No store, no review queue |
| Repo | Public, MIT, with a README that explains the architecture and the interesting problem | The README is what a recruiter reads |
| Session | 2 to 5 minutes, works on a phone, no login | It is opened from a link |
| Sharing | A result you can paste (text or image) | That is how these spread |
| Text | English by default, PT-BR toggle | Different from Dig to Japan: the audience includes recruiters abroad. Your call |
| Money | None. No ads, no accounts, no personal data stored | Keeps it simple and outside any compliance work |

One scaffold (Vite + TS + tests + CI + deploy) is built once and reused for the other two.

## What already exists

A quick search on 18 Nov 2026, not exhaustive.

Shopping-cart games are mostly racing and stunts (*Grocery Kart*, *Shopping Cart Hero*), and there are many car-parking games. I did not find one about parking a cart with a bad wheel.

Sources:
- https://www.seeles.ai/games/racing/grocery-kart-shopping-cart-drifting-game
- https://www.seeles.ai/games/action/shopping-cart-hero
