// Helper function to generate ID from heading text
function generateId(text) {
  if (!text) return '';

  // 非常简单的ID生成：只替换空格为连字符，不移除任何字符
  // HTML ID规范允许大部分Unicode字符
  let processed = text.trim();

  // 转换为小写以实现大小写不敏感匹配
  processed = processed.toLowerCase();

  // 将连续的空格转换为单个连字符
  processed = processed.replace(/\s+/g, '-');

  // 确保不以连字符开头或结尾
  processed = processed.replace(/^-+/, '').replace(/-+$/, '');

  return processed || 'heading';
}

// Clean custom ID: replace spaces with hyphens, remove invalid characters
function cleanCustomId(id) {
  if (!id) return '';

  let cleaned = id.trim();

  // Replace spaces and underscores with hyphens
  cleaned = cleaned.replace(/[\s_]+/g, '-');

  // Remove characters that are problematic for HTML IDs
  // HTML ID can contain letters, digits, hyphens, underscores, colons, and periods
  // We'll be more permissive and keep most Unicode characters
  // But remove control characters and certain special chars
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ''); // Control chars
  cleaned = cleaned.replace(/[<>"']/g, ''); // HTML special chars

  // Ensure it doesn't start with a digit (HTML4 restriction, but HTML5 allows it)
  // We'll keep it as-is for now

  // Remove leading/trailing hyphens and dots
  cleaned = cleaned.replace(/^[-.]+/, '').replace(/[-.]+$/, '');

  // Collapse multiple hyphens
  cleaned = cleaned.replace(/-+/g, '-');

  return cleaned || '';
}

// Extract custom ID from heading text (e.g., "Title {#custom-id}")
function extractCustomId(text) {
  if (!text) return { cleanedText: text, customId: null };

  // Match {#custom-id} at the end of the text
  // Allow optional spaces before the pattern
  const match = text.match(/\s*\{#([^}]+)\}\s*$/);
  if (match) {
    let customId = match[1].trim();
    // Clean the custom ID
    customId = cleanCustomId(customId);
    if (!customId) {
      // If cleaned ID is empty, treat as no custom ID
      return { cleanedText: text.trim(), customId: null };
    }
    // Remove the custom ID pattern from the text
    const cleanedText = text.substring(0, match.index).trim();
    return { cleanedText, customId };
  }

  return { cleanedText: text.trim(), customId: null };
}

export default function renderMarkdown(text) {

  // 辅助函数定义
  function showCopyFeedback(button) {
    const originalText = button.innerText;
    button.innerText = 'Copied!';
    setTimeout(() => { button.innerText = originalText; }, 2000);
  }

  function copyToClipboardTraditional(text, button) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';

    document.body.appendChild(textArea);
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showCopyFeedback(button);
      } else {
        console.error('Copy failed');
        button.innerText = 'Copy failed';
        setTimeout(() => { button.innerText = 'Copy'; }, 2000);
      }
    } catch (err) {
      console.error('Copy error:', err);
      button.innerText = 'Copy failed';
      setTimeout(() => { button.innerText = 'Copy'; }, 2000);
    } finally {
      document.body.removeChild(textArea);
    }
  }

  // 复制函数定义
  if (typeof window.copyCodeToClipboard !== 'function') {
    window.copyCodeToClipboard = function(button) {
      // 检查是否在浏览器环境中
      if (typeof document === 'undefined' || typeof window === 'undefined') {
        console.error('Copy function called in non-browser environment');
        return;
      }

      const codeBlock = button.closest('.code-block-wrapper');
      if (!codeBlock) return;
      const codeElement = codeBlock.querySelector('.code-block-content');
      if (!codeElement) return;
      const code = codeElement.innerText || codeElement.textContent;

      // 使用传统的document.execCommand方法
      copyToClipboardTraditional(code, button);
    };
  }

  const md = window.markdownit({
    html: true,
    linkify: true,
    breaks: true,
    highlight: function (str, lang) {
      if (lang && window.hljs.getLanguage(lang)) {
        try {
          return window.hljs.highlight(str, { language: lang }).value;
        } catch (__) { }
      }
      return '';
    }
  })

  // Load and use mdit plugins if available
  const plugins = {
    alert: window.mdItPluginAlert?.alert,
    imgSize: window.mdItPluginImgSize?.imgSize,
    //footnote: window.mdItPluginFootnote?.footnote,
    //emoji: window.mdItPluginEmoji?.emoji,
    sub: window.mdItPluginSub?.sub,
    sup: window.mdItPluginSup?.sup,
    ins: window.mdItPluginIns?.ins,
    mark: window.mdItPluginMark?.mark,
    //abbr: window.mdItPluginAbbr?.abbr,
    dl: window.mdItPluginDl?.dl,
    tasklist: window.mdItPluginTasklist?.tasklist,
    //spoiler: window.mdItPluginSpoiler?.spoiler,
    //ruby: window.mdItPluginRuby?.ruby,
    //tab: window.mdItPluginTab?.tab,
    //align: window.mdItPluginAlign?.align,
    //attrs: window.mdItPluginAttrs?.attrs,
    //figure: window.mdItPluginFigure?.figure,
  };

  Object.entries(plugins).forEach(([name, plugin]) => {
    switch (name) {
      case 'alert':
        // 可对 katex 插件传入额外参数
        md.use(plugin);
        break;
      default:
        try {
          md.use(plugin);
        } catch (err) {
          console.warn(`Failed to apply plugin "${name}":`, err);
        }
    }
});

  // 为代码块添加复制按钮
  const defaultFenceRender = md.renderer.rules.fence || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.fence = function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    const lang = token.info ? token.info.trim() : '';
    const highlighted = defaultFenceRender(tokens, idx, options, env, self);
    // 返回包装后的HTML
    return '<div class="code-block-wrapper">' +
           '<div class="code-block-header">' +
           '<button class="copy-code-button" onclick="window.copyCodeToClipboard(this)">Copy</button>' +
           (lang ? '<span class="code-block-lang">' + lang + '</span>' : '') +
           '</div>' +
           '<div class="code-block-content">' +
           highlighted +
           '</div>' +
           '</div>';
  };

  // Generate IDs for headings
  const originalHeadingOpen = md.renderer.rules.heading_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.heading_open = function(tokens, idx, options, env, self) {
    const token = tokens[idx];

    // Find the inline token with heading content
    let headingInlineToken = null;
    let headingText = '';
    for (let i = idx + 1; i < tokens.length && tokens[i].type !== 'heading_close'; i++) {
      if (tokens[i].type === 'inline') {
        headingInlineToken = tokens[i];
        headingText = headingInlineToken.content;
        break;
      }
    }

    if (headingText && headingInlineToken) {
      // Extract custom ID if present
      const { cleanedText, customId } = extractCustomId(headingText);

      if (customId) {
        // Set custom ID on the heading
        token.attrSet('id', customId);

        // Update the inline token content
        headingInlineToken.content = cleanedText;

        // Clean up children tokens to remove the {#...} pattern
        if (headingInlineToken.children) {
          // Find and remove text tokens that contain only the custom ID pattern
          // or trim the pattern from text tokens
          const newChildren = [];
          let foundCustomId = false;

          for (const child of headingInlineToken.children) {
            if (child.type === 'text') {
              // Try to extract custom ID from this text token
              const { cleanedText: childCleanedText, customId: childCustomId } = extractCustomId(child.content);

              if (childCustomId) {
                // This text token contains the custom ID pattern
                if (childCleanedText) {
                  // There's still some text before the pattern, keep it
                  child.content = childCleanedText;
                  newChildren.push(child);
                }
                // If childCleanedText is empty, we skip this token entirely
                foundCustomId = true;
              } else {
                // No custom ID in this text token
                newChildren.push(child);
              }
            } else {
              // Keep non-text tokens (bold, italic, etc.)
              newChildren.push(child);
            }
          }

          // If we removed all children (unlikely), add an empty text token
          if (newChildren.length === 0) {
            newChildren.push({ type: 'text', content: '' });
          }

          headingInlineToken.children = newChildren;

          // Also ensure the inline token content matches the cleaned text
          headingInlineToken.content = cleanedText;
        }
      } else {
        // Check if id already exists (should not happen for headings)
        const existingId = token.attrs ? token.attrs.find(attr => attr[0] === 'id') : null;
        if (!existingId) {
          // Generate automatic ID
          const id = generateId(headingText);
          if (id) {
            token.attrSet('id', id);
          }
        }
      }
    }

    return originalHeadingOpen(tokens, idx, options, env, self);
  };

  // Handle links - markdown-it will URL encode the href, we need to handle that
  const originalLinkOpen = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefAttr = token.attrs.find(attr => attr[0] === 'href');

    if (hrefAttr) {
      const href = hrefAttr[1];

      // Check if it's an internal anchor link (starts with #)
      if (href.startsWith('#')) {
        // Don't add target="_blank" for anchor links
        // Add a class for styling and identification
        token.attrPush(['class', 'internal-anchor-link']);
        // Add data attribute
        token.attrPush(['data-anchor-link', 'true']);

        // Note: markdown-it will URL encode the href
        // We'll handle this in the scrollToAnchor function
      } else {
        // External link, open in new tab
        token.attrSet('target', '_blank');
        token.attrSet('rel', 'noopener noreferrer');
      }
    }
    return originalLinkOpen(tokens, idx, options, env, self);
  };
  return md.render(text);
}

