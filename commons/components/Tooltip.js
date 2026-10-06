import isMobile from '../utils/isMobile';
import './Tooltip.css';

let activeTooltip = null;
let activeAnchor = null;
let showTimeout = null;
let hideTimeout = null;
let autoDismissTimeout = null;
let initialized = false;

const ANCHOR_WATCH_INTERVAL_MS = 250;

function handleMouseOver(e) {
  const element = e.target.closest('[data-tooltip]');
  if (element) {
    showTooltip(element);
  }
}

function handleMouseOut(e) {
  const related = e.relatedTarget;
  const element = e.target.closest('[data-tooltip]');
  const nextElement = related && related.closest ? related.closest('[data-tooltip]') : null;
  // Moving within the same control fires bubbling mouseout events too.
  if (nextElement === element) {
    return;
  }
  // Switching controls must not leave the old tooltip waiting for a delayed hide.
  if (nextElement) {
    showTooltip(nextElement);
  } else if (element) {
    hideTooltip();
  }
}

function handleMouseMove(e) {
  if (!activeTooltip) return;
  const element = e.target.closest('[data-tooltip]');
  if (element !== activeAnchor) {
    hideTooltip();
  }
}

function handleScroll() {
  if (activeTooltip) {
    hideTooltip();
  }
}

function handleResize() {
  if (activeTooltip) {
    hideTooltip();
  }
}

function handleClick() {
  if (activeTooltip) {
    hideTooltip();
  }
}

function handleGlobalVisibilityChange() {
  if (document.hidden || activeTooltip) {
    hideTooltip(true);
  }
}

function addGlobalEventListeners() {
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('scroll', handleScroll, true);
  document.addEventListener('mousedown', handleClick, true);
  document.addEventListener('visibilitychange', handleGlobalVisibilityChange);
  window.addEventListener('blur', handleGlobalVisibilityChange);
  window.addEventListener('resize', handleResize);
}

function observeElements() {
  const observer = new MutationObserver((mutations) => {
    if (activeAnchor && !activeAnchor.isConnected) {
      hideTooltip(true);
    }
    for (const mutation of mutations) {
      // Handle added nodes
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processNewElements(node);
        }
      }
      // Handle removed nodes — hide tooltip if anchor was removed
      if (activeAnchor) {
        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node === activeAnchor || (node.contains && node.contains(activeAnchor))) {
              hideTooltip();
              break;
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function processNewElements(element) {
  if (element.hasAttribute && element.hasAttribute('title')) {
    const title = element.getAttribute('title');
    if (title) {
      element.setAttribute('data-tooltip', title);
      element.removeAttribute('title');
    }
  }

  const elementsWithTitle = element.querySelectorAll ? element.querySelectorAll('[title]') : [];
  elementsWithTitle.forEach((el) => {
    const title = el.getAttribute('title');
    if (title) {
      el.setAttribute('data-tooltip', title);
      el.removeAttribute('title');
    }
  });
}

function showTooltip(element) {
  if (activeAnchor && activeAnchor !== element) {
    hideTooltip(true);
  }
  clearTimeout(showTimeout);
  clearTimeout(autoDismissTimeout);

  showTimeout = setTimeout(() => {
    const tooltipText = element.getAttribute('data-tooltip');
    if (!tooltipText) {
      return;
    }

    // A detached element can still retain a parentNode inside a removed subtree.
    // It must never create a tooltip after a route or component transition.
    if (!element.isConnected || !element.matches(':hover')) {
      return;
    }

    removeTooltip(activeTooltip);

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = tooltipText;
    document.body.appendChild(tooltip);

    const position = calculatePosition(element, tooltip);
    tooltip.style.left = `${position.left}px`;
    tooltip.style.top = `${position.top}px`;
    tooltip.className = `tooltip ${position.placement}`;

    activeTooltip = tooltip;
    activeAnchor = element;

    requestAnimationFrame(() => {
      tooltip.classList.add('visible');
    });

    scheduleAnchorWatch();
  }, 400);
}

function scheduleAnchorWatch() {
  clearTimeout(autoDismissTimeout);

  function checkAnchor() {
    if (!activeTooltip || !activeAnchor || !activeAnchor.isConnected || !activeAnchor.matches(':hover')) {
      hideTooltip(true);
      return;
    }
    autoDismissTimeout = setTimeout(checkAnchor, ANCHOR_WATCH_INTERVAL_MS);
  }

  autoDismissTimeout = setTimeout(checkAnchor, ANCHOR_WATCH_INTERVAL_MS);
}

function hideTooltip(immediate = false) {
  clearTimeout(showTimeout);
  clearTimeout(autoDismissTimeout);

  activeAnchor = null;

  if (activeTooltip) {
    const tooltip = activeTooltip;
    activeTooltip = null;
    clearTimeout(hideTimeout);
    if (immediate) {
      removeTooltip(tooltip);
      return;
    }

    tooltip.classList.remove('visible');
    hideTimeout = setTimeout(() => {
      removeTooltip(tooltip);
      hideTimeout = null;
    }, 150);
  }
}

function removeTooltip(tooltip) {
  if (tooltip && tooltip.parentNode) {
    tooltip.parentNode.removeChild(tooltip);
  }
  if (activeTooltip === tooltip) {
    activeTooltip = null;
    activeAnchor = null;
  }
}

function calculatePosition(anchor, element) {
  const anchorRect = anchor.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spacing = 8;

  const positions = [
    {
      placement: 'top',
      left: anchorRect.left + (anchorRect.width / 2) - (elementRect.width / 2),
      top: anchorRect.top - elementRect.height - spacing
    },
    {
      placement: 'bottom',
      left: anchorRect.left + (anchorRect.width / 2) - (elementRect.width / 2),
      top: anchorRect.bottom + spacing
    },
    {
      placement: 'left',
      left: anchorRect.left - elementRect.width - spacing,
      top: anchorRect.top + (anchorRect.height / 2) - (elementRect.height / 2)
    },
    {
      placement: 'right',
      left: anchorRect.right + spacing,
      top: anchorRect.top + (anchorRect.height / 2) - (elementRect.height / 2)
    }
  ];

  for (let position of positions) {
    if (isPositionValid(position, elementRect, viewportWidth, viewportHeight)) {
      return constrainToViewport(position, elementRect, viewportWidth, viewportHeight);
    }
  }

  return constrainToViewport(positions[0], elementRect, viewportWidth, viewportHeight);
}

function isPositionValid(position, elementRect, viewportWidth, viewportHeight) {
  return (
    position.left >= 0 &&
    position.top >= 0 &&
    position.left + elementRect.width <= viewportWidth &&
    position.top + elementRect.height <= viewportHeight
  );
}

function constrainToViewport(position, elementRect, viewportWidth, viewportHeight) {
  const padding = 8;

  position.left = Math.max(padding, Math.min(
    position.left,
    viewportWidth - elementRect.width - padding
  ));

  position.top = Math.max(padding, Math.min(
    position.top,
    viewportHeight - elementRect.height - padding
  ));

  return position;
}

function init() {
  if (initialized || isMobile()) {
    return
  }

  initialized = true;
  // A hot reload can leave markup created by an older tooltip implementation in
  // the document. Tooltips are owned by this module, so start from a clean slate.
  document.querySelectorAll('.tooltip').forEach((tooltip) => tooltip.remove());
  addGlobalEventListeners();
  observeElements();
}

export default {
  init
}
