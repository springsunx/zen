import { useState, useRef } from "../../assets/preact.esm.js";
import { COMMANDS, generateTable } from './SlashCommandMenu.jsx';

export default function useSlashCommands({ textareaRef, updateContent, pendingCursorPos, onLinkPicker, onTemplatePicker }) {
  const [slashMenu, setSlashMenu] = useState(null); // { query, selectedIndex }
  const skipSlashCheck = useRef(false);
  const slashUndoStack = useRef([]); // custom undo stack: [{content, pos}]

  function handleTextareaInput(e) {
    if (skipSlashCheck.current) return;
    const ta = e.target;
    const val = ta.value;
    const pos = ta.selectionStart;
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
    const lineText = val.substring(lineStart, pos);
    const slashMatch = lineText.match(/^\/([a-z0-9]*)$/);
    if (slashMatch) {
      setSlashMenu({ query: slashMatch[1], selectedIndex: 0 });
    } else {
      setSlashMenu(null);
    }
  }

  function handleSlashKeyDown(e) {
    if (!slashMenu) return false;
    const filtered = COMMANDS.filter(cmd => {
      const q = slashMenu.query.toLowerCase();
      return cmd.id.includes(q) || cmd.label().toLowerCase().includes(q);
    });
    if (filtered.length === 0) { setSlashMenu(null); return false; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlashMenu(prev => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % filtered.length }));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlashMenu(prev => ({ ...prev, selectedIndex: (prev.selectedIndex - 1 + filtered.length) % filtered.length }));
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const cmd = filtered[slashMenu.selectedIndex];
      if (cmd) {
        // Tab on table command: focus the inline row input instead of executing
        if (e.key === 'Tab' && cmd.hasForm) {
          const rowsInput = document.querySelector('.slash-command-menu .table-row-input');
          if (rowsInput) { rowsInput.focus(); return true; }
        }
        // Enter on table command: read values from inline inputs and generate
        if (e.key === 'Enter' && cmd.hasForm) {
          const rowsInput = document.querySelector('.slash-command-menu .table-row-input');
          const colsInput = document.querySelector('.slash-command-menu .table-col-input');
          const rows = rowsInput ? Math.max(1, Math.min(20, parseInt(rowsInput.value) || 3)) : 3;
          const cols = colsInput ? Math.max(1, Math.min(10, parseInt(colsInput.value) || 3)) : 3;
          executeSlashCommand({ insert: () => generateTable(rows, cols) });
          return true;
        }
        executeSlashCommand(cmd);
      }
      return true;
    }
    // Space after exact match → execute directly
    if (e.key === ' ') {
      const exact = COMMANDS.find(cmd => cmd.id === slashMenu.query.toLowerCase());
      if (exact) {
        e.preventDefault();
        executeSlashCommand(exact);
        return true;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // Remove the /command text from content
      if (textareaRef.current) {
        const ta = textareaRef.current;
        const val = ta.value;
        const pos = ta.selectionStart;
        const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
        const before = val.substring(0, lineStart);
        const after = val.substring(pos);
        pendingCursorPos.current = { start: lineStart, end: lineStart };
        updateContent(before + after);
      }
      setSlashMenu(null);
      return true;
    }
    return false;
  }

  function executeSlashCommand(cmd) {
    const ta = textareaRef.current;
    if (!ta) return;
    const val = ta.value;
    const pos = ta.selectionStart;
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
    // Save state for custom undo
    slashUndoStack.current.push({ content: val, pos: pos });
    if (slashUndoStack.current.length > 100) slashUndoStack.current.shift();
    skipSlashCheck.current = true;

    if (cmd.action === 'link') {
      setSlashMenu(null);
      const before = val.substring(0, lineStart);
      const after = val.substring(pos);
      updateContent(before + after);
      pendingCursorPos.current = { start: lineStart, end: lineStart };
      setTimeout(() => { onLinkPicker(); skipSlashCheck.current = false; }, 50);
      return;
    }
    if (cmd.action === 'template') {
      setSlashMenu(null);
      const before = val.substring(0, lineStart);
      const after = val.substring(pos);
      updateContent(before + after);
      pendingCursorPos.current = { start: lineStart, end: lineStart };
      setTimeout(() => { onTemplatePicker(); skipSlashCheck.current = false; }, 50);
      return;
    }
    if (cmd.format) {
      const formatPrefixMap = {
        'h1': { text: '# ', cursor: 2 },
        'h2': { text: '## ', cursor: 3 },
        'h3': { text: '### ', cursor: 4 },
        'ul': { text: '- ', cursor: 2 },
        'ol': { text: '1. ', cursor: 3 },
        'todo': { text: '- [ ] ', cursor: 6 },
        'quote': { text: '> ', cursor: 2 },
        'codeblock': { text: '```\n\n```', cursor: 4 },
        'hr': { text: '\n---\n', cursor: 5 },
      };
      const fmt = formatPrefixMap[cmd.format];
      if (!fmt) return;
      const newVal = val.substring(0, lineStart) + fmt.text + val.substring(pos);
      updateContent(newVal);
      setSlashMenu(null);
      pendingCursorPos.current = { start: lineStart + fmt.cursor, end: lineStart + fmt.cursor };
      setTimeout(() => { skipSlashCheck.current = false; }, 50);
    } else if (cmd.insert) {
      const insertText = cmd.insert();
      const cursorOff = cmd.cursorOffset !== undefined ? cmd.cursorOffset : insertText.length;
      const finalText = cmd.postInsert ? insertText.substring(0, cursorOff) + cmd.postInsert + insertText.substring(cursorOff) : insertText;
      const finalCursorOff = cmd.postInsert ? cursorOff + cmd.postInsert.length + (cmd.cursorAfterPost || 0) : cursorOff;
      const newVal = val.substring(0, lineStart) + finalText + val.substring(pos);
      updateContent(newVal);
      setSlashMenu(null);
      pendingCursorPos.current = { start: lineStart + finalCursorOff, end: lineStart + finalCursorOff };
      setTimeout(() => { skipSlashCheck.current = false; }, 50);
    }
  }

  function handleSlashUndo(e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      if (slashUndoStack.current.length > 0) {
        e.preventDefault();
        const state = slashUndoStack.current.pop();
        updateContent(state.content);
        pendingCursorPos.current = { start: state.pos, end: state.pos };
        return true;
      }
    }
    return false;
  }

  // Filtered commands for rendering
  const filteredCommands = slashMenu ? COMMANDS.filter(cmd => {
    const q = slashMenu.query.toLowerCase();
    return cmd.id.includes(q) || cmd.label().toLowerCase().includes(q);
  }) : [];

  return {
    slashMenu,
    setSlashMenu,
    skipSlashCheck,
    filteredCommands,
    handleTextareaInput,
    handleSlashKeyDown,
    executeSlashCommand,
    handleSlashUndo,
  };
}
