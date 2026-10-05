import { h, useState, useEffect, useCallback } from "../../assets/preact.esm.js";
import isMobile from "../../commons/utils/isMobile.js";
import { t } from "../../commons/i18n/index.js";
import { unfoldToHeading } from "./useCollapsibleHeadings.js";
import "./NoteOutline.css";

const MAX_OUTLINE_LEVEL = 3;
const DEFAULT_RIGHT_OFFSET = 12;
// Breathing room between the sticky header and a heading jumped to.
const HEADING_TOP_GAP = 24;
// A heading just jumped to sits exactly on the boundary, so the active marker's line
// is nudged past it to keep the landing point and the highlight in agreement.
const ACTIVE_LINE_EPSILON = 10;

// The pinned header sits above the scroller, so the reading area starts at the
// scroller's own top edge.
function getTopBoundary(scroller) {
  return scroller.getBoundingClientRect().top;
}

export default function NoteOutline({ contentRef, noteId, content, isEditable, rightOffset }) {
  const [headings, setHeadings] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // The outline is read from the rendered DOM rather than from the markdown source.
  // Re-parsing would let a heading the renderer emits differently (setext headings,
  // headings in blockquotes) drift out of sync with the element we scroll to.
  useEffect(() => {
    const container = contentRef.current;
    if (isEditable === true || container === null) {
      setHeadings([]);
      return;
    }

    const elements = Array.from(container.children).filter(isOutlineHeading);
    setHeadings(elements.map((element, index) => ({
      index,
      element,
      level: parseInt(element.tagName[1], 10),
      text: element.textContent.trim()
    })));
  }, [content, isEditable, contentRef]);

  // Marks the section being read as the last heading that has passed the middle of
  // the scroller. A band at the very top leaves nothing marked whenever a heading is
  // centred by a jump, and folded headings report a zero rect, so they are skipped.
  useEffect(() => {
    const container = contentRef.current;
    const scroller = container === null ? null : container.closest(".notes-editor-scroll");
    if (headings.length === 0 || scroller === null) {
      setActiveIndex(null);
      return;
    }

    let frame = null;

    function updateActive() {
      // The same boundary a jump lands on marks the current section, so clicking an
      // entry and reading the highlight can never disagree about where you are.
      const line = getTopBoundary(scroller) + HEADING_TOP_GAP + ACTIVE_LINE_EPSILON;
      let current = 0;
      for (const heading of headings) {
        if (heading.element.hidden === true) {
          continue;
        }
        if (heading.element.getBoundingClientRect().top <= line) {
          current = heading.index;
        }
      }
      setActiveIndex(current);
    }

    function scheduleUpdate() {
      if (frame !== null) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = null;
        updateActive();
      });
    }

    updateActive();
    scroller.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      scroller.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [headings, contentRef]);

  const handleSelect = useCallback(heading => {
    const container = contentRef.current;
    if (container === null || heading.element.isConnected !== true) {
      return;
    }
    // Unfold first: hidden ancestors report a zero rect, so the target must be
    // measurable before its position is worked out.
    unfoldToHeading(container, heading.element, noteId);

    const scroller = container.closest(".notes-editor-scroll");
    if (scroller === null) {
      heading.element.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Land the heading at the top of the reading area, just clear of the sticky
    // header, rather than centring it and leaving the section's opening lines above.
    const delta = heading.element.getBoundingClientRect().top - getTopBoundary(scroller) - HEADING_TOP_GAP;
    scroller.scrollBy({ top: delta, behavior: "smooth" });
  }, [contentRef, noteId]);

  if (isEditable === true || isMobile() === true || headings.length === 0) {
    return null;
  }

  const bars = headings.map(heading => {
    let className = `note-outline-bar level-${heading.level}`;
    if (heading.index === activeIndex) {
      className += " is-active";
    }
    if (heading.index === hoveredIndex) {
      className += " is-hovered";
    }

    return (
      <div
        key={`outline-${heading.index}`}
        className="note-outline-row"
        onMouseEnter={() => setHoveredIndex(heading.index)}
        onMouseLeave={() => setHoveredIndex(current => current === heading.index ? null : current)}
        onClick={() => handleSelect(heading)}
      >
        <div className={className} />
        {heading.index === hoveredIndex ? (
          <div className="note-outline-card">{heading.text === "" ? t("notes.outline.untitled") : heading.text}</div>
        ) : null}
      </div>
    );
  });

  return (
    <div className="note-outline" style={{ right: `${rightOffset ?? DEFAULT_RIGHT_OFFSET}px` }}>
      {bars}
    </div>
  );
}

function isOutlineHeading(element) {
  const match = element.tagName.match(/^H([1-6])$/);
  return match !== null && parseInt(match[1], 10) <= MAX_OUTLINE_LEVEL;
}
