import { t } from "../i18n/index.js";

// Toggles wrapping for one rendered code block by flipping the attribute the
// stylesheet keys off, so re-rendering the note is not required.
//
// The tooltip is kept on data-tooltip, which is the only attribute the app's tooltip
// layer reads: writing a native title here would leave two tooltips on screen, one of
// them stale, because Tooltip.js converts title once when the node is inserted.
export default function handleCodeWrapClick(e) {
  const button = e.target.closest(".code-wrap-button");
  if (button === null) {
    return false;
  }

  const block = button.closest(".code-block");
  if (block === null) {
    return false;
  }

  const isWrapped = block.dataset.codeWrap !== "false";
  const nextIsWrapped = isWrapped === false;
  block.dataset.codeWrap = String(nextIsWrapped);
  button.setAttribute("aria-pressed", String(nextIsWrapped));
  button.setAttribute("data-tooltip", nextIsWrapped ? t("code.wrap.on") : t("code.wrap.off"));

  return true;
}
