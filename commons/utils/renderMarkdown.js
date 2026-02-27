import mark from "../../assets/markdown-it-mark.mjs";
import tasks from "../../assets/markdown-it-task-lists.js";

export default function renderMarkdown(text) {

  // 自定义slugify函数，支持中文
  function slugify(str) {
    return str
      .toLowerCase()
      .replace(/[\s\-]+/g, '-')           // 将空格和连字符替换为单个连字符
      .replace(/[^\w\u4e00-\u9fa5\-]/g, '') // 移除非单词字符、非中文、非连字符
      .replace(/\-\-+/g, '-')               // 将多个连字符替换为单个
      .replace(/^-+/, '')                     // 移除开头的连字符
      .replace(/-+$/, '');                    // 移除结尾的连字符
  }

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
    headerIds: true,      // 为标题生成id属性
    headerPrefix: '',     // id前缀，设为空字符串
    slugify: slugify,       // 使用自定义的slugify函数
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

  // https://github.com/markdown-it/markdown-it/blob/master/docs/architecture.md#renderer
  var defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    // 获取链接的href属性
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex >= 0) {
      const href = token.attrs[hrefIndex][1];
      if (href) {
        // 判断是否为外部链接
        const isExternal = isExternalLink(href);
        if (isExternal) {
          token.attrSet('target', '_blank');
          // 同时添加rel="noopener noreferrer"以增强安全性
          token.attrSet('rel', 'noopener noreferrer');
        }
      }
    }
    return defaultRender(tokens, idx, options, env, self);
  };
  
  // 辅助函数：判断是否为外部链接
  function isExternalLink(href) {
    // 锚点链接不是外部链接
    if (href.startsWith('#')) {
      return false;
    }
    // 检查是否为绝对URL
    try {
      const url = new URL(href, window.location.origin);
      // 如果协议是http:或https:，且主机名与当前页面不同，则是外部链接
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.hostname !== window.location.hostname;
      }
    } catch (e) {
      // 如果不是有效的URL，可能是相对路径，不是外部链接
      // 相对路径、协议相对链接(//example.com)、mailto:、tel:等都不是外部链接
      if (href.startsWith('//')) {
        // 协议相对链接，需要进一步检查
        try {
          const url = new URL('https:' + href);
          return url.hostname !== window.location.hostname;
        } catch (e2) {
          return false;
        }
      }
      // 其他情况（相对路径、mailto:、tel:等）不是外部链接
      return false;
    }
    // 其他协议（如mailto:、tel:、file:等）不是外部链接
    return false;
  }
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

  return md.render(text);
}