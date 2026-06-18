import { h, useState, useRef, useEffect, useCallback, useMemo } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import NotesEditorTags from "../tags/NotesEditorTags.jsx";
import NotesEditorFormattingToolbar from './NotesEditorFormattingToolbar.jsx';
import NotesEditorToolbar from './NotesEditorToolbar.jsx';
import NotesEditorImageDropzone from './NotesEditorImageDropzone.jsx';
import NoteLinkPicker from './NoteLinkPicker.jsx';
import BacklinksPanel from './BacklinksPanel.jsx';
import TemplatePicker from '../templates/TemplatePicker.jsx';
import AIPanel from './AIPanel.jsx';
import SlashCommandMenu, { COMMANDS } from './SlashCommandMenu.jsx';
import renderMarkdown from '../../commons/utils/renderMarkdown.js';
import navigateTo from '../../commons/utils/navigateTo.js';
import NoteDeleteModal from './NoteDeleteModal.jsx';
import { showToast } from '../../commons/components/Toast.jsx';
import { closeModal, openModal } from '../../commons/components/Modal.jsx';
import { useNotes } from "../../commons/contexts/NotesContext.jsx";
import { useAppContext, AppProvider } from '../../commons/contexts/AppContext.jsx';
import { NotesProvider } from "../../commons/contexts/NotesContext.jsx";
import NotesEditorModal from './NotesEditorModal.jsx';
import { BrainCircuitIcon } from '../../commons/components/Icon.jsx';
import { useLayout } from '../../commons/contexts/LayoutContext.jsx';
import { useVisibleHeadings } from "./useVisibleHeadings.js";
import useEditorKeyboardShortcuts from "./useEditorKeyboardShortcuts.js";
import useImageUpload from "./useImageUpload.js";
import useMarkdownFormatter from "./useMarkdownFormatter.js";
import "./NotesEditor.css";
import { t } from "../../commons/i18n/index.js";

