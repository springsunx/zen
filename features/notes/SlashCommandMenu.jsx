import { h, useRef, useEffect, useState } from "../../assets/preact.esm.js"
import { Heading1Icon, Heading2Icon, Heading3Icon, CodeBlockIcon, CodeIcon, ListTodoIcon, TableIcon, LinkIcon, NoteIcon, ListIcon, ListOrderedIcon, QuoteIcon, AlertTriangleIcon, InfoIcon, LightbulbIcon, ShieldAlertIcon, FlameIcon, HistoryIcon } from '../../commons/components/Icon.jsx';
import { t } from "../../commons/i18n/index.js";
import "./SlashCommandMenu.css";

const COMMANDS = [
  { id: 'date', group: 'dateTime', icon: NoteIcon, insert: () => formatCurrentDate(), label: () => t('slash.date'), desc: () => t('slash.date.desc') },
  { id: 'time', group: 'dateTime', icon: HistoryIcon, insert: () => formatCurrentTime(), label: () => t('slash.time'), desc: () => t('slash.time.desc') },
  { id: 'h1', group: 'headings', icon: Heading1Icon, format: 'h1', label: () => t('slash.h1'), desc: () => t('slash.h1.desc') },
  { id: 'h2', group: 'headings', icon: Heading2Icon, format: 'h2', label: () => t('slash.h2'), desc: () => t('slash.h2.desc') },
  { id: 'h3', group: 'headings', icon: Heading3Icon, format: 'h3', label: () => t('slash.h3'), desc: () => t('slash.h3.desc') },
  { id: 'l1', group: 'lists', icon: ListIcon, format: 'ul', label: () => t('slash.bullet'), desc: () => t('slash.bullet.desc') },
  { id: 'l2', group: 'lists', icon: ListOrderedIcon, format: 'ol', label: () => t('slash.numbered'), desc: () => t('slash.numbered.desc') },
  { id: 'l3', group: 'lists', icon: ListTodoIcon, format: 'todo', label: () => t('slash.task'), desc: () => t('slash.task.desc') },
  { id: 'code', group: 'blocks', icon: CodeBlockIcon, format: 'codeblock', label: () => t('slash.code'), desc: () => t('slash.code.desc') },
  { id: 'quote', group: 'blocks', icon: QuoteIcon, format: 'quote', label: () => t('slash.quote'), desc: () => t('slash.quote.desc') },
  { id: 'table', group: 'blocks', icon: TableIcon, hasForm: true, label: () => t('slash.table'), desc: () => t('slash.table.desc') },
  { id: 'v1', group: 'callouts', icon: InfoIcon, insert: () => '> [!note]\n> ', cursorOffset: 12, label: () => t('slash.note'), desc: () => t('slash.note.desc') },
  { id: 'v2', group: 'callouts', icon: ShieldAlertIcon, insert: () => '> [!important]\n> ', cursorOffset: 17, label: () => t('slash.important'), desc: () => t('slash.important.desc') },
  { id: 'v3', group: 'callouts', icon: LightbulbIcon, insert: () => '> [!tip]\n> ', cursorOffset: 11, label: () => t('slash.tip'), desc: () => t('slash.tip.desc') },
  { id: 'v4', group: 'callouts', icon: AlertTriangleIcon, insert: () => '> [!warning]\n> ', cursorOffset: 15, label: () => t('slash.warning'), desc: () => t('slash.warning.desc') },
  { id: 'v5', group: 'callouts', icon: FlameIcon, insert: () => '> [!caution]\n> ', cursorOffset: 15, label: () => t('slash.caution'), desc: () => t('slash.caution.desc') },
  { id: 'link', group: 'insert', icon: LinkIcon, action: 'link', label: () => t('slash.link'), desc: () => t('slash.link.desc') },
  { id: 'template', group: 'insert', icon: NoteIcon, action: 'template', label: () => t('slash.template'), desc: () => t('slash.template.desc') },
];

const COMMAND_GROUPS = [
  { id: 'dateTime', label: () => t('slash.group.dateTime') },
  { id: 'headings', label: () => t('slash.group.headings') },
  { id: 'lists', label: () => t('slash.group.lists') },
  { id: 'blocks', label: () => t('slash.group.blocks') },
  { id: 'callouts', label: () => t('slash.group.callouts') },
  { id: 'insert', label: () => t('slash.group.insert') },
];

function padTimeUnit(value) {
  return String(value).padStart(2, '0');
}

function formatCurrentDate(now = new Date()) {
  return `${now.getFullYear()}-${padTimeUnit(now.getMonth() + 1)}-${padTimeUnit(now.getDate())}`;
}

function formatCurrentTime(now = new Date()) {
  return `${padTimeUnit(now.getHours())}:${padTimeUnit(now.getMinutes())}`;
}

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
    const coords = textareaRef.current.getCursorCoords(textareaRef.current.selectionStart);
    return { top: coords.bottom + 4, left: Math.max(0, coords.left), width: Math.min(280, coords.width) };
  })();

  const filtered = COMMANDS.filter(cmd => {
    const q = query.toLowerCase();
    return cmd.id.includes(q) || cmd.label().toLowerCase().includes(q);
  });

  const groupedCommands = COMMAND_GROUPS
    .map(group => ({
      ...group,
      commands: filtered
        .map((cmd, index) => ({ cmd, index }))
        .filter(({ cmd }) => cmd.group === group.id),
    }))
    .filter(group => group.commands.length > 0);

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
      onSelect({ insert: () => text });
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
      {groupedCommands.map(group => (
        <div className="slash-command-group" key={group.id}>
          <div className="slash-command-group-title">{group.label()}</div>
          {group.commands.map(({ cmd, index: i }) => {
        if (cmd.hasForm) {
          // Table command: inline row/col inputs
          return (
            <div
              key={cmd.id}
              className={`slash-command-item ${i === selectedIndex ? 'is-selected' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                const text = generateTable(tableRows, tableCols);
                onSelect({ insert: () => text });
              }}
            >
              <div className="slash-command-icon"><cmd.icon /></div>
              <div className="slash-command-info">
                <div className="slash-command-heading">
                  <span className="slash-command-label">{cmd.label()}</span>
                  <span className="slash-command-token">/{cmd.id}</span>
                </div>
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
              <div className="slash-command-heading">
                <span className="slash-command-label">{cmd.label()}</span>
                <span className="slash-command-token">/{cmd.id}</span>
              </div>
              <span className="slash-command-desc">{cmd.desc()}</span>
            </div>
          </div>
        );
          })}
        </div>
      ))}
    </div>
  );
}

export { COMMANDS, generateTable, formatCurrentDate, formatCurrentTime };
