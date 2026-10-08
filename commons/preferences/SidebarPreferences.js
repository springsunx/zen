const STORAGE_KEY = "zen.sidebar.visibleItems";
const POSITION_STORAGE_KEY = "zen.sidebar.itemPositions";

export const SIDEBAR_ITEMS = ["canvas", "templates", "clipboard", "files", "archives", "trash", "shares"];
export const SIDEBAR_POSITIONS = {
  PRIMARY: "primary",
  RAIL: "rail",
};

const DEFAULT_VISIBILITY = {
  canvas: true,
  templates: true,
  clipboard: true,
  files: true,
  archives: false,
  trash: false,
  shares: false,
};

// Keep common workspaces in the labelled column and put secondary destinations
// in the compact icon rail. Existing visibility choices are preserved.
const DEFAULT_POSITIONS = {
  canvas: SIDEBAR_POSITIONS.RAIL,
  templates: SIDEBAR_POSITIONS.RAIL,
  clipboard: SIDEBAR_POSITIONS.PRIMARY,
  files: SIDEBAR_POSITIONS.PRIMARY,
  archives: SIDEBAR_POSITIONS.RAIL,
  trash: SIDEBAR_POSITIONS.RAIL,
  shares: SIDEBAR_POSITIONS.RAIL,
};

function getPreferences() {
  try {
    const savedVisibility = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const savedPositions = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) || "{}");
    const visibility = { ...DEFAULT_VISIBILITY };
    const positions = { ...DEFAULT_POSITIONS };
    SIDEBAR_ITEMS.forEach((item) => {
      if (typeof savedVisibility[item] === "boolean") visibility[item] = savedVisibility[item];
      if (savedPositions[item] === SIDEBAR_POSITIONS.PRIMARY || savedPositions[item] === SIDEBAR_POSITIONS.RAIL) {
        positions[item] = savedPositions[item];
      }
    });
    return { visibility, positions };
  } catch {
    return { visibility: { ...DEFAULT_VISIBILITY }, positions: { ...DEFAULT_POSITIONS } };
  }
}

function getVisibility() {
  return getPreferences().visibility;
}

function getPositions() {
  return getPreferences().positions;
}

function savePreferences(preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences.visibility));
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(preferences.positions));
  } catch {}
  try { window.dispatchEvent(new CustomEvent("sidebar-preferences:change", { detail: preferences })); } catch {}
}

function setVisible(item, isVisible) {
  if (!SIDEBAR_ITEMS.includes(item)) return;

  const preferences = getPreferences();
  preferences.visibility[item] = isVisible === true;
  savePreferences(preferences);
}

function setPosition(item, position) {
  if (!SIDEBAR_ITEMS.includes(item)) return;
  if (position !== SIDEBAR_POSITIONS.PRIMARY && position !== SIDEBAR_POSITIONS.RAIL) return;

  const preferences = getPreferences();
  preferences.positions[item] = position;
  savePreferences(preferences);
}

export default { getPreferences, getVisibility, getPositions, setVisible, setPosition };
