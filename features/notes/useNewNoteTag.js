import { useEffect, useRef } from "../../assets/preact.esm.js";
import { useAppContext } from "../../commons/contexts/AppContext.jsx";
import { findCurrentTag } from "./newNoteTagUtils.js";

export default function useNewNoteTag({ isNewNote, setTags }) {
  const { tags, focusModes } = useAppContext();
  const hasSeededRef = useRef(false);

  // Tags and focus modes load asynchronously, and the new-note modal gets a fresh context, so this waits for them instead of seeding on first render.
  useEffect(() => {
    if (!isNewNote || hasSeededRef.current) {
      return;
    }

    const currentTag = findCurrentTag(tags, focusModes, window.location.search);
    if (currentTag === null) {
      return;
    }

    hasSeededRef.current = true;
    setTags(prevTags => prevTags.length === 0 ? [currentTag] : prevTags);
  }, [isNewNote, tags, focusModes]);
}
