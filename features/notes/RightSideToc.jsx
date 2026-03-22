import { h, useEffect } from "../../assets/preact.esm.js";
import "./RightSideToc.css";

export default function RightSideToc({ content, isEditable, isNewNote }) {
  // 使用TableOfContents中的相同函数提取标题
  function extractHeadings(content) {
    if (!content) return [];
    
    const headings = [];
    const lines = content.split('\n');
    let isInsideCodeBlock = false;
    let codeBlockMarker = '';
    let headingIndex = 0;

    lines.forEach(line => {
      const trimmedLine = line.trim();

      // 检测代码块
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

      if (isInsideCodeBlock) {
        return;
      }

      // 匹配Markdown标题（1-3级）
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        let text = match[2].trim();
        // 提取自定义ID并清理文本
        const { cleanedText } = extractCustomId(text);
        text = cleanedText;
        // 清理Markdown链接
        text = cleanMarkdownLinks(text);
        headings.push({ text, level, index: headingIndex });
        headingIndex++;
      }
    });

    return headings;
  }

  // 提取自定义ID函数（从TableOfContents复制）
  function extractCustomId(text) {
    if (!text) return { cleanedText: text, customId: null };
    
    const match = text.match(/\s*\{#([^}]+)\}\s*$/);
    if (match) {
      let customId = match[1].trim();
      customId = customId.replace(/[\s_]+/g, '-');
      customId = customId.replace(/[^\w\-]/g, '');
      customId = customId.replace(/^-+/, '').replace(/-+$/, '');
      customId = customId.toLowerCase();
      if (!customId) {
        return { cleanedText: text.trim(), customId: null };
      }
      const cleanedText = text.substring(0, match.index).trim();
      return { cleanedText, customId };
    }
    
    return { cleanedText: text.trim(), customId: null };
  }

  // 清理Markdown链接，提取链接文本
  function cleanMarkdownLinks(text) {
    if (!text) return text;
    
    // 匹配 [text](url) 或 [text](url "title")
    // 使用非贪婪匹配，处理多个链接
    const linkRegex = /\[([^\]]+?)\]\([^)]+\)/g;
    
    // 替换所有Markdown链接为链接文本
    return text.replace(linkRegex, '$1').trim();
  }


  const headings = extractHeadings(content);
  
  // 当有标题且不在编辑模式时，添加类名到body
  useEffect(() => {
    const shouldShowToc = !isEditable && !isNewNote && headings.length >= 2;
    
    if (shouldShowToc) {
      document.body.classList.add('has-right-toc');
    } else {
      document.body.classList.remove('has-right-toc');
    }
    
    return () => {
      document.body.classList.remove('has-right-toc');
    };
  }, [isEditable, isNewNote, headings.length, content]);
  
  // 如果不显示目录，返回null
  if (isEditable || isNewNote || headings.length < 2) {
    return null;
  }
  
  function handleHeadingClick(heading) {
    const headingElements = document.querySelectorAll(`h${heading.level}`);
    let targetElement = null;

    for (const element of headingElements) {
      const elementText = element.textContent.trim();
      const { cleanedText: cleanedElementText } = extractCustomId(elementText);
      
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
  }
  
  const minLevel = Math.min(...headings.map(h => h.level));
  
  const items = headings.map((heading, index) => {
    const paddingLeft = `${(heading.level - minLevel) * 16}px`;
    
    return (
      <div
        key={`toc-${index}`}
        className="right-toc-item"
        style={{ paddingLeft }}
        onClick={() => handleHeadingClick(heading)}
        title={heading.text}
      >
        <span className="right-toc-item-text">{heading.text}</span>
      </div>
    );
  });
  
  return (
    <div className="right-toc-container">
      <div className="right-toc-header">
        <span className="right-toc-title">Contents</span>
      </div>
      <div className="right-toc-content">
        {items}
      </div>
    </div>
  );
}
