# Launch posts (drafts)

Fill the dates and links at launch. Keep the tone deadpan: the receipt is never in on the joke.

## LinkedIn (English)

I made a small browser game about the hardest drive of the week: returning a shopping cart with one bad wheel.

Park the Cart: ten levels, a daily level that's the same for everyone, and your damage itemised on a till receipt. Free, no account, works on a phone.

The part I enjoyed most as an engineer: replays are just the list of keys you pressed, and they play back bit-identically in Chrome, Firefox and Safari. That meant writing my own sine and cosine, because Math.sin isn't specified to the last bit and the engines disagree. A parking bot proves every level (and every daily level) can be finished without a scratch, and CI replays its runs on every commit.

Play: https://allbdev.github.io/park-the-cart/
Code (MIT): https://github.com/allbdev/park-the-cart

## LinkedIn (Português)

Fiz um joguinho de navegador sobre a direção mais difícil da semana: devolver um carrinho de supermercado com uma roda torta.

Estacione o Carrinho: dez fases, uma fase do dia igual pra todo mundo, e o prejuízo vem no cupom. Grátis, sem cadastro, funciona no celular.

A parte que mais gostei como engenheiro: o replay é só a lista de teclas, e roda igualzinho, bit a bit, no Chrome, no Firefox e no Safari. Pra isso tive que escrever meu próprio seno e cosseno, porque o Math.sin não é igual em todos os navegadores. Um robô estacionador prova que toda fase (e toda fase do dia) dá pra terminar sem arranhar ninguém, e o CI repete as corridas dele a cada commit.

Jogar: https://allbdev.github.io/park-the-cart/
Código (MIT): https://github.com/allbdev/park-the-cart

## X / Bluesky

Estacione o Carrinho 🛒 R$ 3.480 de prejuízo em 41 segundos.
A shopping cart with one bad wheel and a corral that's always further than it looks. Free, in the browser.
https://allbdev.github.io/park-the-cart/

## Show HN

Title: Show HN: Park the Cart – a shopping cart with one bad wheel, with bit-identical replays

Body: A small browser game. The cart is a hand-written rigid-body model (one caster sticks and pulls). Replays are input logs, so the simulation has to be deterministic across engines: it avoids Math.sin/cos/atan2 (not exactly rounded, and V8, SpiderMonkey and JSC differ) and uses its own polynomials built from IEEE-exact operations. A Playwright test checks a 40-second chaotic run ends bit-identical in Chromium, Firefox, WebKit and Node. Levels are proven finishable by a planning bot whose runs CI replays; the daily level is regenerated until the bot can park it without damage.
