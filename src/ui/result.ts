import { formatMoney, moneyParts, t, type Locale } from "../content/i18n";
import type { Level } from "../core/level";
import { seconds, type Result } from "../core/result";
import type { ReceiptLine } from "../core/world";
import { button, h } from "./dom";
import { bestText, shareText, type ShareContext } from "./format";
import { receiptEl } from "./receipt";
import { levelPicture } from "./screens";

/** Result: the till receipt and the big price tag (board 5), or the manager's car. */
export interface ResultOptions {
  locale: Locale;
  level: Level;
  levelLabel: string;
  result: Result;
  lines: readonly ReceiptLine[];
  best: Result | null;
  newBest: boolean;
  share: ShareContext;
  /** Why a run that didn't park failed. */
  reason: "manager" | "limit" | null;
  /** Extra line under the tag (daily: counts / practice). */
  note: string | null;
  hasNext: boolean;
  onAgain(): void;
  onNext(): void;
  onLevels(): void;
  onReplay(): void;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function resultScreen(o: ResultOptions): HTMLElement {
  const L = o.locale;
  const r = o.result;
  const bg = levelPicture(o.level, innerWidth, innerHeight, "backdrop");
  const secs = seconds(r.ticks);
  const actions = h("div", { class: "result-actions" });
  let tag: HTMLElement;
  if (r.parked) {
    const [whole, cents] = moneyParts(L, r.damage);
    tag = h(
      "div",
      { class: "big-tag", "data-testid": "result-tag", "data-autofocus": true, tabindex: "-1" },
      h("p", { class: "kicker" }, t(L, "result.parked")),
      h(
        "p",
        { class: "big-price" },
        h("small", {}, "R$"),
        whole,
        h("sup", {}, (L === "pt-BR" ? "," : ".") + cents),
      ),
      h(
        "p",
        { class: "big-sub" },
        secs === 1 ? t(L, "result.inOneSecond") : t(L, "result.inSeconds", { n: secs }),
      ),
    );
  } else {
    tag = h(
      "div",
      {
        class: "big-tag failed",
        "data-testid": "result-tag",
        "data-autofocus": true,
        tabindex: "-1",
      },
      ...(o.reason === "limit"
        ? [
            h("p", { class: "kicker" }, t(L, "result.declinedTag")),
            h("p", { class: "big-word" }, t(L, "result.declinedBig")),
            h(
              "p",
              { class: "big-sub" },
              t(L, "result.declinedBody", { limit: formatMoney(L, o.level.limit ?? 0, false) }),
            ),
          ]
        : [
            h("p", { class: "kicker" }, t(L, "result.failedTag")),
            h("p", { class: "big-word" }, t(L, "result.failedBig")),
            h("p", { class: "big-sub" }, t(L, "result.failedBody")),
          ]),
    );
  }

  const stats = h("div", { class: "result-stats" });
  if (o.best) {
    stats.append(
      h(
        "div",
        { class: "stat" },
        h("span", { class: "hud-label" }, o.newBest ? t(L, "result.newBest") : t(L, "result.best")),
        h("span", { class: "stat-value" }, bestText(L, o.best)),
      ),
    );
  }
  const clean = o.best?.parked && o.best.damage === 0;
  stats.append(
    h(
      "div",
      { class: "stat" },
      h("span", { class: "hud-label" }, t(L, "result.noScratch")),
      h(
        "span",
        { class: "stat-value" },
        clean ? t(L, "result.noScratchYes") : t(L, "result.noScratchNo"),
      ),
    ),
  );

  const again = button(t(L, "result.again"), "btn btn-red", o.onAgain, { "data-testid": "again" });
  actions.append(again);
  if (r.parked && o.hasNext)
    actions.append(
      button(t(L, "result.next"), "btn btn-yellow", o.onNext, { "data-testid": "next" }),
    );
  actions.append(button(t(L, "result.levels"), "btn btn-dark", o.onLevels));

  const text = shareText(L, r, o.share);
  const shareBox = h("pre", { class: "share-box", "data-testid": "share", tabindex: "0" }, text);
  const feedback = h("span", { class: "share-feedback", "aria-live": "polite" });
  const share = button(t(L, "result.share"), "btn btn-outline", async () => {
    const ok = await copyText(text);
    feedback.textContent = ok ? t(L, "result.copied") : t(L, "result.copyFailed");
    if (!ok) {
      const sel = getSelection();
      const range = document.createRange();
      range.selectNodeContents(shareBox);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  });
  const replay = button(t(L, "result.replay"), "btn btn-outline", o.onReplay, {
    "data-testid": "watch-replay",
  });

  return h(
    "main",
    { class: "result" },
    bg,
    h("div", { class: "landing-shade dark" }),
    h(
      "div",
      { class: "result-body" },
      receiptEl(L, o.lines, { open: false, total: r.damage, time: secs, levelLabel: o.levelLabel }),
      h(
        "div",
        { class: "result-side" },
        tag,
        o.note ? h("p", { class: "result-note" }, o.note) : null,
        stats,
        actions,
        h("div", { class: "result-actions" }, share, replay, feedback),
        shareBox,
      ),
    ),
  );
}
