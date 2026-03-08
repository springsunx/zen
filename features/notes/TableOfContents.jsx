import { h, render, useRef } from "../../assets/preact.esm.js"
import { closeModal, openModal } from "../../commons/components/Modal.jsx";
import "./TableOfContents.css";

export default function TableOfContents({ content, isExpanded, isEditable, isNewNote, visibleHeadings = [] }) {
  const headings = extractHeadings(content);
  const hideTimeoutRef = useRef(null);

  if (isExpanded !== true || isEditable === true || isNewNote === true || headings.length < 4) {
    const tocRoot = document.querySelector('.toc-root');
    if (tocRoot) {
      render(null, tocRoot);
    }
    return null;
  }

  function showPopover() {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    openModal(<TableOfContentsPopover headings={headings} visibleHeadings={visibleHeadings} onMouseEnter={handlePopoverMouseEnter} onMouseLeave={handlePopoverMouseLeave} />);
  }

  function hidePopover() {
    closeModal();
  }

  function handleMouseEnter() {
    showPopover();
  }

  function handleMouseLeave() {
    hideTimeoutRef.current = setTimeout(() => {
      hidePopover();
    }, 100);
  }

  function handlePopoverMouseEnter() {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }

  function handlePopoverMouseLeave() {
    hideTimeoutRef.current = setTimeout(() => {
      hidePopover();
    }, 100);
  }

  function isHeadingVisible(heading) {
    return visibleHeadings.some(visible => visible.index === heading.index);
  }

  const bars = headings.map((item) => {
    const isVisible = isHeadingVisible(item);
    return (
      <div
        key={`heading-${item.index}`}
        className={`toc-bar toc-bar-level-${item.level} ${isVisible ? 'is-visible' : ''}`}
      />
    );
  });

  const sidebarElement = (
    <div className="toc-sidebar" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className="toc-bars">
        {bars}
      </div>
    </div>
  );

  const tocRoot = document.querySelector('.toc-root');
  if (tocRoot) {
    render(sidebarElement, tocRoot);
  }
  return null;
}

function TableOfContentsPopover({ headings, visibleHeadings = [], onMouseEnter, onMouseLeave }) {
  function handleItemClick(heading) {
    const headingElements = document.querySelectorAll(`h${heading.level}`);
    let targetElement = null;

    for (const element of headingElements) {
      // Get the text content and clean it (remove any custom ID pattern)
      const elementText = element.textContent.trim();
      const { cleanedText: cleanedElementText } = extractCustomId(elementText);
      
      // Compare with the heading text (already cleaned)
      if (cleanedElementText === heading.text) {
        targetElement = element;
        break;
      }
    }

    if (targetElement !== null) {
      if ('scrollBehavior' in document.documentElement.style) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        targetElement.scrollIntoView();
      }
    }

    closeModal();
  }

  const minLevel = Math.min(...headings.map(h => h.level));

  function isHeadingVisible(heading) {
    return visibleHeadings.some(visible => visible.index === heading.index);
  }

  const items = headings.map((heading) => {
    const isVisible = isHeadingVisible(heading);
    return (
      <div
        key={`heading-${heading.index}`}
        className={`toc-item ${isVisible ? 'is-visible' : ''}`}
        style={{ marginLeft: `${(heading.level - minLevel) * 8}px` }}
        onClick={() => handleItemClick(heading)}
      >
        {heading.text}
      </div>
    );
  });

  return (
    <div className="toc-popover" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="toc-popover-content">
        <div className="toc-items">
          {items}
        </div>
      </div>
    </div>
  );
}

// Extract custom ID from heading text (e.g., "Title {#custom-id}")
function extractCustomId(text) {
  if (!text) return { cleanedText: text, customId: null };
  
  // Match {#custom-id} at the end of the text
  // Allow optional spaces before the pattern
  const match = text.match(/\s*\{#([^}]+)\}\s*$/);
  if (match) {
    let customId = match[1].trim();
    // Clean the custom ID - simplified version
    customId = customId.replace(/[\s_]+/g, '-');
    customId = customId.replace(/[^\w\-]/g, '');
    customId = customId.replace(/^-+/, '').replace(/-+$/, '');
    customId = customId.toLowerCase(); // Convert to lowercase for case-insensitive matching
    if (!customId) {
      return { cleanedText: text.trim(), customId: null };
    }
    const cleanedText = text.substring(0, match.index).trim();
    return { cleanedText, customId };
  }
  
  return { cleanedText: text.trim(), customId: null };
}

function extractHeadings(content) {
  if (content === '') {
    return [];
  }

  const headings = [];
  const lines = content.split('\n');
  let isInsideCodeBlock = false;
  let codeBlockMarker = '';
  let headingIndex = 0;

  lines.forEach(line => {
    const trimmedLine = line.trim();

    // Check if we're entering or exiting a code block
    if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
      if (!isInsideCodeBlock) {
        isInsideCodeBlock = true;
        codeBlockMarker = trimmedLine.substring(0, 3);
      } else if (trimmedLine.startsWith(codeBlockMarker)) {
        isInsideCodeBlock = false;
        codeBlockMarker = '';
      }
      return;
    }

    // Skip processing if we're inside a code block
    if (isInsideCodeBlock) {
      return;
    }

    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      let text = match[2].trim();
      // Extract custom ID and clean the text
      const { cleanedText } = extractCustomId(text);
      text = cleanedText;
      headings.push({ text, level, index: headingIndex });
      headingIndex++;
    }
  });

  return headings;
}