export default function NotesEditor({ isNewNote, isModal, isExpandable = false, onClose, onEditModeChange = () => {}, onContentChange = () => {}, onSaved = () => {}, onToggleToc }) {
  const { selectedNote, handleNoteChange, patchNote, handlePinToggle } = useNotes();
  const { refreshTags } = useAppContext();
  const { isEditorExpanded, toggleEditorExpanded } = useLayout();

  if (!isNewNote && selectedNote === null) {
    return null;
  }

  // ─── State ───
  const [isEditable, setIsEditable] = useState(isNewNote);
  const [title, setTitle] = useState(selectedNote?.title || "");
  const [content, setContent] = useState(selectedNote?.content || "");
  const [tags, setTags] = useState(selectedNote?.tags || []);
  const [isSaveLoading, setIsSaveLoading] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkPickerPos, setLinkPickerPos] = useState(null); // { lineStart, cursorX, cursorY } for slash command context
  const [backlinks, setBacklinks] = useState([]);
  const [isBacklinksLoading, setIsBacklinksLoading] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const aiSavedSelection = useRef(null); // { start, end } saved before opening AI panel
  const [slashMenu, setSlashMenu] = useState(null); // { query, selectedIndex }
  const skipSlashCheck = useRef(false);
  const pendingCursorPos = useRef(null); // { start, end } to restore after re-render
  const lastCtrlPress = useRef(0); // for double-Ctrl detection

  // ─── Refs ───
  const titleRef = useRef(null);
  const textareaRef = useRef(null);
  const contentRef = useRef(null);
  const savedNoteRef = useRef(null);

  // ─── Hooks ───

  // Restore pending cursor position after re-render (controlled textarea resets cursor on setContent)
  useEffect(() => {
    if (pendingCursorPos.current && textareaRef.current) {
      const { start, end } = pendingCursorPos.current;
      textareaRef.current.selectionStart = start;
      textareaRef.current.selectionEnd = end;
      textareaRef.current.focus();
      // Clear after delay to handle multiple re-renders from onContentChange
      const pos = pendingCursorPos.current;
      setTimeout(() => { if (pendingCursorPos.current === pos) pendingCursorPos.current = null; }, 200);
    }
  });
  const visibleHeadings = useVisibleHeadings(contentRef, content, isEditable, isEditorExpanded);

  const { insertAtCursor, applyMarkdownFormat } = useMarkdownFormatter({
    textareaRef,
    setContent
  });

  const {
    isDraggingOver,
    attachments,
    fileInputRef,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleImageDrop,
    handleDropzoneClick,
    handleFileInputChange,
    resetAttachments
  } = useImageUpload({ insertAtCursor });

  // ─── Effects ───
  useEffect(() => {
    onEditModeChange(isEditable);
  }, [isEditable, onEditModeChange]);

  useEffect(() => {
    handleTextAreaHeight();
  }, [content, isEditable]);

  // Sync from selectedNote when switching to a different note or content changes externally
  useEffect(() => {
    if (selectedNote) {
      setTitle(selectedNote.title || "");
      setContent(selectedNote.content || "");
      setTags(selectedNote.tags || []);
    }
  }, [selectedNote?.noteId, selectedNote?.content, selectedNote?.tags]);

  useEffect(() => {
    if (isNewNote === true || (isEditable === true && titleRef.current?.textContent === "")) {
      titleRef.current?.focus();
    }
    if (isNewNote !== true) {
      document.title = title === "" ? "Zen" : title;
    }
  }, []);

  // Auto focus editor textarea whenever entering edit mode
  useEffect(() => {
    if (isEditable) {
      setTimeout(() => {
        const container = document.querySelector('.notes-editor-container');
        const savedTop = container ? container.scrollTop : null;
        try { handleTextAreaHeight(); } catch {}
        const ta = textareaRef.current;
        if (ta && typeof ta.focus === 'function') {
          try {
            ta.focus({ preventScroll: true });
            ta.selectionStart = 0;
            ta.selectionEnd = 0;
          } catch {}
          if (container != null && savedTop != null) {
            try { container.scrollTop = savedTop; } catch {}
          }
          return;
        }
        const tt = titleRef.current;
        if (tt && typeof tt.focus === 'function') {
          try {
            tt.focus({ preventScroll: true });
            const sel = window.getSelection && window.getSelection();
            if (sel && typeof sel.removeAllRanges === 'function') {
              sel.removeAllRanges();
              const range = document.createRange();
              if (!tt.firstChild) tt.appendChild(document.createTextNode(''));
              range.setStart(tt.firstChild, 0);
              range.collapse(true);
              sel.addRange(range);
            }
          } catch {}
          if (container != null && savedTop != null) {
            try { container.scrollTop = savedTop; } catch {}
          }
        }
      }, 0);
    }
  }, [isEditable]);

  // Fetch backlinks when note changes
  useEffect(() => {
    if (!isNewNote && selectedNote?.noteId) {
      setIsBacklinksLoading(true);
      ApiClient.getBacklinks(selectedNote.noteId)
        .then(data => {
          setBacklinks(Array.isArray(data) ? data : []);
        })
        .catch(() => setBacklinks([]))
        .finally(() => setIsBacklinksLoading(false));
    } else {
      setBacklinks([]);
    }
  }, [selectedNote?.noteId, isNewNote]);

  // Setup anchor links after markdown is rendered
  useEffect(() => {
    if (!isEditable && contentRef.current) {
      setTimeout(() => {
        if (window.setupAnchorLinks) {
          window.setupAnchorLinks(contentRef.current);
        }
      }, 0);
    }
  }, [content, isEditable]);

  // ─── Handlers ───
  function handleTextAreaHeight() {
    if (textareaRef.current === null) return;
    const textarea = textareaRef.current;
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }

  function handleShowLinkPicker() {
    if (textareaRef.current) {
      const v = textareaRef.current.value;
      setContent(v);
      onContentChange(v);
    }
    pendingCursorPos.current = null;
    setLinkPickerPos(null);
    setShowLinkPicker(true);
  }

  function handleInsertInternalLink(link) {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const editorContainer = document.querySelector('.notes-editor-container');
      const savedScrollTop = editorContainer ? editorContainer.scrollTop : null;
      const startPos = textarea.selectionStart;
      const endPos = textarea.selectionEnd;
      const beforeText = textarea.value.substring(0, startPos);
      const afterText = textarea.value.substring(endPos);
      setContent(beforeText + link + afterText);
      onContentChange(beforeText + link + afterText);
      requestAnimationFrame(() => {
        textarea.focus({ preventScroll: true });
        const newPos = startPos + link.length;
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
        requestAnimationFrame(() => {
          if (editorContainer && savedScrollTop !== null) {
            editorContainer.scrollTop = savedScrollTop;
          }
        });
      });
    }
    setShowLinkPicker(false);
  }

  function handleOpenAI() {
    // Save current textarea selection before AI panel takes focus
    if (textareaRef.current) {
      aiSavedSelection.current = {
        start: textareaRef.current.selectionStart,
        end: textareaRef.current.selectionEnd,
      };
    }
    setShowAIModal(true);
  }

  function handleAIInsert(text) {
    if (textareaRef.current) {
      const ta = textareaRef.current;
      const pos = ta.selectionStart;
      const before = ta.value.substring(0, pos);
      const after = ta.value.substring(ta.selectionEnd);
      const newContent = before + text + after;
      setContent(newContent);
      onContentChange(newContent);
    }
    setShowAIModal(false);
  }

  function handleAIReplace(text) {
    // Replace selected text (saved when AI panel opened) with AI result
    const sel = aiSavedSelection.current;
    if (textareaRef.current && sel && sel.start !== sel.end) {
      const ta = textareaRef.current;
      const before = ta.value.substring(0, sel.start);
      const after = ta.value.substring(sel.end);
      const newContent = before + text + after;
      setContent(newContent);
      onContentChange(newContent);
      pendingCursorPos.current = { start: sel.start + text.length, end: sel.start + text.length };
    } else {
      // No selection — replace entire content
      setContent(text);
      onContentChange(text);
    }
    aiSavedSelection.current = null;
    setShowAIModal(false);
    setTimeout(() => { if (textareaRef.current) textareaRef.current.focus(); }, 50);
  }

  // ─── Slash Commands ───
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
          const header = '| ' + Array.from({ length: cols }, () => 'Header').join(' | ') + ' |';
          const sep = '| ' + Array.from({ length: cols }, () => '------').join(' | ') + ' |';
          const body = Array.from({ length: rows }, () => '| ' + Array.from({ length: cols }, () => '  ').join(' | ') + ' |').join('\n');
          executeSlashCommand({ insert: () => header + '\n' + sep + '\n' + body });
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
        const cleaned = before + after;
        pendingCursorPos.current = { start: lineStart, end: lineStart };
        setContent(cleaned);
        onContentChange(cleaned);
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
    setSlashMenu(null);
    skipSlashCheck.current = true;

    if (cmd.action === 'link') {
      // Select the /command text and replace with empty (preserves undo)
      ta.setSelectionRange(lineStart, pos);
      document.execCommand('insertText', false, '');
      syncContentFromTextarea();
      setTimeout(() => { handleShowLinkPicker(); skipSlashCheck.current = false; }, 50);
      return;
    }
    if (cmd.action === 'template') {
      ta.setSelectionRange(lineStart, pos);
      document.execCommand('insertText', false, '');
      syncContentFromTextarea();
      setTimeout(() => { setShowTemplatePicker(true); skipSlashCheck.current = false; }, 50);
      return;
    }
    if (cmd.format) {
      // Select the /command text, remove it, then apply format
      ta.setSelectionRange(lineStart, pos);
      document.execCommand('insertText', false, '');
      syncContentFromTextarea();
      setTimeout(() => {
        if (textareaRef.current) {
          applyMarkdownFormat(cmd.format);
          skipSlashCheck.current = false;
        }
      }, 0);
    } else if (cmd.insert) {
      const insertText = cmd.insert();
      const cursorOff = cmd.cursorOffset !== undefined ? cmd.cursorOffset : insertText.length;
      const finalText = cmd.postInsert ? insertText.substring(0, cursorOff) + cmd.postInsert + insertText.substring(cursorOff) : insertText;
      const finalCursorOff = cmd.postInsert ? cursorOff + cmd.postInsert.length + (cmd.cursorAfterPost || 0) : cursorOff;
      // Select the /command text and replace with insertText (preserves undo)
      ta.setSelectionRange(lineStart, pos);
      document.execCommand('insertText', false, finalText);
      syncContentFromTextarea();
      // Set cursor position
      pendingCursorPos.current = { start: lineStart + finalCursorOff, end: lineStart + finalCursorOff };
      setTimeout(() => { skipSlashCheck.current = false; }, 50);
    }
  }

  // Sync Preact state from textarea DOM value (after execCommand changes it)
  function syncContentFromTextarea() {
    if (textareaRef.current) {
      const v = textareaRef.current.value;
      setContent(v);
      onContentChange(v);
    }
  }

  const handleSaveClick = useCallback((closeAfter = false) => {
    const currentTitle = titleRef.current?.textContent || "";
    const currentContent = textareaRef.current?.value || content;
    const note = { title: currentTitle, content: currentContent, tags };
    setTitle(currentTitle);
    setContent(currentContent);
    onContentChange(currentContent);
    setIsSaveLoading(true);

    const promise = isNewNote
      ? ApiClient.createNote(note)
      : ApiClient.updateNote(selectedNote.noteId, note);

    promise
      .then(savedNote => {
        savedNoteRef.current = savedNote;
        setContent(savedNote.content || "");
        setTitle(savedNote.title || "");
        if (closeAfter) setIsEditable(false);
        resetAttachments();
        if (closeAfter && isNewNote && !onClose) navigateTo(`/notes/${savedNote.noteId}`, true);
        patchNote(savedNote.noteId, { title: savedNote.title, content: savedNote.content, snippet: savedNote.snippet, tags: savedNote.tags });
        refreshTags();
        onSaved(savedNote);
      })
      .finally(() => setIsSaveLoading(false));
  }, [tags, isNewNote, selectedNote, patchNote, resetAttachments]);

  const handleSaveAndCloseClick = useCallback(() => handleSaveClick(true), [handleSaveClick]);

  function handleEditClick() {
    const latest = selectedNote;
    savedNoteRef.current = latest;
    setTitle(latest?.title || "");
    setContent(latest?.content || "");
    setTags(latest?.tags || []);
    setIsEditable(true);
  }

  function handleCloseClick() {
    if (onClose) onClose(); else navigateTo("/", true);
  }

  function handleExpandToggleClick() {
    if (isExpandable !== true) return;
    toggleEditorExpanded();
  }

  const { handleKeyDown } = useEditorKeyboardShortcuts({
    isEditable, isModal, isExpanded: isEditorExpanded, isExpandable, textareaRef,
    onSave: () => handleSaveClick(false),
    onSaveAndClose: () => handleSaveClick(true),
    onEdit: handleEditClick,
    onClose: handleCloseClick,
    onExpandToggle: handleExpandToggleClick,
    onInsertAtCursor: insertAtCursor,
    onFormatText: applyMarkdownFormat,
    onInsertInternalLink: handleShowLinkPicker
  });

  function handleEditCancelClick() {
    if (isNewNote) {
      if (onClose) onClose(); else navigateTo("/", true);
    } else {
      const latest = savedNoteRef.current || selectedNote;
      setTitle(latest?.title || "");
      setContent(latest?.content || "");
      onContentChange(latest?.content || "");
      setTags(latest?.tags || []);
      setIsEditable(false);
    }
  }

  function handleTitleChange(e) {
    setTitle(e.target.textContent);
  }

  function handleAddTag(tag) {
    setTags(prev => [...prev, tag]);
  }

  function handleRemoveTag(tag) {
    setTags(prev => prev.filter(t => t.tagId !== tag.tagId));
  }

  function handleDeleteClick() {
    openModal(
      <NoteDeleteModal
        onDeleteClick={handleDeleteConfirmClick}
        onCloseClick={() => closeModal()}
      />
    );
  }

  function handleDeleteConfirmClick() {
    ApiClient.deleteNote(selectedNote.noteId).then(() => {
      closeModal();
      handleNoteChange();
      if (onClose) onClose(); else navigateTo("/", true);
    });
  }

  function handleArchiveClick() {
    ApiClient.archiveNote(selectedNote.noteId).then(() => {
      showToast(t('notes.toast.archived'));
      handleNoteChange();
    });
  }

  function handleUnarchiveClick() {
    ApiClient.unarchiveNote(selectedNote.noteId).then(() => {
      showToast(t('notes.toast.unarchived'));
      handleNoteChange();
    });
  }

  function handleRestoreClick() {
    ApiClient.restoreNote(selectedNote.noteId).then(() => handleNoteChange());
  }

  function handleInternalNoteLinkClick(e) {
    const link = e.target.closest('a[data-note-id]');
    if (link === null) return;
    e.preventDefault();
    const noteId = link.getAttribute('data-note-id');
    ApiClient.getNoteById(noteId).then(note => {
      openModal(
        <AppProvider><NotesProvider><NotesEditorModal note={note} /></NotesProvider></AppProvider>,
        '.note-modal-root'
      );
    });
  }

  function handlePinToggleClick() {
    if (handlePinToggle && selectedNote) handlePinToggle(selectedNote.noteId, selectedNote.isPinned);
  }

  function handleTemplateApply(templateTitle, templateContent, templateTags) {
    if (templateTitle && templateTitle.trim() !== "") setTitle(templateTitle);
    setContent(templateContent);
    onContentChange(templateContent);
    if (templateTags && templateTags.length > 0) setTags(templateTags);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = templateContent.length;
        textareaRef.current.selectionEnd = templateContent.length;
      }
    }, 0);
  }

  // ─── Memoized rendered content ───
  const renderedContent = useMemo(() => {
    if (isEditable || (title === "" && content === "")) return null;
    return renderMarkdown(content, { anchorPrefix: selectedNote ? `n${selectedNote.noteId}-` : '' });
  }, [content, isEditable, title, selectedNote?.noteId]);

  // ─── Selection Highlight (gray overlay when AI panel is open) ───
  function SelectionHighlight({ textareaRef: taRef, selection }) {
    const [rects, setRects] = useState([]);

    useEffect(() => {
      const ta = taRef.current;
      if (!ta || !selection) return;

      const style = window.getComputedStyle(ta);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const borderTop = parseFloat(style.borderTopWidth) || 0;
      const taRect = ta.getBoundingClientRect();

      const text = ta.value;
      const selStart = selection.start;
      const selEnd = selection.end;
      const textBefore = text.substring(0, selStart);
      const selectedText = text.substring(selStart, selEnd);

      const linesBefore = textBefore.split('\n');
      const selectedLines = selectedText.split('\n');

      const highlightRects = [];
      for (let i = 0; i < selectedLines.length; i++) {
        const lineIdx = linesBefore.length - 1 + i;
        const lineY = paddingTop + lineIdx * lineHeight - ta.scrollTop;

        let lineStartX, lineEndX;
        if (i === 0) {
          lineStartX = ctx.measureText(linesBefore[linesBefore.length - 1]).width;
          lineEndX = lineStartX + ctx.measureText(selectedLines[0]).width;
        } else {
          lineStartX = 0;
          lineEndX = ctx.measureText(selectedLines[i]).width;
        }

        // Handle last line where selEnd might be mid-line
        if (i === selectedLines.length - 1 && selectedLines.length > 1) {
          lineEndX = ctx.measureText(selectedLines[i]).width;
        }

        highlightRects.push({
          x: borderLeft + lineStartX - ta.scrollLeft,
          y: borderTop + lineY,
          w: lineEndX - lineStartX,
          h: lineHeight,
        });
      }

      setRects(highlightRects);
    }, [taRef, selection]);

    if (rects.length === 0) return null;

    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}>
        {rects.map((r, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: r.x + 'px',
            top: r.y + 'px',
            width: r.w + 'px',
            height: r.h + 'px',
            background: 'rgba(128, 128, 128, 0.2)',
            borderRadius: '2px',
          }} />
        ))}
      </div>
    );
  }

  // ─── Content Area ───
  let contentArea = null;
  if (isEditable) {
    const filteredSlashCommands = slashMenu ? COMMANDS.filter(cmd => {
      const q = slashMenu.query.toLowerCase();
      return cmd.id.includes(q) || cmd.label().toLowerCase().includes(q);
    }) : [];

    contentArea = (
      <div style={{ position: 'relative' }}>
        <textarea
          className="notes-editor-textarea"
          placeholder={t('notes.editor.placeholder')}
          spellCheck="false"
          ref={textareaRef}
          value={content}
          onInput={e => {
            const v = e.target.value;
            setContent(v);
            onContentChange(v);
            handleTextAreaHeight(e);
            handleTextareaInput(e);
            pendingCursorPos.current = null;
          }}
          onKeyDown={e => {
            // Double Ctrl detection: activate AI assistant
            if (e.key === 'Control' && !e.shiftKey && !e.altKey && !e.metaKey && !e.repeat) {
              const now = Date.now();
              if (now - lastCtrlPress.current < 400) {
                e.preventDefault();
                lastCtrlPress.current = 0;
                handleOpenAI();
                return;
              }
              lastCtrlPress.current = now;
              return;
            }
            if (handleSlashKeyDown(e)) return;
          }}
          onBlur={e => { const v = e.target.value; setContent(v); onContentChange(v); }}
          style={{ position: 'relative', zIndex: 1 }}
        />
        {showAIModal && aiSavedSelection.current && aiSavedSelection.current.start !== aiSavedSelection.current.end && (
          <SelectionHighlight textareaRef={textareaRef} selection={aiSavedSelection.current} />
        )}
        {slashMenu && filteredSlashCommands.length > 0 && (
          <SlashCommandMenu
            query={slashMenu.query}
            selectedIndex={slashMenu.selectedIndex}
            textareaRef={textareaRef}
            onSelect={executeSlashCommand}
            onAction={action => {
              // Remove the /command text from content, save cursor pos for picker
              let savedLineStart = 0;
              if (textareaRef.current) {
                const ta = textareaRef.current;
                const val = ta.value;
                const pos = ta.selectionStart;
                savedLineStart = val.lastIndexOf('\n', pos - 1) + 1;
                const before = val.substring(0, savedLineStart);
                const after = val.substring(pos);
                skipSlashCheck.current = true;
                setContent(before + after);
                onContentChange(before + after);
                // Restore cursor position after state update
                requestAnimationFrame(() => {
                  if (textareaRef.current) {
                    textareaRef.current.selectionStart = savedLineStart;
                    textareaRef.current.selectionEnd = savedLineStart;
                  }
                });
              }
              setSlashMenu(null);
              if (action === 'link') {
                setLinkPickerPos(savedLineStart);
                setShowLinkPicker(true);
                skipSlashCheck.current = false;
              }
              if (action === 'template') {
                setShowTemplatePicker(true);
                skipSlashCheck.current = false;
              }
            }}
          />
        )}
        {showLinkPicker && (
          <NoteLinkPicker onInsertLink={handleInsertInternalLink} onClose={() => setShowLinkPicker(false)} textareaRef={textareaRef} cursorPos={linkPickerPos} />
        )}
      </div>
    );
  } else if (title === "" && content === "") {
    contentArea = <div className="notes-editor-empty-text">{t('notes.editor.empty')}</div>;
  } else {
    contentArea = (
      <div className="notes-editor-rendered" ref={contentRef}
        dangerouslySetInnerHTML={{ __html: renderedContent }}
        onClick={handleInternalNoteLinkClick}
      />
    );
  }

  const showImageDropzone = isEditable === true;
  const showTemplatePicker = isNewNote === true && isEditable === true && title === "" && content === "";

  // ─── Render ───
  return (
    <div className="notes-editor" tabIndex="0" onPaste={handlePaste}>
      <NotesEditorToolbar
        note={selectedNote}
        isNewNote={isNewNote}
        isEditable={isEditable}
        isModal={isModal}
        isSaveLoading={isSaveLoading}
        isExpanded={isEditorExpanded}
        isExpandable={isExpandable}
        onSaveClick={handleSaveClick}
        onSaveAndCloseClick={handleSaveAndCloseClick}
        onEditClick={handleEditClick}
        onEditCancelClick={handleEditCancelClick}
        onCloseClick={handleCloseClick}
        onDeleteClick={handleDeleteClick}
        onArchiveClick={handleArchiveClick}
        onUnarchiveClick={handleUnarchiveClick}
        onRestoreClick={handleRestoreClick}
        onExpandToggleClick={handleExpandToggleClick}
        onPinClick={handlePinToggleClick}
        onUnpinClick={handlePinToggleClick}
        onToggleToc={onToggleToc}
      />
      <div className="notes-editor-header">
        <div className="notes-editor-title" contentEditable={isEditable} ref={titleRef} onBlur={handleTitleChange} dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      <NotesEditorTags tags={tags} isEditable={isEditable} canCreateTag onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} />
      {showImageDropzone && (
        <NotesEditorImageDropzone
          isDraggingOver={isDraggingOver}
          attachments={attachments}
          fileInputRef={fileInputRef}
          handleImageDrop={handleImageDrop}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDropzoneClick={handleDropzoneClick}
          handleFileInputChange={handleFileInputChange}
        />
      )}
      <NotesEditorFormattingToolbar isEditable={isEditable} onFormat={applyMarkdownFormat} onInsertInternalLink={handleShowLinkPicker} onOpenAI={handleOpenAI} />
      {showAIModal && (
        <AIPanel
          fullContent={content}
          selectedText={textareaRef.current ? textareaRef.current.value.substring(textareaRef.current.selectionStart, textareaRef.current.selectionEnd) : ""}
          messages={aiMessages}
          setMessages={setAiMessages}
          onInsert={handleAIInsert}
          onReplace={handleAIReplace}
          onClose={() => { setShowAIModal(false); setTimeout(() => { if (textareaRef.current) textareaRef.current.focus(); }, 50); }}
        />
      )}
      {isEditable && !showAIModal && (
        <button type="button" className="ai-fab" onClick={handleOpenAI} title={t('notes.toolbar.ai')}>
          <BrainCircuitIcon />
        </button>
      )}
      <div className="notes-editor-content">
        {contentArea}
      </div>
      {showTemplatePicker && <TemplatePicker onTemplateApply={handleTemplateApply} />}
      {!isNewNote && !isEditable && (backlinks.length > 0 || isBacklinksLoading) && (
        <BacklinksPanel backlinks={backlinks} isLoading={isBacklinksLoading} />
      )}
    </div>
  );
}