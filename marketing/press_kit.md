# Park the Cart: press kit

**Park the Cart** (*Estacione o Carrinho*) is a free browser game about the hardest drive of the week: returning a shopping cart with one bad wheel to the corral without scratching anybody's car. Every scratch goes on the receipt.

- **Play:** https://park-the-cart.vinicius-albuquerque.com.br/
- **Source:** https://github.com/allbdev/park-the-cart (MIT)
- **Made by:** Vinícius Albuquerque Barros
- **Platforms:** any modern browser, desktop and phone. No install, no account, no ads.
- **Languages:** English and Brazilian Portuguese.

## In one line

A shopping cart with one bad wheel, a crowded car park, and a corral that is always further than it looks.

## What's in it

- Ten levels of about a minute each: speed bumps, a slope, gusting wind, rain, Black Friday, the manager's car, and rush hour, when cars back out without looking.
- A daily level, generated from the date and the same for everyone. The first try counts.
- Five carts, each with its own fault: one pulls right, one moves in jerks, one turns with the wind, one won't turn at all, one won't stop.
- Results come as a till receipt: "R$ 3.480 de prejuízo em 41 segundos". Share it, or share a replay link that plays your run again, exactly.

## For developers

- A hand-written cart physics model, about 200 lines, tuned for "funny-bad".
- Bit-identical replays across Chromium, Firefox and WebKit: the simulation uses its own trigonometry, because `Math.sin` isn't the same to the last bit in every engine.
- Every level is proven finishable by a parking bot whose recorded runs CI replays; every daily level is checked by the same bot before you see it.
- 3D with no engine and no asset files: the cars, carts and car park are meshes built by code and drawn with hand-written WebGL 2. About 58 KB of JavaScript and CSS.

## Images

- `designs/en/01-Main.jpg` to `09-Mobile.jpg` in the repository: screens captured from the game (Portuguese versions in `designs/`).
- `public/og.jpg`: 1200 × 630 link preview.

## Contact

alb.develloper@gmail.com
