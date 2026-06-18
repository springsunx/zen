import { h, useRef, useEffect, useState } from "../../assets/preact.esm.js"
import { Heading1Icon, Heading2Icon, Heading3Icon, CodeBlockIcon, CodeIcon, ListTodoIcon, TableIcon, LinkIcon, NoteIcon, ListIcon, ListOrderedIcon, QuoteIcon, AlertTriangleIcon, InfoIcon, LightbulbIcon, ShieldAlertIcon, FlameIcon } from '../../commons/components/Icon.jsx';
import { t } from "../../commons/i18n/index.js";
import "./SlashCommandMenu.css";

const COMMANDS = [
  { id: 'h1', icon: Heading1Icon, format: 'h1', label: () => t('slash.h1'), desc: () => t('slash.h1.desc') },
  { id: 'h2', icon: Heading2Icon, format: 'h2', label: () => t('slash.h2'), desc: () => t('slash.h2.desc') },
  { id: 'h3', icon: Heading3Icon, format: 'h3', label: () => t('slash.h3'), desc: () => t('slash.h3.desc') },
  { id: 'bullet', icon: ListIcon, format: 'ul', label: () => t('slash.bullet'), desc: () => t('slash.bullet.desc') },
  { id: 'numbered', icon: ListOrderedIcon, format: 'ol', label: () => t('slash.numbered'), desc: () => t('slash.numbered.desc') },
  { id: 'task', icon: ListTodoIcon, format: 'todo', label: () => t('slash.task'), desc: () => t('slash.task.desc') },
  { id: 'code', icon: CodeBlockIcon, format: 'codeblock', label: () => t('slash.code'), desc: () => t('slash.code.desc') },
  { id: 'icode', icon: CodeIcon, format: 'code', label: () => t('slash.icode'), desc: () => t('slash.icode.desc') },
  { id: 'quote', icon: QuoteIcon, format: 'quote', label: () => t('slash.quote'), desc: () => t('slash.quote.desc') },
  { id: 'table', icon: TableIcon, hasForm: true, label: () => t('slash.table'), desc: () => t('slash.table.desc') },
  { id: 'v1', icon: InfoIcon, insert: () => '> [!note]\n> ', cursorOffset: 11, label: () => t('slash.note'), desc: () => t('slash.note.desc') },
  { id: 'v2', icon: ShieldAlertIcon, insert: () => '> [!important]\n> ', cursorOffset: 16, label: () => t('slash.important'), desc: () => t('slash.important.desc') },
  { id: 'v3', icon: LightbulbIcon, insert: () => '> [!tip]\n> ', cursorOffset: 10, label: () => t('slash.tip'), desc: () => t('slash.tip.desc') },
  { id: 'v4', icon: AlertTriangleIcon, insert: () => '> [!warning]\n> ', cursorOffset: 14, label: () => t('slash.warning'), desc: () => t('slash.warning.desc') },
  { id: 'v5', icon: FlameIcon, insert: () => '> [!caution]\n> ', cursorOffset: 14, label: () => t('slash.caution'), desc: () => t('slash.caution.desc') },
  { id: 'link', icon: LinkIcon, action: 'link', label: () => t('slash.link'), desc: () => t('slash.link.desc') },
  { id: 'template', icon: NoteIcon, action: 'template', label: () => t('slash.template'), desc: () => t('slash.template.desc') },
];

function generateTable(rows, cols) {
  const header = '| ' + Array.from({ length: cols }, () => 'Header').join(' | ') + ' |';
  const sep = '| ' + Array.from({ length: cols }, () => '------').join(' | ') + ' |';
  const body = Array.from({ length: rows }, () =>
    '| ' + Array.from({ length: cols }, () => '  ').join(' | ') + ' |'
  ).join('\n');
  return header + '\n' + sep + '\n' + body;
}

export default function SlashCommandMenu({ query, onSelect, onAction, selectedIndex, textareaRef }) {
  const menuRef = useRef(null);
  const rowsRef = useRef(null);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

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
    const lineIndex = lines.length - 1;
    const cursorX = ctx.measureText(lines[lineIndex]).width;
    const cursorY = lineIndex * lineHeight;
    const top = borderTop + paddingTop + cursorY - ta.scrollTop + lineHeight + 4;
    const left = borderLeft + paddingLeft + cursorX - ta.scrollLeft;
    const menuWidth = Math.min(280, ta.getBoundingClientRect().width);
    return { top, left: Math.max(0, left), width: menuWidth };
  })();

  const filtered = COMMANDS.filter(cmd => {
    const q = query.toLowerCase();
    return cmd.id.includes(q) || cmd.label().toLowerCase().includes(q);
  });

  // Scroll selected item into view
  useEffect(() => {
    if (!menuRef.current) return;
    const selected = menuRef.current.querySelector('.slash-command-item.is-selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Focus rows input only when user explicitly tabs into table item
  function handleGlobalKeyDown(e) {
    if (e.key === 'Tab') {
      const cmd = filtered[selectedIndex];
      if (cmd && cmd.hasForm && rowsRef.current) {
        e.preventDefault();
        rowsRef.current.focus();
      }
    }
  }

  function handleTableKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = generateTable(tableRows, tableCols);
      onSelect({ insert: () => text, cursorOffset: 0 });
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.target === rowsRef.current) {
        e.target.parentElement.querySelector('.table-col-input')?.focus();
      } else {
        rowsRef.current?.focus();
      }
    }
  }

  if (filtered.length === 0) return null;

  return (
    <div className="slash-command-menu" ref={menuRef} style={{ position: 'absolute', top: position.top + 'px', left: position.left + 'px', width: position.width + 'px' }}>
      {filtered.map((cmd, i) => {
        if (cmd.hasForm) {
          // Table command: inline row/col inputs
          return (
            <div
              key={cmd.id}
              className={`slash-command-item ${i === selectedIndex ? 'is-selected' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                const text = generateTable(tableRows, tableCols);
                onSelect({ insert: () => text, cursorOffset: 0 });
              }}
            >
              <div className="slash-command-icon"><cmd.icon /></div>
              <div className="slash-command-info">
                <span className="slash-command-label">{cmd.label()}</span>
                <div className="slash-command-table-inline" onKeyDown={handleTableKeyDown}>
                  <label>{t('slash.table.rows')}</label>
                  <input
                    ref={rowsRef}
                    type="number"
                    className="table-row-input"
                    min="1"
                    max="20"
                    value={tableRows}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    onInput={e => { e.stopPropagation(); setTableRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1))); }}
                  />
                  <label>{t('slash.table.cols')}</label>
                  <input
                    type="number"
                    className="table-col-input"
                    min="1"
                    max="10"
                    value={tableCols}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    onInput={e => { e.stopPropagation(); setTableCols(Math.max(1, Math.min(10, parseInt(e.target.value) || 1))); }}
                  />
                </div>
              </div>
            </div>
          );
        }
        const IconComp = cmd.icon;
        return (
          <div
            key={cmd.id}
            className={`slash-command-item ${i === selectedIndex ? 'is-selected' : ''}`}
            onMouseDown={e => {
              e.preventDefault();
              if (cmd.action) onAction(cmd.action);
              else onSelect(cmd);
            }}
          >
            <div className="slash-command-icon"><IconComp /></div>
            <div className="slash-command-info">
              <span className="slash-command-label">{cmd.label()}</span>
              <span className="slash-command-desc">{cmd.desc()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { COMMANDS };
