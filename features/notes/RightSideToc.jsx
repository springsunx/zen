import { h, useEffect } from "../../assets/preact.esm.js";
import { t } from "../../commons/i18n/index.js";
import "./RightSideToc.css";
import { extractHeadingsFromMarkdown, buildTocMarkdown, injectOrReplaceToc, extractCustomId } from "../../commons/utils/markdownToc.js";
import ApiClient from "../../commons/http/ApiClient.js";
import Button from "../../commons/components/Button.jsx";
import { useNotes } from "../../commons/contexts/NotesContext.jsx";

export default function RightSideToc({ content, isEditable, isNewNote, inModal = false, noteId, onContentPatched }) {

  const { selectedNote, handleNoteChange, setSelectedNote } = useNotes();

  const headings = extractHeadingsFromMarkdown(content);
  
  // 当有标题且不在编辑模式时，添加类名到body
  useEffect(() => {
    const shouldShowToc = !isEditable && !isNewNote && headings.length >= 2;
    
    if (!inModal) {
      if (shouldShowToc) {
        document.body.classList.add('has-right-toc');
      } else {
        document.body.classList.remove('has-right-toc');
      }
      return () => { document.body.classList.remove('has-right-toc'); }
    }
    return () => {};
  }, [isEditable, isNewNote, headings.length, content]);
  
  // 如果不显示目录，返回null
  if (isEditable || isNewNote || headings.length < 2) {
    return null;
  }
  
  function handleHeadingClick(heading) {
    const container = inModal ? document.querySelector('.notes-editor-modal .notes-editor-rendered') : document.querySelector('.notes-editor-rendered');
    const headingElements = container ? container.querySelectorAll(`h${heading.level}`) : document.querySelectorAll(`h${heading.level}`);
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
    <div className={`right-toc-container ${inModal ? "in-modal" : ""}`}>
      <div className="right-toc-header">
        <span className="right-toc-title">{t('notes.toc.title')}</span>
      </div>
      <div className="right-toc-content">
        {items}
      </div>
      {!isEditable && noteId && (
        <div style={{ padding: '8px 12px' }}><Button variant="ghost" onClick={async () => {
          try {
            const hs = extractHeadingsFromMarkdown(content);
            if (!hs || hs.length < 2) { return; }
            const toc = buildTocMarkdown(hs, t('notes.toc.title'));
            const newContent = injectOrReplaceToc(content, toc);
            const updated = await ApiClient.updateNote(noteId, { title: selectedNote?.title, content: newContent, tags: selectedNote?.tags });
            try { if (setSelectedNote && (selectedNote?.noteId === noteId)) setSelectedNote({ ...(selectedNote || {}), ...(updated || {}), content: newContent }); } catch {}
            try { if (typeof onContentPatched === "function") onContentPatched(newContent); } catch {}
            handleNoteChange();
          } catch (e) { console.error('Insert TOC failed:', e); }
        }}>{t('notes.toc.insert') || '插入目录到正文'}</Button></div>
      )}
    </div>
  );
}
