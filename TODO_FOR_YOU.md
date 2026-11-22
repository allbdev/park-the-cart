# What I need from you

> Things only you can do (decisions, art, accounts, people). Claude keeps this list current while working; newest items at the top of each section.
> Last updated: 22 Nov 2026. The game is built and live at https://park-the-cart.vinicius-albuquerque.com.br/: ten levels, the daily level, five carts, replays, both languages, desktop and phone, with the art drawn in code. What's left needs you: playing it, the playtests and launch.

## To do now

- [ ] **Phone check** and **playtests with other people**: see "Playtesting" below. These are the only checks left.
- [x] ~~**Look at the new 3D look.**~~ Approved on 22 Nov 2026 ("much better now"; all art signed off). The screen boards on the canvas and `designs/*.jpg` now show the 3D game.
- [x] ~~**Try the hard levels.**~~ Played on 22 Nov 2026: looks OK. Each level is still one spec in `tools/make-levels.ts` if one turns out unfair.
- [x] ~~**Play it.**~~ Played on 22 Nov 2026. It led to the retuned Wholesale and Rusty carts, the wind gauge, the reverse steering fix and the cart unlock chain.
- [x] ~~**Look at the canvas.**~~ Signed off with the art on 22 Nov 2026.
- [x] ~~**Press kit contact.**~~ alb.develloper@gmail.com, in `marketing/press_kit.md` (22 Nov 2026). The repo is public, so the address is too.

## Decisions (quick)

All taken on 20 Nov 2026 ("you're the boss"). Tell me to reopen any.

- [x] ~~**Physics.**~~ A small hand-written cart model (`GAME_PLAN.md` D4), no library.
- [x] ~~**Repo name and owner.**~~ https://github.com/allbdev/park-the-cart. (Roadmap task 1)
- [x] ~~**English title.**~~ "Park the Cart" in English, "Estacione o Carrinho" in PT-BR.
- [x] ~~**Score order.**~~ Damage first, time breaks ties.
- [x] ~~**Scope of the mockup extras.**~~ Replays, five carts and the daily level are built as the second version (roadmap Phase 4).
- [x] ~~**Daily rollover.**~~ Midnight in the player's local time.
- [x] ~~**Domain.**~~ https://park-the-cart.vinicius-albuquerque.com.br/ since 22 Nov 2026: a `CNAME` record on Cloudflare (DNS only) pointing at `allbdev.github.io`, set as the custom domain of the repo's GitHub Pages site. The old address (`allbdev.github.io/park-the-cart/`) redirects to it. Saved progress didn't move: browsers keep it per address. Keep the Cloudflare record on "DNS only"; with the proxy on, GitHub can't renew the certificate. (Roadmap tasks 5, 57)
- [x] ~~**Switch on GitHub Pages.**~~ Switched on through the API on 21 Nov 2026 (source: GitHub Actions); every push to `main` deploys.

## Art

- [x] ~~**Who makes the art.**~~ Claude does (20 Nov 2026): everything is built by code, and since 22 Nov 2026 in 3D (meshes generated at load, WebGL 2), so there are no image or model files to make.
- [x] ~~**Art sign-off.**~~ Approved by the developer on 22 Nov 2026. The optional renders that were listed here (asphalt, cars, carts, props, landing background) aren't needed: the game builds all of them.

## Design canvas

- [x] **Look at the canvas** if you change anything there: tell me and I'll bring it into the code and `GAME_PLAN.md` (see `CLAUDE.md`). Nothing is stale yet.

## Playtesting (needs people)

- [x] ~~**Kill test**~~ and ~~**slice test**~~: covered by the developer's own play on 22 Nov 2026.
- [ ] **Phone check:** play on a mid-range phone (load, 60 fps, the stick and the hold button). The 3D renderer lowers its resolution by itself when frames come in slowly, but nobody has watched it do that on a real phone.
- [x] **Playtests (roadmap task 55):** 5 people, at least 2 on phones and 2 English speakers. The levels are now meant to be brutal: watch whether people find them hard or unfair.
