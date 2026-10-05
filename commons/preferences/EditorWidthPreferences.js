const PREFERENCE_PREFIX = 'editor-width';
const DEFAULT_WIDTH = 850;
const MIN_WIDTH = 480;

// Browse and expanded share no value: expanding is a deliberate reading mode and
// should not inherit a width dragged while the list and sidebar were visible.
function getWidth(isExpanded) {
  try {
    const stored = localStorage.getItem(getKey(isExpanded));
    const width = parseInt(stored, 10);
    return Number.isFinite(width) ? clamp(width) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function setWidth(width, isExpanded) {
  try {
    localStorage.setItem(getKey(isExpanded), String(clamp(width)));
  } catch {
  }
}

function getKey(isExpanded) {
  return isExpanded === true ? `${PREFERENCE_PREFIX}-expanded` : `${PREFERENCE_PREFIX}-browse`;
}

// Only a floor is enforced. The reading column is free to grow until it fills the
// editor pane, and the pane itself is the only ceiling.
function clamp(width) {
  return Math.max(MIN_WIDTH, Math.round(width));
}

export default {
  getWidth,
  setWidth,
  clamp,
  DEFAULT_WIDTH,
  MIN_WIDTH
};
