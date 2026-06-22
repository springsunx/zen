import isMobile from '../utils/isMobile';
import './Tooltip.css';

let activeTooltip = null;
let activeAnchor = null;
let showTimeout = null;
let hideTimeout = null;
let autoDismissTimeout = null;

const AUTO_DISMISS_MS = 30000;

function handleMouseOver(e) {
  const element = e.target.closest('[data-tooltip]');
  if (element) {
    showTooltip(element);
  }
}

function handleMouseOut(e) {
  const related = e.relatedTarget;
  // 如果鼠标移到了另一个 data-tooltip 元素，不隐藏
  if (related && related.closest && related.closest('[data-tooltip]')) {
    return;
  }
  const element = e.target.closest('[data-tooltip]');
  if (element) {
    hideTooltip();
  }
}

function handleMouseMove(e) {
  if (!activeTooltip) return;
  const element = e.target.closest('[data-tooltip]');
  if (!element) {
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

function addGlobalEventListeners() {
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('scroll', handleScroll, true);
  document.addEventListener('mousedown', handleClick, true);
  window.addEventListener('resize', handleResize);
}

function observeElements() {
  const observer = new MutationObserver((mutations) => {
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
  clearTimeout(hideTimeout);
  clearTimeout(showTimeout);
  clearTimeout(autoDismissTimeout);

  showTimeout = setTimeout(() => {
    const tooltipText = element.getAttribute('data-tooltip');
    if (!tooltipText) {
      return;
    }

    // 如果元素已经不在 DOM 中，不显示 tooltip
    if (!element.parentNode) {
      return;
    }

    removeTooltip(activeTooltip);

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.innerHTML = tooltipText;
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

    // Safety auto-dismiss
    autoDismissTimeout = setTimeout(() => {
      hideTooltip();
    }, AUTO_DISMISS_MS);
  }, 400);
}

function hideTooltip() {
  clearTimeout(showTimeout);
  clearTimeout(autoDismissTimeout);

  activeAnchor = null;

  if (activeTooltip) {
    const tooltip = activeTooltip;
    activeTooltip = null;
    tooltip.classList.remove('visible');

    hideTimeout = setTimeout(() => {
      removeTooltip(tooltip);
    }, 150);
  }
}

function removeTooltip(tooltip) {
  if (tooltip && tooltip.parentNode) {
    tooltip.parentNode.removeChild(tooltip);
  }
  if (activeTooltip && activeTooltip.parentNode) {
    activeTooltip.parentNode.removeChild(activeTooltip);
    activeTooltip = null;
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
  if (isMobile()) {
    return
  }

  addGlobalEventListeners();
  observeElements();
}

export default {
  init
}
