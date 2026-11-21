# What I need from you

> Things only you can do (decisions, art, accounts, people). Claude keeps this list current while working; newest items at the top of each section.
> Last updated: 20 Nov 2026. On 20 Nov you said "you're the boss": every default below is taken and Claude builds the whole game, art included. Reopen any of them by telling me.

## Decisions (quick)

All taken on 20 Nov 2026 ("you're the boss"). Tell me to reopen any.

- [x] ~~**Physics.**~~ A small hand-written cart model (`GAME_PLAN.md` D4), no library.
- [x] ~~**Repo name and owner.**~~ https://github.com/allbdev/park-the-cart. (Roadmap task 1)
- [x] ~~**English title.**~~ "Park the Cart" in English, "Estacione o Carrinho" in PT-BR.
- [x] ~~**Score order.**~~ Damage first, time breaks ties.
- [x] ~~**Scope of the mockup extras.**~~ Replays, five carts and the daily level are built as the second version (roadmap Phase 4).
- [x] ~~**Daily rollover.**~~ Midnight in the player's local time.
- [ ] **Domain.** Built for GitHub Pages on the repo URL (the share text uses whatever address the game is served from). Buy a domain only if you want one. (Roadmap tasks 5, 57)
- [ ] **Switch on GitHub Pages** if the first deploy fails: repo Settings → Pages → Source: "GitHub Actions". (Roadmap task 5)

## Art

- [x] ~~**Who makes the art.**~~ Claude does (20 Nov 2026): the lot, cars, carts and props are drawn procedurally in Canvas 2D from code (top-down, baked shadows, worn paint), so there are no image files to make. If you'd rather render sprites in 3D like the mockups, the list below is what would replace the drawn versions.

Optional renders (top-down, same camera and light as the mockups, shadows baked, transparent background):

- [ ] *(optional)* **Asphalt base:** a tileable or full-lot top-down texture with worn paint, oil stains, patches.
- [ ] *(optional)* **Cars:** sedan, SUV, pickup, hatch (first draft) in 3–4 colours each, plus the manager's black car.
- [ ] *(optional)* **Carts:** Padrão first; later Enferrujado, Cestinha, Infantil, Atacarejo.
- [ ] *(optional)* **Props:** cone (standing and knocked over), corral with the "DEVOLVA SEU CARRINHO AQUI" sign, abandoned cart, speed bump.
- [ ] *(optional)* **Landing background** (blurred, like board 1) and the how-to background.

## Design canvas

- [ ] **Look at the canvas** if you change anything there: tell me and I'll bring it into the code and `GAME_PLAN.md` (see `CLAUDE.md`). Nothing is stale yet.

## Playtesting (needs people)

- [ ] **Kill test (end of Phase 1):** push the cart around the empty lot for five minutes. Is it funny-bad or just bad? Tell me what feels wrong.
- [ ] **Slice test (end of Phase 2):** play level 3 ten times, on desktop and on a phone. Do you want a cleaner receipt each time?
- [ ] **Phone check:** play on a mid-range phone (load, 60 fps, the stick and the hold button).
- [ ] **Playtests (roadmap task 55):** 5 people, at least 2 on phones and 2 English speakers.