// Global functions for handling anchor link clicks
if (typeof window !== 'undefined') {
  // Initialize only once
  if (!window._zenAnchorInitialized) {
    window._zenAnchorInitialized = true;

    // Simple ID generation (same as above)
    window.generateHeadingId = function(text) {
      if (!text) return '';
      let processed = text.trim();
      // Convert to lowercase for case-insensitive matching
      processed = processed.toLowerCase();
      processed = processed.replace(/\s+/g, '-');
      processed = processed.replace(/^-+/, '').replace(/-+$/, '');
      return processed || 'heading';
    };

    // Clean custom ID (same as above)
    window.cleanCustomId = function(id) {
      if (!id) return '';
      let cleaned = id.trim();
      cleaned = cleaned.replace(/[\s_]+/g, '-');
      cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
      cleaned = cleaned.replace(/[<>"']/g, '');
      cleaned = cleaned.replace(/^[-.]+/, '').replace(/[-.]+$/, '');
      cleaned = cleaned.replace(/-+/g, '-');
      return cleaned || '';
    };

    // Function to extract custom ID (same as above)
    window.extractCustomId = function(text) {
      if (!text) return { cleanedText: text, customId: null };
      const match = text.match(/\s*\{#([^}]+)\}\s*$/);
      if (match) {
        let customId = match[1].trim();
        customId = window.cleanCustomId(customId);
        if (!customId) {
          return { cleanedText: text.trim(), customId: null };
        }
        const cleanedText = text.substring(0, match.index).trim();
        return { cleanedText, customId };
      }
      return { cleanedText: text.trim(), customId: null };
    };

    // Decode URL encoded string
    function decodeHash(hash) {
      if (!hash) return '';
      const withoutHash = hash.replace(/^#/, '');
      try {
        return decodeURIComponent(withoutHash);
      } catch (e) {
        return withoutHash;
      }
    }

    // Find element by ID, trying multiple variations
        function findElementById(id) {
      if (!id) return null;

      // 1. Try exact match first (case-sensitive)
      let element = document.getElementById(id);
      if (element) return element;

      // 2. Try case-insensitive match
      // Find all elements with ID and compare case-insensitively
      const allElements = document.querySelectorAll('[id]');
      for (const elem of allElements) {
        if (elem.id && elem.id.toLowerCase() === id.toLowerCase()) {
          return elem;
        }
      }

      // 3. Try decoding URL encoding
      try {
        const decoded = decodeURIComponent(id);
        // Try case-sensitive match with decoded
        element = document.getElementById(decoded);
        if (element) return element;

        // Try case-insensitive match with decoded
        for (const elem of allElements) {
          if (elem.id && elem.id.toLowerCase() === decoded.toLowerCase()) {
            return elem;
          }
        }

        // 4. Try with our ID generation (case-insensitive)
        const generatedId = window.generateHeadingId(decoded);
        element = document.getElementById(generatedId);
        if (element) return element;

        // Case-insensitive match with generated ID
        for (const elem of allElements) {
          if (elem.id && elem.id.toLowerCase() === generatedId.toLowerCase()) {
            return elem;
          }
        }
      } catch (e) {
        // Ignore decoding errors
      }

      // 5. Try with our ID generation on original
      const generatedId = window.generateHeadingId(id);
      element = document.getElementById(generatedId);
      if (element) return element;

      // Case-insensitive match with generated ID on original
      const allElements2 = document.querySelectorAll('[id]');
      for (const elem of allElements2) {
        if (elem.id && elem.id.toLowerCase() === generatedId.toLowerCase()) {
          return elem;
        }
      }

      // 6. Last resort: search all headings with text matching (case-insensitive)
      const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const heading of allHeadings) {
        // Case-insensitive ID comparison
        if (heading.id && heading.id.toLowerCase() === id.toLowerCase()) {
          return heading;
        }

        // Try with decoded
        try {
          const decoded = decodeURIComponent(id);
          if (heading.id && heading.id.toLowerCase() === decoded.toLowerCase()) {
            return heading;
          }
        } catch (e) {
          // Ignore decoding errors
        }

        // Try with generated ID from text content
        const headingGeneratedId = window.generateHeadingId(heading.textContent);
        if (headingGeneratedId.toLowerCase() === id.toLowerCase() ||
            (typeof decoded !== 'undefined' && headingGeneratedId.toLowerCase() === decoded.toLowerCase())) {
          return heading;
        }
      }

      return null;
    }

    window.scrollToAnchor = function(hash, smooth = true) {
      if (!hash) return false;

      // Remove the # character
      const id = hash.replace(/^#/, '');
      if (!id) return false;

      const element = findElementById(id);

      if (element) {
        // Scroll to the element
        if (smooth && 'scrollBehavior' in document.documentElement.style) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        } else {
          element.scrollIntoView();
        }

        // Update URL hash (use the element's actual ID)
        try {
          if (history.replaceState) {
            history.replaceState(null, null, '#' + element.id);
          } else {
            window.location.hash = '#' + element.id;
          }
        } catch (e) {
          console.warn('Could not update history:', e);
        }

        return true;
      } else {
        console.warn('Anchor element not found for hash:', hash, 'id:', id);
        console.warn('Available IDs:', Array.from(document.querySelectorAll('[id]')).map(el => el.id).filter(id => id));
        return false;
      }
    };

    // Event delegation for internal anchor links
    window.setupAnchorLinks = function(container = document) {
      // Remove any existing listeners
      if (window._zenAnchorClickHandler) {
        container.removeEventListener('click', window._zenAnchorClickHandler);
      }

      // Add new listener
      window._zenAnchorClickHandler = function(event) {
        let target = event.target;
        while (target && target !== container) {
          if (target.tagName === 'A' &&
              target.classList.contains('internal-anchor-link')) {
            const href = target.getAttribute('href');
            if (href && href.startsWith('#')) {
              event.preventDefault();
              event.stopPropagation();

              window.scrollToAnchor(href);
              return false;
            }
          }
          target = target.parentElement;
        }
      };

      container.addEventListener('click', window._zenAnchorClickHandler);
    };

    // Setup on load
    window.addEventListener('DOMContentLoaded', function() {
      window.setupAnchorLinks();

      if (window.location.hash) {
        setTimeout(() => {
          window.scrollToAnchor(window.location.hash);
        }, 100);
      }
    });

    // Re-setup on navigation
    window.addEventListener('navigate', function() {
      setTimeout(() => {
        window.setupAnchorLinks();
      }, 50);
    });
  }
}
