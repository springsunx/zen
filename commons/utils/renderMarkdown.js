import { generateId, cleanCustomId, extractCustomId, buildHeadingOpen, buildLinkOpen, findAnchor} from "./markdownToc.js";

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
    align: window.mdItPluginAlign?.align,
    attrs: window.mdItPluginAttrs?.attrs,
    dl: window.mdItPluginDl?.dl,
    footnote: window.mdItPluginFootnote?.footnote,
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
  const originalHeadingOpen = md.renderer.rules.heading_open = buildHeadingOpen(opts || {});

  // 3.链接：内部锚链接特殊处理，外部链接在新标签页打开
  const originalLinkOpen = md.renderer.rules.link_open = buildLinkOpen(opts || {});

  return md.render(text);
}

// ========== 全局锚链接处理 ==========
if (typeof window !== 'undefined' && !window._zenAnchorInitialized) {
  window._zenAnchorInitialized = true;

  // 暴露工具函数到全局
  window.generateHeadingId = generateId;
  window.cleanCustomId = cleanCustomId;
  window.extractCustomId = extractCustomId;

  // 主函数：滚动到锚点
  window.scrollToAnchor = function (hash, smooth = true) {
    if (!hash) return false;

    const id = hash.replace(/^#/, '');
    if (!id) return false;

    const element = findAnchor(document, id);
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
