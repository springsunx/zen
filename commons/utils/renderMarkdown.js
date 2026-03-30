// =============================================
// Markdown渲染器 - 简洁重构版
// 功能完整：标题ID生成、自定义ID提取、代码块复制、锚链接处理
// =============================================

// 辅助函数：生成标题ID
function generateId(text) {
  if (!text) return '';
  return text.trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'heading';
}

// 辅助函数：清理自定义ID
function cleanCustomId(id) {
  if (!id) return '';

  return id.trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[\x00-\x1F\x7F<>"']/g, '')  // 移除控制字符和HTML特殊字符
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .replace(/-+/g, '-') || '';
}

// 辅助函数：从标题文本提取自定义ID（例如 "标题 {#custom-id}"）
function extractCustomId(text) {
  if (!text) return { cleanedText: text, customId: null };

  const match = text.match(/\s*\{#([^}]+)\}\s*$/);
  if (!match) return { cleanedText: text.trim(), customId: null };

  const customId = cleanCustomId(match[1].trim());
  if (!customId) return { cleanedText: text.trim(), customId: null };

  const cleanedText = text.substring(0, match.index).trim();
  return { cleanedText, customId };
}

// 辅助函数：复制代码到剪贴板
function createCopyHandler() {
  if (typeof window.copyCodeToClipboard === 'function') return;

  function showCopyFeedback(button) {
    const originalText = button.innerText;
    button.innerText = 'Copied!';
    setTimeout(() => { button.innerText = originalText; }, 2000);
  }

  function copyToClipboard(text, button) {
    // Normalize line breaks and trim trailing whitespace/newlines to avoid extra blank line on paste
    const normalized = String(text || '').replace(/\r\n/g, '\n');
    const trimmed = normalized.replace(/\s+$/, '');
    const textArea = document.createElement('textarea');
    textArea.value = trimmed;
    Object.assign(textArea.style, {
      position: 'fixed', top: '0', left: '0',
      width: '2em', height: '2em', padding: '0',
      border: 'none', outline: 'none', boxShadow: 'none',
      background: 'transparent'
    });
    document.body.appendChild(textArea);
    textArea.select();
    try {
      if (document.execCommand('copy')) {
        showCopyFeedback(button);
      } else {
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

  window.copyCodeToClipboard = function (button) {
    if (typeof document === 'undefined') return;
    const codeBlock = button.closest('.code-block-wrapper');
    const codeElement = codeBlock?.querySelector('.code-block-content');
    const code = codeElement?.innerText || codeElement?.textContent || '';
    copyToClipboard(code, button);
  };
}

// 主函数：渲染Markdown
export default function renderMarkdown(text, opts = {}) {
  // 确保复制处理器已初始化
  if (typeof window !== 'undefined') {
    createCopyHandler();
  }

  // 配置markdown-it
  const md = window.markdownit({
    html: true,
    linkify: true,
    breaks: true,
    highlight: function (str, lang) {
      if (lang && window.hljs?.getLanguage(lang)) {
        try {
          return window.hljs.highlight(str, { language: lang }).value;
        } catch (err) {
          console.warn('Code highlight failed:', err);
        }
      }
      return '';
    }
  });

  // 加载可用插件
  const plugins = {
    alert: window.mdItPluginAlert?.alert,
    attrs: window.mdItPluginAttrs?.attrs,
    dl: window.mdItPluginDl?.dl,
    fullEmoji: window.mdItPluginEmoji?.fullEmoji,
    imgSize: window.mdItPluginImgSize?.imgSize,
    imgLazyload: window.mdItPluginImgLazyload?.imgLazyload,
    ins: window.mdItPluginIns?.ins,
    mark: window.mdItPluginMark?.mark,
    sub: window.mdItPluginSub?.sub,
    sup: window.mdItPluginSup?.sup,
    tasklist: window.mdItPluginTasklist?.tasklist,
    //katex: window.mdItPluginKatex?.katex,
    container: window.mdItPluginContainer?.container,
  };

  // 通用插件注册

  Object.entries(plugins).forEach(([name, plugin]) => {
    if (!plugin) return;
    try {
      if (name !== 'container') { md.use(plugin); }
    } catch (err) {
      console.warn(`Plugin load failed: ${name}`, err);
    }
  });

  // 容器插件注册（支持：info, warning, danger, success, tip, note, details）
  if (plugins.container) {
    const container = plugins.container;
    const types = ['note', 'tip', 'important', 'warning', 'caution'];
    // Backward compatibility: map legacy container names to the new five
    const legacyMap = { info: 'note', success: 'important', danger: 'caution' };
    Object.entries(legacyMap).forEach(([legacy, target]) => {
      try {
        md.use(container, legacy, {
          validate: (params) => params.trim().toLowerCase().startsWith(legacy),
          render(tokens, idx) {
            const token = tokens[idx];
            const info = token.info.trim();
            if (token.nesting === 1) {
              const title = info ? md.utils.escapeHtml(info) : legacy.toUpperCase();
              return `<div class="md-container md-container-${target}"><div class="md-container-title">${title}</div><div class="md-container-body">`;
            } else {
              return `</div></div>`;
            }
          }
        });
      } catch (err) { console.warn(`Container type failed: ${legacy}`, err); }
    });

    types.forEach(type => {
      try {
        md.use(container, type, {
          validate: (params) => params.trim().toLowerCase().startsWith(type),
          render(tokens, idx) {
            const token = tokens[idx];
            const info = token.info.trim();
            if (token.nesting === 1) {
              const title = info ? md.utils.escapeHtml(info) : type.toUpperCase();
              return `<div class="md-container md-container-${type}"><div class="md-container-title">${title}</div><div class="md-container-body">`;
            } else {
              return `</div></div>`;
            }
          }
        });
      } catch (err) {
        console.warn(`Container type failed: ${type}`, err);
      }
    });
    try {
      md.use(container, 'details', {
        render(tokens, idx) {
          const token = tokens[idx];
          const info = token.info.trim();
          if (token.nesting === 1) {
            const summary = info ? md.utils.escapeHtml(info) : 'Details';
            return `<details class="md-container md-container-details">${summary ? `<summary>${summary}</summary>` : `<summary aria-label="展开/收起"></summary>`}<div class="md-container-body">`;
          } else {
            return `</div></details>`;
          }
        }
      });
    } catch (err) {
      console.warn('Container type failed: details', err);
    }
  }


  // ========== 自定义渲染规则 ==========

  // 1. 代码块：添加复制按钮
  const originalFenceRender = md.renderer.rules.fence ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const lang = token.info?.trim() || '';
    const highlighted = originalFenceRender(tokens, idx, options, env, self);

    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <button class="copy-code-button" onclick="window.copyCodeToClipboard(this)">Copy</button>
        ${lang ? `<span class="code-block-lang">${lang}</span>` : ''}
      </div>
      <div class="code-block-content">${highlighted}</div>
    </div>`;
  };

  // 2. 标题：生成ID（支持自定义ID语法）
  const originalHeadingOpen = md.renderer.rules.heading_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];

    // 查找标题内容
    let headingText = '';
    let inlineToken = null;

    for (let i = idx + 1; i < tokens.length && tokens[i].type !== 'heading_close'; i++) {
      if (tokens[i].type === 'inline') {
        inlineToken = tokens[i];
        headingText = inlineToken.content;
        break;
      }
    }

    if (headingText && inlineToken) {
      const { cleanedText, customId } = extractCustomId(headingText);
      const id = customId || generateId(headingText);

      if (!opts.stripHeadingIds) {
        if (id && !token.attrs?.find(attr => attr[0] === 'id')) {
          token.attrSet('id', id);
        }
        if (opts.anchorPrefix) {
          const idAttr = token.attrs?.find(a => a[0] === 'id');
          if (idAttr && idAttr[1] && !idAttr[1].startsWith(opts.anchorPrefix)) {
            idAttr[1] = opts.anchorPrefix + idAttr[1];
          }
        }
      }

      // 更新清理后的文本
      if (cleanedText !== headingText) {
        inlineToken.content = cleanedText;

        // 清理子token中的自定义ID模式
        if (inlineToken.children) {
          inlineToken.children = inlineToken.children.filter(child => {
            if (child.type !== 'text') return true;

            const { cleanedText: childCleaned } = extractCustomId(child.content);
            if (childCleaned) child.content = childCleaned;
            return childCleaned !== '';
          });

          if (inlineToken.children.length === 0) {
            inlineToken.children.push({ type: 'text', content: '' });
          }
        }
      }
    }

    return originalHeadingOpen(tokens, idx, options, env, self);
  };

  // 3. 链接：内部锚链接特殊处理，外部链接在新标签页打开
  const originalLinkOpen = md.renderer.rules.link_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefAttr = token.attrs?.find(attr => attr[0] === 'href');

    if (hrefAttr) {
      if (hrefAttr[1].startsWith('#')) {
        token.attrPush(['class', 'internal-anchor-link']);
        token.attrPush(['data-anchor-link', 'true']);
        if (opts.anchorPrefix) {
          const raw = hrefAttr[1].replace(/^#/, '');
          token.attrSet('href', '#' + opts.anchorPrefix + raw);
        }
      } else {
        token.attrSet('target', '_blank');
        token.attrSet('rel', 'noopener noreferrer');
      }
    }

    return originalLinkOpen(tokens, idx, options, env, self);
  };

  return md.render(text);
}

// ========== 全局锚链接处理 ==========
if (typeof window !== 'undefined' && !window._zenAnchorInitialized) {
  window._zenAnchorInitialized = true;

  // 暴露工具函数到全局
  window.generateHeadingId = generateId;
  window.cleanCustomId = cleanCustomId;
  window.extractCustomId = extractCustomId;

  // 辅助函数：查找元素（支持大小写不敏感和URL解码）
  function findElementById(id) {
    if (!id) return null;

    // 1. 精确匹配
    let element = document.getElementById(id);
    if (element) return element;

    // 2. 大小写不敏感匹配
    const allElements = document.querySelectorAll('[id]');
    for (const elem of allElements) {
      if (elem.id?.toLowerCase() === id.toLowerCase()) {
        return elem;
      }
    }

    // 3. 尝试URL解码
    try {
      const decoded = decodeURIComponent(id);
      element = document.getElementById(decoded);
      if (element) return element;

      for (const elem of allElements) {
        if (elem.id?.toLowerCase() === decoded.toLowerCase()) {
          return elem;
        }
      }

      // 4. 使用生成的ID匹配
      const generatedId = generateId(decoded);
      element = document.getElementById(generatedId);
      if (element) return element;

      for (const elem of allElements) {
        if (elem.id?.toLowerCase() === generatedId.toLowerCase()) {
          return elem;
        }
      }
    } catch (e) {
      // 解码失败，继续尝试
    }

    // 5. 使用原始文本生成ID匹配
    const generatedId = generateId(id);
    element = document.getElementById(generatedId);
    if (element) return element;

    for (const elem of allElements) {
      if (elem.id?.toLowerCase() === generatedId.toLowerCase()) {
        return elem;
      }
    }

    return null;
  }

  // 主函数：滚动到锚点
  window.scrollToAnchor = function (hash, smooth = true) {
    if (!hash) return false;

    const id = hash.replace(/^#/, '');
    if (!id) return false;

    const element = findElementById(id);
    if (!element) {
      console.warn('Anchor not found:', hash);
      return false;
    }

    // 执行滚动
    if (smooth && 'scrollBehavior' in document.documentElement.style) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      element.scrollIntoView();
    }

    // 更新URL哈希
    try {
      if (history.replaceState) {
        history.replaceState(null, null, '#' + element.id);
      } else {
        window.location.hash = '#' + element.id;
      }
    } catch (e) {
      console.warn('History update failed:', e);
    }

    return true;
  };

  // 事件委托：处理内部锚链接点击
  window.setupAnchorLinks = function (container) {
    const root = (container && typeof container.addEventListener === 'function') ? container : document;
    // 移除现有监听器
    if (window._zenAnchorClickHandler) {
      try { root.removeEventListener('click', window._zenAnchorClickHandler); } catch (e) {}
    }

    // 创建新监听器
    window._zenAnchorClickHandler = function (event) {
      let target = event.target;

      while (target && target !== root) {
        if (target.tagName === 'A' && target.classList.contains('internal-anchor-link')) {
          const href = target.getAttribute('href');
          if (href?.startsWith('#')) {
            event.preventDefault();
            event.stopPropagation();
            const idRaw = href.replace(/^#/, '');
            const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
            const candidates = (() => {
              let arr = [idRaw];
              try { arr.push(decodeURIComponent(idRaw)); } catch (e) { }
              if (window.generateHeadingId) arr.push(window.generateHeadingId(idRaw));
              return uniq(arr);
            })();
            const all = root.querySelectorAll('[id]');
            const norm = (x) => String(x || '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[\.:]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            let element = null;
            for (const cid of candidates) {
              // Precise match (escaped selector)
              try { const esc = (window.CSS && CSS.escape) ? CSS.escape(cid) : cid.replace(/["'\\\[\]#.:]/g, '\\$&'); element = root.querySelector('[id=+esc+]'); } catch (e) { }
              if (element) break;
              // Normalized equality / prefix match
              const c = norm(cid);
              for (const el of all) { const e = norm(el.id); if (e === c || e.startsWith(c + '-')) { element = el; break; } }
              if (element) break;
            }
            if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            return false;
          }
        }
        target = target.parentElement;
      }
    };

    root.addEventListener('click', window._zenAnchorClickHandler);
  };

  // 初始化和事件绑定
  window.addEventListener('DOMContentLoaded', () => {
    window.setupAnchorLinks();

    // 页面加载时处理URL哈希
    if (window.location.hash) {
      setTimeout(() => window.scrollToAnchor(window.location.hash), 100);
    }
  });

  // 导航时重新设置
  window.addEventListener('navigate', () => {
    setTimeout(() => window.setupAnchorLinks(), 50);
  });
}
