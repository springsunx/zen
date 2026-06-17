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
import renderMarkdown from '../../commons/utils/renderMarkdown.js';
import navigateTo from '../../commons/utils/navigateTo.js';
import NoteDeleteModal from './NoteDeleteModal.jsx';
import { showToast } from '../../commons/components/Toast.jsx';
import { closeModal, openModal } from '../../commons/components/Modal.jsx';
import { useNotes } from "../../commons/contexts/NotesContext.jsx";
import { useAppContext, AppProvider } from '../../commons/contexts/AppContext.jsx';
import { NotesProvider } from "../../commons/contexts/NotesContext.jsx";
import NotesEditorModal from './NotesEditorModal.jsx';
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
  const [backlinks, setBacklinks] = useState([]);
  const [isBacklinksLoading, setIsBacklinksLoading] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);

  // ─── Refs ───
  const titleRef = useRef(null);
  const textareaRef = useRef(null);
  const contentRef = useRef(null);
  const savedNoteRef = useRef(null);

  // ─── Hooks ───
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
    setContent(text);
    onContentChange(text);
    setShowAIModal(false);
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

  // ─── Content Area ───
  let contentArea = null;
  if (isEditable) {
    contentArea = (
      <textarea
        className="notes-editor-textarea"
        placeholder={t('notes.editor.placeholder')}
        spellCheck="false"
        ref={textareaRef}
        value={content}
        onInput={handleTextAreaHeight}
        onBlur={e => { const v = e.target.value; setContent(v); onContentChange(v); }}
      />
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
          onClose={() => setShowAIModal(false)}
        />
      )}
      {showLinkPicker && (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '0', left: '0', zIndex: 100 }}>
            <NoteLinkPicker onInsertLink={handleInsertInternalLink} onClose={() => setShowLinkPicker(false)} />
          </div>
        </div>
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