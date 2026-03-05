import mark from "../../assets/markdown-it-mark.mjs";
import tasks from "../../assets/markdown-it-task-lists.js";

// Helper function to generate ID from heading text
function generateId(text) {
  if (!text) return '';
  
  // 非常简单的ID生成：只替换空格为连字符，不移除任何字符
  // HTML ID规范允许大部分Unicode字符
  let processed = text.trim();
  
  // 将连续的空格转换为单个连字符
  processed = processed.replace(/\s+/g, '-');
  
  // 确保不以连字符开头或结尾
  processed = processed.replace(/^-+/, '').replace(/-+$/, '');
  
  return processed || 'heading';
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

  // 处理锚点链接点击（全局函数）
  if (typeof window.handleAnchorClick !== 'function') {
    window.handleAnchorClick = function(event, href) {
      // 如果是锚点链接
      if (href && href.startsWith('#')) {
        event.preventDefault();
        const id = href.substring(1);
        const targetElement = document.getElementById(id);
        if (targetElement) {
          // 找到最近的滚动容器
          const container = document.querySelector('.notes-editor-container');
          if (container) {
            // 计算目标元素相对于容器的位置
            const targetRect = targetElement.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const scrollTop = targetRect.top - containerRect.top + container.scrollTop;
            container.scrollTo({
              top: scrollTop - 20, // 减去一些边距
              behavior: 'smooth'
            });
          } else {
            // 如果没有找到容器，使用标准的scrollIntoView
            targetElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
          // 更新URL哈希（不触发页面滚动）
          if (window.history && window.history.pushState) {
            window.history.pushState(null, null, href);
          }
        }
        return false;
      }
      return true;
    };
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
  .use(mark)
  .use(tasks);

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
    
    // Check if id already exists
    const existingId = token.attrs ? token.attrs.find(attr => attr[0] === 'id') : null;
    if (!existingId) {
      // Find the inline token with heading content
      let headingText = '';
      for (let i = idx + 1; i < tokens.length && tokens[i].type !== 'heading_close'; i++) {
        if (tokens[i].type === 'inline') {
          headingText = tokens[i].content;
          break;
        }
      }
      
      if (headingText) {
        const id = generateId(headingText);
        if (id) {
          token.attrSet('id', id);
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
      processed = processed.replace(/\s+/g, '-');
      processed = processed.replace(/^-+/, '').replace(/-+$/, '');
      return processed || 'heading';
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
      // Try exact match first
      let element = document.getElementById(id);
      if (element) return element;
      
      // Try decoding URL encoding
      try {
        const decoded = decodeURIComponent(id);
        element = document.getElementById(decoded);
        if (element) return element;
        
        // Try with our ID generation
        const generatedId = window.generateHeadingId(decoded);
        element = document.getElementById(generatedId);
        if (element) return element;
      } catch (e) {
        // Ignore decoding errors
      }
      
      // Try with our ID generation on original
      const generatedId = window.generateHeadingId(id);
      element = document.getElementById(generatedId);
      if (element) return element;
      
      // Last resort: search all headings
      const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const heading of allHeadings) {
        if (heading.id === id || 
            heading.id === decodeURIComponent(id) ||
            window.generateHeadingId(heading.textContent) === window.generateHeadingId(id) ||
            window.generateHeadingId(heading.textContent) === window.generateHeadingId(decodeURIComponent(id))) {
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
