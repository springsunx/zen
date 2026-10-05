import { t } from "../i18n/index.js";
import { generateId, cleanCustomId, extractCustomId, buildHeadingOpen, buildLinkOpen, buildLinkClose, findAnchor} from "./markdownToc.js";

// 辅助函数：Tab 切换
function createTabHandler() {
  if (window._zenTabHandler) return;
  window._zenTabHandler = true;

  function activateTab(btn) {
    const wrapper = btn.closest('.tabs-tabs-wrapper');
    if (!wrapper) return;
    const idx = btn.getAttribute('data-tab');
    if (idx === null) return;

    wrapper.querySelectorAll('.tabs-tab-button, .tabs-tab-content').forEach(el => {
      el.removeAttribute('data-active');
    });
    btn.setAttribute('data-active', '');
    const content = wrapper.querySelector(`.tabs-tab-content[data-index="${idx}"]`);
    if (content) content.setAttribute('data-active', '');
  }

  // 初始化：无激活 tab 时默认激活第一个
  function initTabs() {
    document.querySelectorAll('.tabs-tabs-wrapper').forEach(wrapper => {
      if (!wrapper.querySelector('[data-active]')) {
        const first = wrapper.querySelector('.tabs-tab-button');
        if (first) activateTab(first);
      }
    });
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.tabs-tab-button');
    if (btn) activateTab(btn);
  });

  initTabs();
  new MutationObserver(initTabs).observe(document.body, { childList: true, subtree: true });
}

// 主函数：渲染Markdown
const COPY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy code-copy-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

const CHECK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check code-copied-icon"><path d="M20 6 9 17l-5-5"/></svg>';

// DSH's own wrap glyphs, copied path for path from its icon set: filled 16x16 art
// rather than a stroked Lucide stand-in, so the toggle matches the reference.
const WRAP_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="code-wrap-icon"><path d="M2 15H1V1H2V15Z" fill="currentColor"/><path d="M12.3535 7.64645C12.5487 7.84171 12.5487 8.15829 12.3535 8.35355L9.85352 10.8535L9.14648 10.1465L10.793 8.5H3.5V7.5H10.793L9.14648 5.85352L9.85352 5.14648L12.3535 7.64645Z" fill="currentColor"/><path d="M15 15H14V1H15V15Z" fill="currentColor"/></svg>';

const NOWRAP_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="code-nowrap-icon"><path d="M10.9999 8C10.9999 6.89543 10.1046 6 9 6H4.5V5H9C10.6568 5 11.9999 6.34315 11.9999 8C11.9999 9.65685 10.6568 11 9 11H6.20703L6.85351 11.6465L6.14648 12.3535L4.64652 10.8536C4.45126 10.6583 4.45126 10.3417 4.64652 10.1464L6.14648 8.64648L6.85351 9.35352L6.20703 10H9C10.1046 10 10.9999 9.10457 10.9999 8Z" fill="currentColor"/><path d="M2 15H1V1H2V15Z" fill="currentColor"/><path d="M15 15H14V1H15V15Z" fill="currentColor"/></svg>';

// The info string is author-supplied markdown, so it is escaped before it reaches
// the innerHTML sink the rendered note is injected into.
// The info string is author-supplied markdown, so it is escaped before it reaches
// the innerHTML sink the rendered note is injected into.
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function getFenceLanguage(token) {
  const info = (token.info || "").trim();
  return info === "" ? "" : info.split(/\s+/)[0];
}


export default function renderMarkdown(text, opts = {}) {
  if (typeof window !== 'undefined') {
    createTabHandler();
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
    layout: window.mdItPluginLayout?.layout,
    tab: window.mdItPluginTab?.tab,
  };

  // 通用插件注册

  Object.entries(plugins).forEach(([name, plugin]) => {
    if (!plugin) return;
    try {
      if (name !== 'container' && name !== 'tab') { md.use(plugin); }
    } catch (err) {
      console.warn(`Plugin load failed: ${name}`, err);
    }
  });

  // Tab 插件注册
  if (plugins.tab) {
    try {
      md.use(plugins.tab, { name: 'tabs' });
    } catch (err) {
      console.warn('Plugin load failed: tab', err);
    }
  }

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

  // 1. 代码块：DSH 样式外框（语言标签 + 换行开关 + 复制）—— 参照实现
  const originalFenceRender = md.renderer.rules.fence ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const fenceHtml = originalFenceRender(tokens, idx, options, env, self);
    const language = getFenceLanguage(tokens[idx]);
    const tools = opts.hasCodeCopyButton === true ? buildCodeTools(language) : "";

    if (tools === "") {
      return fenceHtml;
    }

    return `<div class="code-block" data-code-wrap="false">${tools}${fenceHtml}</div>`;
  };

  // 2. 标题：生成ID（支持自定义ID语法）
  const originalHeadingOpen = md.renderer.rules.heading_open = buildHeadingOpen(opts || {});

  // 3.链接：内部锚链接特殊处理，外部链接在新标签页打开
  const originalLinkOpen = md.renderer.rules.link_open = buildLinkOpen(opts || {});

  // 4.链接关闭：处理视频标签替换
  md.renderer.rules.link_close = buildLinkClose();

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
              // Strip anchorPrefix fallback: n123-philosophy → philosophy
              const dashIdx = idRaw.indexOf('-');
              if (dashIdx > 0 && idRaw.charAt(0) === 'n' && /^\d+$/.test(idRaw.substring(1, dashIdx))) {
                arr.push(idRaw.substring(dashIdx + 1));
              }
              return uniq(arr);
            })();
            const all = document.querySelectorAll('[id]');
            const norm = (x) => String(x || '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[\.:]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            let element = null;
            for (const cid of candidates) {
              // Precise match (escaped selector)
              try { const esc = (window.CSS && CSS.escape) ? CSS.escape(cid) : cid.replace(/["'\\\[\]#.:]/g, '\\$&'); element = document.querySelector('[id="' + esc + '"]'); } catch (e) { }
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

// Mirrors the banner DSH renders: the declared language on the left, the wrap and
// copy controls on the right. The language element is kept even when empty so the
// two ends stay pinned by space-between.
function buildCodeTools(language) {
  const label = `<span class="code-language">${language === "" ? "" : escapeHtml(language)}</span>`;
  const wrapButton = `<button type="button" class="code-wrap-button" data-tooltip="${t("code.wrap.off")}" aria-label="${t("code.wrap")}" aria-pressed="false">${WRAP_ICON_SVG}${NOWRAP_ICON_SVG}</button>`;
  const copyButton = `<button type="button" class="code-copy-button" data-tooltip="${t("code.copy")}" aria-label="${t("code.copy")}">${COPY_ICON_SVG}${CHECK_ICON_SVG}</button>`;

  // Copy sits ahead of the language label (both on the left); the wrap toggle keeps the
  // right-hand end to itself.
  return `<div class="code-tools" data-code-block-banner>${copyButton}${label}<div class="code-action">${wrapButton}</div></div>`;
}
