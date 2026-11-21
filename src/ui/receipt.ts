import { formatMoney, formatTime, t, type Locale } from "../content/i18n";
import { receiptItems } from "../core/result";
import type { ReceiptLine } from "../core/world";
import { h } from "./dom";
import { itemText, receiptAmount } from "./format";

/** The till receipt, as real text (readable by screen readers, selectable, copyable). */
export function receiptEl(
  locale: Locale,
  lines: readonly ReceiptLine[],
  opts: { open: boolean; total: number; time?: number; levelLabel?: string },
): HTMLElement {
  const items = receiptItems(lines);
  const list = h("ol", { class: "receipt-items" });
  items.forEach((item, i) => {
    const { title, sub } = itemText(locale, item);
    list.append(
      h(
        "li",
        {},
        h("span", { class: "r-num" }, String(i + 1).padStart(3, "0")),
        h("span", { class: "r-title" }, title),
        h("span", { class: "r-price" }, receiptAmount(locale, item.price)),
        h("span", { class: "r-sub" }, sub),
      ),
    );
  });
  const el = h(
    "section",
    { class: `receipt ${opts.open ? "open" : "closed"}`, "aria-label": t(locale, "receipt.shop") },
    h("p", { class: "r-shop" }, t(locale, "receipt.shop")),
    h(
      "p",
      { class: "r-kind" },
      opts.open ? t(locale, "receipt.openTitle") : t(locale, "receipt.title"),
    ),
    h("hr"),
    items.length ? list : h("p", { class: "r-empty" }, t(locale, "receipt.empty")),
    h("hr"),
    h(
      "p",
      { class: "r-total" },
      h("span", {}, t(locale, "receipt.total")),
      h("span", {}, formatMoney(locale, opts.total)),
    ),
  );
  if (opts.open) {
    el.append(h("hr"), h("p", { class: "r-foot" }, t(locale, "hud.receiptCloses")));
  } else {
    el.append(
      h("hr"),
      h(
        "p",
        { class: "r-meta" },
        h("span", {}, t(locale, "receipt.time")),
        h("span", {}, formatTime(opts.time ?? 0)),
      ),
      h(
        "p",
        { class: "r-meta" },
        h("span", {}, t(locale, "receipt.level")),
        h("span", {}, opts.levelLabel ?? ""),
      ),
      h(
        "p",
        { class: "r-foot" },
        t(locale, "receipt.thanks"),
        h("br"),
        t(locale, "receipt.dontComeBack"),
      ),
    );
  }
  return el;
}
