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
    const coords = textareaRef.current.getCursorCoords(textareaRef.current.selectionStart);
    return { top: coords.bottom + 4, left: Math.max(0, coords.left), width: Math.min(320, coords.width) };
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
