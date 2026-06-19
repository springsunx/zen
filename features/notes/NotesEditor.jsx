import { h, useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import NotesEditorTags from "../tags/NotesEditorTags.jsx";
import NotesEditorFormattingToolbar from './NotesEditorFormattingToolbar.jsx';
import NotesEditorToolbar from './NotesEditorToolbar.jsx';
import NotesEditorImageDropzone from './NotesEditorImageDropzone.jsx';
import NoteLinkPicker from './NoteLinkPicker.jsx';
import BacklinksPanel from './BacklinksPanel.jsx';
import TemplatePicker from '../templates/TemplatePicker.jsx';
import AIPanel from './AIPanel.jsx';
import SlashCommandMenu from './SlashCommandMenu.jsx';
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
import useAIPanel from "./useAIPanel.js";
import useSlashCommands from "./useSlashCommands.js";
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
  const [linkPickerPos, setLinkPickerPos] = useState(null);
  const [backlinks, setBacklinks] = useState([]);
  const [isBacklinksLoading, setIsBacklinksLoading] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const pendingCursorPos = useRef(null); // { start, end } to restore after re-render

  // Extract stable values for useEffect dependencies (avoid optional chaining in dep arrays)
  const noteId = selectedNote?.noteId;
  const noteContent = selectedNote?.content;
  const noteTags = selectedNote?.tags;

  // ─── Refs ───
  const titleRef = useRef(null);
  const textareaRef = useRef(null);
  const contentRef = useRef(null);
  const savedNoteRef = useRef(null);

  // ─── Derived state ───
  const lastCtrlPress = useRef(0); // for double-Ctrl detection

  function updateContent(value) {
    setContent(value);
    onContentChange(value);
  }

  // ─── Hooks ───

  // Restore pending cursor position after re-render (controlled textarea resets cursor on setContent)
  // useLayoutEffect runs synchronously before paint to avoid visual flicker.
  // Depends on [content] because setContent triggers the re-render that resets the cursor.
  useLayoutEffect(() => {
    if (pendingCursorPos.current && textareaRef.current) {
      const { start, end } = pendingCursorPos.current;
      textareaRef.current.selectionStart = start;
      textareaRef.current.selectionEnd = end;
      textareaRef.current.focus();
      // Clear after delay to handle multiple re-renders from onContentChange
      const pos = pendingCursorPos.current;
      setTimeout(() => { if (pendingCursorPos.current === pos) pendingCursorPos.current = null; }, 200);
    }
  }, [content]);

  const {
    showAIModal, aiMessages, setAiMessages, aiSavedSelection,
    handleOpenAI, handleAIInsert, handleAIReplace, handleCloseAI,
  } = useAIPanel({ textareaRef, updateContent, pendingCursorPos });

  function handleShowLinkPicker() {
    if (textareaRef.current) {
      const v = textareaRef.current.value;
      updateContent(v);
    }
    pendingCursorPos.current = null;
    setLinkPickerPos(null);
    setShowLinkPicker(true);
  }

  const {
    slashMenu, setSlashMenu, skipSlashCheck, filteredCommands,
    handleTextareaInput, handleSlashKeyDown, executeSlashCommand, handleSlashUndo,
  } = useSlashCommands({
    textareaRef, updateContent, pendingCursorPos,
    onLinkPicker: handleShowLinkPicker,
    onTemplatePicker: () => setShowTemplatePicker(true),
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
  }, [noteId, noteContent, noteTags]);

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
  }, [noteId, isNewNote]);

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

  function handleInsertInternalLink(link) {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const editorContainer = document.querySelector('.notes-editor-container');
      const savedScrollTop = editorContainer ? editorContainer.scrollTop : null;
      const startPos = textarea.selectionStart;
      const endPos = textarea.selectionEnd;
      const beforeText = textarea.value.substring(0, startPos);
      const afterText = textarea.value.substring(endPos);
      updateContent(beforeText + link + afterText);
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

  const handleSaveClick = useCallback((closeAfter = false) => {
    const currentTitle = titleRef.current?.textContent || "";
    const currentContent = textareaRef.current?.value || content;
    const note = { title: currentTitle, content: currentContent, tags };
    setTitle(currentTitle);
    updateContent(currentContent);
    setIsSaveLoading(true);

    // Use savedNoteRef to detect if we already created (prevents duplicate on repeated Ctrl+S)
    const existingNote = savedNoteRef.current;
    const promise = existingNote && existingNote.noteId
      ? ApiClient.updateNote(existingNote.noteId, note)
      : ApiClient.createNote(note);

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
      updateContent(latest?.content || "");
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
      refreshTags();
      if (onClose) onClose(); else navigateTo("/", true);
    });
  }

  function handleArchiveClick() {
    ApiClient.archiveNote(selectedNote.noteId).then(() => {
      showToast(t('notes.toast.archived'));
      handleNoteChange();
      refreshTags();
    });
  }

  function handleUnarchiveClick() {
    ApiClient.unarchiveNote(selectedNote.noteId).then(() => {
      showToast(t('notes.toast.unarchived'));
      handleNoteChange();
      refreshTags();
    });
  }

  function handleRestoreClick() {
    ApiClient.restoreNote(selectedNote.noteId).then(() => {
      handleNoteChange();
      refreshTags();
    });
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
    updateContent(templateContent);
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
    if (!taRef.current || !selection || selection.start === selection.end) return null;
    const ta = taRef.current;
    const text = ta.value;
    const before = text.substring(0, selection.start);
    const selected = text.substring(selection.start, selection.end);
    const after = text.substring(selection.end);

    const style = window.getComputedStyle(ta);
    const overlayStyle = {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 2,
      overflow: 'auto',
      margin: 0,
      padding: style.padding,
      border: style.border,
      font: style.font,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      wordSpacing: style.wordSpacing,
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word',
      boxSizing: 'border-box',
      color: 'transparent',
      background: 'transparent',
    };

    return (
      <pre style={overlayStyle} aria-hidden="true">
        <span>{before}</span>
        <span style={{ background: 'rgba(128, 128, 128, 0.25)', borderRadius: '2px' }}>{selected}</span>
        <span>{after}</span>
      </pre>
    );
  }

  // ─── Content Area ───
  let contentArea = null;
  if (isEditable) {
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
            updateContent(v);
            handleTextAreaHeight(e);
            handleTextareaInput(e);
            if (!skipSlashCheck.current) pendingCursorPos.current = null;
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
            if (handleSlashUndo(e)) return;
          }}
          onBlur={e => { const v = e.target.value; updateContent(v); }}
          style={{ position: 'relative', zIndex: 1 }}
        />
        {showAIModal && aiSavedSelection.current && aiSavedSelection.current.start !== aiSavedSelection.current.end && (
          <SelectionHighlight textareaRef={textareaRef} selection={aiSavedSelection.current} />
        )}
        {slashMenu && filteredCommands.length > 0 && (
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
                updateContent(before + after);
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
  const shouldShowTemplatePicker = showTemplatePicker && isNewNote === true && isEditable === true && title === "" && content === "";

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
          onClose={handleCloseAI}
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
      {shouldShowTemplatePicker && <TemplatePicker onTemplateApply={handleTemplateApply} />}
      {!isNewNote && !isEditable && (backlinks.length > 0 || isBacklinksLoading) && (
        <BacklinksPanel backlinks={backlinks} isLoading={isBacklinksLoading} />
      )}
    </div>
  );
}