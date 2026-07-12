import { h, useRef, useEffect } from "../../assets/preact.esm.js"
import { NoteIcon } from '../../commons/components/Icon.jsx';
import { t } from "../../commons/i18n/index.js";
import "./TemplateSlashMenu.css";

export default function TemplateSlashMenu({ templates, selectedIndex, onApply, textareaRef }) {
  const menuRef = useRef(null);

  // Scroll selected item into view
  useEffect(() => {
    if (!menuRef.current) return;
    const selected = menuRef.current.querySelector('.template-slash-item.is-selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const position = (() => {
    if (!textareaRef?.current) return { top: 0, left: 0, width: 280 };
    const ta = textareaRef.current;
    const pos = ta.selectionStart;
    const style = window.getComputedStyle(ta);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const textBefore = ta.value.substring(0, pos);
    const lines = textBefore.split('\n');
    const contentWidth = ta.clientWidth - paddingLeft - parseFloat(style.paddingRight || 0);

    let visualY = 0;
    for (let i = 0; i < lines.length - 1; i++) {
      const w = ctx.measureText(lines[i]).width;
      visualY += Math.max(1, Math.ceil(w / contentWidth)) * lineHeight;
    }
    const currentLine = lines[lines.length - 1];
    const cursorX = ctx.measureText(currentLine).width;
    if (contentWidth > 0) {
      visualY += (Math.ceil(cursorX / contentWidth) - 1) * lineHeight;
    }
    const top = borderTop + paddingTop + visualY - ta.scrollTop + lineHeight + 4;
    const left = borderLeft + paddingLeft;
    const menuWidth = Math.min(320, ta.getBoundingClientRect().width);
    return { top, left: Math.max(0, left), width: menuWidth };
  })();

  if (templates.length === 0) {
    return (
      <div className="template-slash-menu" ref={menuRef} style={{ position: 'absolute', top: position.top + 'px', left: position.left + 'px', width: position.width + 'px' }}>
        <div className="template-slash-empty">{t('templates.empty')}</div>
      </div>
    );
  }

  const items = templates.map((template, i) => {
    const preview = template.content.substring(0, 60);
    const displayPreview = preview + (template.content.length > 60 ? "..." : "");

    return (
      <div
        key={template.templateId}
        className={`template-slash-item ${i === selectedIndex ? 'is-selected' : ''}`}
        onMouseDown={e => { e.preventDefault(); onApply(template); }}
        onMouseEnter={() => {}}
      >
        <div className="template-slash-icon"><NoteIcon /></div>
        <div className="template-slash-info">
          <span className="template-slash-name">{template.name}</span>
          {template.title && <span className="template-slash-title">{template.title}</span>}
          <span className="template-slash-preview">{displayPreview}</span>
        </div>
      </div>
    );
  });

  return (
    <div className="template-slash-menu" ref={menuRef} style={{ position: 'absolute', top: position.top + 'px', left: position.left + 'px', width: position.width + 'px' }}>
      <div className="template-slash-header">{t('nav.templates')}</div>
      {items}
    </div>
  );
}
