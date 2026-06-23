const VIEW_PREFERENCE_PREFIX = 'view-preference';
const GLOBAL_VIEW_MODE_KEY = 'view-preference-global-mode';
const DEFAULT_VIEW = 'list';

function getPreference(focusId, tagId, isArchived, isDeleted) {
  try {
    if (isGlobalMode()) {
      const globalView = localStorage.getItem(`${VIEW_PREFERENCE_PREFIX}-all`);
      if (globalView) return globalView;
    }
    const key = getKey(focusId, tagId, isArchived, isDeleted);
    if (key === null) {
      return DEFAULT_VIEW;
    }
    return localStorage.getItem(key) || DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

// view: "list" || "card" || "gallery"
function setPreference(view, focusId, tagId, isArchived, isDeleted) {
  try {
    if (isGlobalMode()) {
      localStorage.setItem(`${VIEW_PREFERENCE_PREFIX}-all`, view);
      return;
    }
    const key = getKey(focusId, tagId, isArchived, isDeleted);
    if (key === null) {
      return;
    }
    localStorage.setItem(key, view);
  } catch {
  }
}

function getKey(focusId, tagId, isArchived, isDeleted) {
  if (isDeleted === true) {
    return null;
  }

  if (isArchived === true) {
    return `${VIEW_PREFERENCE_PREFIX}-archived`;
  }

  if (focusId) {
    return `${VIEW_PREFERENCE_PREFIX}-focus-${focusId}`;
  }

  if (tagId) {
    return `${VIEW_PREFERENCE_PREFIX}-tag-${tagId}`;
  }

  return `${VIEW_PREFERENCE_PREFIX}-all`;
}

function isGlobalMode() {
  try {
    return localStorage.getItem(GLOBAL_VIEW_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function setGlobalMode(isGlobal) {
  try {
    localStorage.setItem(GLOBAL_VIEW_MODE_KEY, String(isGlobal));
  } catch {}
}

export default {
  getPreference,
  setPreference,
  isGlobalMode,
  setGlobalMode
};
