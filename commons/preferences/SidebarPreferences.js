const STORAGE_KEY = "zen.sidebar.visibleItems";

export const SIDEBAR_ITEMS = ["canvas", "templates", "clipboard", "files", "archives", "trash", "shares"];

const DEFAULT_VISIBILITY = {
  canvas: true,
  templates: true,
  clipboard: true,
  files: true,
  archives: false,
  trash: false,
  shares: false,
};

function getVisibility() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const visibility = { ...DEFAULT_VISIBILITY };
    SIDEBAR_ITEMS.forEach((item) => {
      if (typeof saved[item] === "boolean") visibility[item] = saved[item];
    });
    return visibility;
  } catch {
    return { ...DEFAULT_VISIBILITY };
  }
}

function setVisible(item, isVisible) {
  if (!SIDEBAR_ITEMS.includes(item)) return;

  const visibility = { ...getVisibility(), [item]: isVisible === true };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility)); } catch {}
  try { window.dispatchEvent(new CustomEvent("sidebar-preferences:change", { detail: visibility })); } catch {}
}

export default { getVisibility, setVisible };
