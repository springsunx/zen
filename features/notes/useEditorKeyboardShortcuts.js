import { useEffect, useCallback } from "../../assets/preact.esm.js";

function min(a,b){return a<b?a:b;}

export default function useEditorKeyboardShortcuts({
  isEditable,
  isModal,
  isExpanded,
  isExpandable,
  textareaRef,
  onSave,
  onEdit,
  onClose,
  onExpandToggle,
  onInsertAtCursor,
  onFormatText,
  onSaveAndClose,
  onInsertInternalLink
}) {
  const handleKeyDown = useCallback(e => {
    const isTextAreaFocused = document.activeElement.className == "notes-editor-textarea";

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isEditable === true) {
        onSaveAndClose();
      } else {
        onEdit();
      }
    }

    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (isEditable === true) {
        onSave();
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (isModal === true) {
        onClose();
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
      if (isExpandable === true) {
        e.preventDefault();
        onExpandToggle();
      }
    }

    if ((e.metaKey || e.ctrlKey) && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      onInsertInternalLink();
    }

    if (isTextAreaFocused && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      onInsertAtCursor('  ');
    }

    if (isTextAreaFocused && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'h') {
      e.preventDefault();
      onFormatText("highlight");
    }

    if (isTextAreaFocused && (e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      onFormatText("bold");
    }

    if (isTextAreaFocused && (e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      onFormatText("italic");
    }


    // Duplicate current line: Ctrl/Cmd + D
    if (isTextAreaFocused && (e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      const ta = textareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const value = ta.value;
        // Determine current line bounds
        const lineStart = value.lastIndexOf('\n', start - 1) + 1; // when not found -> 0
        const lineEndIdx = value.indexOf('\n', end);
        const effectiveLineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
        const lineText = value.substring(lineStart, effectiveLineEnd);
        // Place caret at end of current line, then insert duplicated line via state updater
        try { ta.selectionStart = ta.selectionEnd = effectiveLineEnd; } catch {}
        const insertion = '\n' + lineText;
        onInsertAtCursor(insertion);
        // Restore caret to same column on the duplicated line in next tick
        const col = start - lineStart;
        const targetCol = Math.min(col, lineText.length);
        setTimeout(() => {
          const t2 = textareaRef.current;
          if (t2) {
            const dupLineStart = effectiveLineEnd + 1; // after inserted '
            const newPos = dupLineStart + targetCol;
            try { t2.selectionStart = t2.selectionEnd = newPos; t2.focus(); } catch {}
          }
        }, 0);
      }
      return;
    }

    if (isTextAreaFocused && e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      const textarea = textareaRef.current;
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = textarea.value.substring(0, cursorPos);
      const lines = textBeforeCursor.split('\n');
      const currentLine = lines[lines.length - 1];

      const listPatterns = [
        /^(\s*)(- \[ \] )/,
        /^(\s*)(- \[x\] )/,
        /^(\s*)(- )/,
        /^(\s*)(\* )/,
        /^(\s*)(\+ )/,
        /^(\s*)(\d+\. )/,
      ];

      for (const pattern of listPatterns) {
        const match = currentLine.match(pattern);
        if (match) {
          e.preventDefault();
          const indentation = match[1];
          let prefix = match[2];
          const lineContent = currentLine.substring(match[0].length);

          // Empty list item: remove the prefix and end the list
          if (lineContent.trim() === "") {
            const lineStart = textBeforeCursor.length - currentLine.length;
            const textBefore = textarea.value.substring(0, lineStart);
            const textAfter = textarea.value.substring(cursorPos);
            const newValue = textBefore + "\n" + textAfter;
            const newCursorPos = lineStart + 1;
            textarea.value = newValue;
            textarea.selectionStart = newCursorPos;
            textarea.selectionEnd = newCursorPos;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }

          if (prefix === "- [x] ") {
            prefix = "- [ ] ";
          }
          else if (/^\d+\. $/.test(prefix)) {
            const num = parseInt(prefix.match(/^(\d+)/)[1]) + 1;
            prefix = `${num}. `;
          }

          const newLineText = `\n${indentation}${prefix}`;
          onInsertAtCursor(newLineText);
          return;
        }
      }
    }
  }, [isEditable, isModal, isExpanded, isExpandable, textareaRef, onSave, onEdit, onClose, onExpandToggle, onInsertAtCursor, onFormatText, onSaveAndClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return { handleKeyDown };
}