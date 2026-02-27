import mark from "../../assets/markdown-it-mark.mjs";
import tasks from "../../assets/markdown-it-task-lists.js";

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
  .use(mark)
  .use(tasks);

  // https://github.com/markdown-it/markdown-it/blob/master/docs/architecture.md#renderer
  var defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    tokens[idx].attrSet('target', '_blank');
    return defaultRender(tokens, idx, options, env, self);
  };
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