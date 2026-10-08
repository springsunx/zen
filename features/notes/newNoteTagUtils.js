function findTagById(tags, tagId) {
  for (const tag of tags) {
    if (String(tag.tagId) === tagId) {
      return tag;
    }
    const children = Array.isArray(tag.children) ? tag.children : [];
    const childMatch = findTagById(children, tagId);
    if (childMatch !== null) {
      return childMatch;
    }
  }
  return null;
}

export function findCurrentTag(tags, focusModes, search) {
  const searchParams = new URLSearchParams(search || '');
  const tagId = searchParams.get("tagId");
  const focusId = searchParams.get("focusId");
  const availableTags = Array.isArray(tags) ? tags : [];
  const availableFocusModes = Array.isArray(focusModes) ? focusModes : [];

  if (tagId !== null) {
    return findTagById(availableTags, tagId);
  }

  // A focus mode with several tags gives no way to know which one is meant.
  if (focusId !== null) {
    const focusMode = availableFocusModes.find(mode => String(mode.focusId) === focusId);
    if (focusMode && focusMode.tags.length === 1) {
      return focusMode.tags[0];
    }
  }

  return null;
}
