import { h, Fragment, useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import NotesEditorTags from "../tags/NotesEditorTags.jsx";
import NotesEditorFormattingToolbar from './NotesEditorFormattingToolbar.jsx';
import NotesEditorToolbar from './NotesEditorToolbar.jsx';
import NotesEditorImageDropzone from './NotesEditorImageDropzone.jsx';
import NoteLinkPicker from './NoteLinkPicker.jsx';
import BacklinksPanel from './BacklinksPanel.jsx';
import TemplatePicker from '../templates/TemplatePicker.jsx';
import TemplateSlashMenu from './TemplateSlashMenu.jsx';
import AIPanel from './AIPanel.jsx';
import SlashCommandMenu from './SlashCommandMenu.jsx';
import renderMarkdown from '../../commons/utils/renderMarkdown.js';
import navigateTo from '../../commons/utils/navigateTo.js';
import NoteDeleteModal from './NoteDeleteModal.jsx';
import TableEditorModal from './TableEditorModal.jsx';
import { showToast } from '../../commons/components/Toast.jsx';
import { closeModal, openModal } from '../../commons/components/Modal.jsx';
import { useNotes } from "../../commons/contexts/NotesContext.jsx";
import { useAppContext, AppProvider } from '../../commons/contexts/AppContext.jsx';
import { NotesProvider } from "../../commons/contexts/NotesContext.jsx";
import NotesEditorModal from './NotesEditorModal.jsx';
import { BrainCircuitIcon } from '../../commons/components/Icon.jsx';

// How far the invisible page-edge grips reach outward from the reading column.
const HANDLE_REACH = 40;
import { useLayout } from '../../commons/contexts/LayoutContext.jsx';
import { useCollapsibleHeadings } from "./useCollapsibleHeadings.js";
import NoteOutline from "./NoteOutline.jsx";
import handleCodeWrapClick from "../../commons/utils/handleCodeWrapClick.js";
import handleCodeCopyClick from "../../commons/utils/handleCodeCopyClick.js";
import EditorWidthPreferences from "../../commons/preferences/EditorWidthPreferences.js";
import useRefreshOnTabFocus from "./useRefreshOnTabFocus.js";
import useNewNoteTag from "./useNewNoteTag.js";
import Lightbox from "../../commons/components/Lightbox.jsx";
import useEditorKeyboardShortcuts from "./useEditorKeyboardShortcuts.js";
import useImageUpload from "./useImageUpload.js";
import useMarkdownFormatter from "./useMarkdownFormatter.js";
import useAIPanel from "./useAIPanel.js";
import { consumeEditMode } from "../../commons/utils/editMode.js";
import useSlashCommands from "./useSlashCommands.js";
import useNoteVersions from "./useNoteVersions.js";
import useAutoSave from "./useAutoSave.js";
import SpellcheckPreferences from "../../commons/preferences/SpellcheckPreferences.js";
import "./NotesEditor.css";
import { t } from "../../commons/i18n/index.js";

export default function NotesEditor({ isNewNote, isModal, isExpandable = false, onClose, onEditModeChange = () => {}, onContentChange = () => {}, onSaved = () => {}, onToggleShare }) {
  const { selectedNote, handleNoteChange, patchNote, handlePinToggle } = useNotes();
  const { refreshTags } = useAppContext();
  const { isEditorExpanded, toggleEditorExpanded } = useLayout();

  // ─── Refs (declared before the autosave hook, which captures them) ───
  const titleRef = useRef(null);
  const textareaRef = useRef(null);
  // Mirrored into a ref because the autosave closure reads it without re-subscribing.
  const tagsRef = useRef(selectedNote?.tags || []);

  const { scheduleAutoSave, cancelAutoSave } = useAutoSave({
    isNewNote,
    noteId: selectedNote?.noteId,
    titleRef,
    textareaRef,
    tagsRef,
  });

  const { handleVersionsClick } = useNoteVersions({
    note: selectedNote,
    onRestored: () => handleNoteChange(),
    cancelAutoSave,
  });

  if (!isNewNote && selectedNote === null) {
    return null;
  }

  // ─── State ───
  const [isEditable, setIsEditable] = useState(() => isNewNote || consumeEditMode());
  const [title, setTitle] = useState(selectedNote?.title || "");
  const [content, setContent] = useState(selectedNote?.content || "");
  const [tags, setTags] = useState(selectedNote?.tags || []);
  const [isSaveLoading, setIsSaveLoading] = useState(false);
  const [, setPreferencesVersion] = useState(0);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkPickerPos, setLinkPickerPos] = useState(null);
  const [backlinks, setBacklinks] = useState([]);
  const [isBacklinksLoading, setIsBacklinksLoading] = useState(false);
  const [showTemplateSlashMenu, setShowTemplateSlashMenu] = useState(false);
  const [templateSlashSelectedIndex, setTemplateSlashSelectedIndex] = useState(0);
  const [templateList, setTemplateList] = useState([]);
  const pendingCursorPos = useRef(null); // { start, end } to restore after re-render

  // Extract stable values for useEffect dependencies (avoid optional chaining in dep arrays)
  const noteId = selectedNote?.noteId;
  const noteContent = selectedNote?.content;
  const noteTags = selectedNote?.tags;

  // ─── Refs ───
  const contentRef = useRef(null);
  const editorRef = useRef(null);
  // Read mode scrolls the reading area, edit mode scrolls the content box; both are kept
  // so switching modes can put the reader back where they were.
  const readScrollRef = useRef(0);
  const editScrollRef = useRef(0);
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
    onTemplatePicker: handleOpenTemplateSlashMenu,
  });
  // Browse and expanded keep separate widths, so flipping the mode reloads the
  // stored value instead of carrying the other mode's width across.
  const [editorWidth, setEditorWidth] = useState(() => EditorWidthPreferences.getWidth(isEditorExpanded));
  const [editorLayout, setEditorLayout] = useState(null);

  useEffect(() => {
    setEditorWidth(EditorWidthPreferences.getWidth(isEditorExpanded));
  }, [isEditorExpanded]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      isEditorExpanded === true ? "--notes-editor-max-width-expanded" : "--notes-editor-max-width",
      `${editorWidth}px`
    );
  }, [editorWidth, isEditorExpanded]);

  // The reading column is centred inside the editor pane, which is narrower than the
  // viewport and moves when the sidebar, note list or side panel changes, so the page
  // edge handles and the outline are measured from the pane rather than the window.
  useEffect(() => {
    const container = editorRef.current?.querySelector(".notes-editor-scroll");
    if (container === null || container === undefined) {
      return;
    }

    function measure() {
      const rect = container.getBoundingClientRect();
      // A pane parked off-screen (card view keeps the editor mounted but hidden) must
      // not publish grips or a rail: they are position:fixed, so they would otherwise
      // be placed from a box nobody can see.
      const pane = container.closest(".notes-editor-container");
      if (rect.width === 0 || (pane !== null && pane.classList.contains("is-hidden"))) {
        setEditorLayout(null);
        return;
      }

      const style = getComputedStyle(container);
      // clientLeft/clientWidth exclude the border and the vertical scrollbar, both of
      // which now sit between the pane's outer box and the reading column.
      const paddingBoxLeft = rect.left + container.clientLeft;
      const paddingBoxRight = paddingBoxLeft + container.clientWidth;
      const contentLeft = paddingBoxLeft + (parseFloat(style.paddingLeft) || 0);
      const contentRight = paddingBoxRight - (parseFloat(style.paddingRight) || 0);
      const availableWidth = Math.max(0, contentRight - contentLeft);
      const columnWidth = Math.max(0, Math.min(editorWidth, availableWidth));
      const columnLeft = contentLeft + (availableWidth - columnWidth) / 2;
      const columnRight = columnLeft + columnWidth;
      // The grips live in the pane's padding, so they stay reachable even when the
      // column already fills the content box.
      const leftHandleX = Math.max(paddingBoxLeft, columnLeft - HANDLE_REACH);
      const rightHandleX = Math.min(paddingBoxRight, columnRight + HANDLE_REACH);
      setEditorLayout({
        // Measured from the padding box, not the border box, so the rail clears the
        // vertical scrollbar instead of sitting on top of it.
        outlineRight: Math.round(window.innerWidth - paddingBoxRight),
        // The grips start where the reading area starts: the pinned header owns
        // everything above it, and the mark must not be drawn over the header.
        panelTop: Math.round(rect.top),
        panelBottom: Math.round(rect.bottom),
        leftHandle: { left: Math.round(leftHandleX), width: Math.round(columnLeft - leftHandleX) },
        rightHandle: { left: Math.round(columnRight), width: Math.round(rightHandleX - columnRight) }
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [editorWidth, isEditorExpanded]);

  // Leaving edit mode swaps the text area back for the rendered note, which resets the
  // reading area; put it back where the writer was.
  useEffect(() => {
    if (isEditable === true) {
      return;
    }
    const scroller = document.querySelector('.notes-editor-scroll');
    if (scroller !== null && editScrollRef.current > 0) {
      scroller.scrollTop = editScrollRef.current;
    }
  }, [isEditable]);

  // A grip released by an unmount (navigating away mid-drag) must not leave the page
  // stuck with the resize cursor.
  useEffect(() => () => document.documentElement.classList.remove("is-resizing-editor"), []);

  // The indicator only materialises around the pointer, so the page edges stay clean
  // until the reader reaches for them.
  function handleResizeHandlePointerMove(e) {
    // The mark is positioned inside the grip, so the pointer has to be expressed
    // relative to the grip rather than to the viewport.
    const { top } = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--notes-editor-handle-y", `${e.clientY - top}px`);
  }

  function handleResizePointerDown(e) {
    const container = editorRef.current?.querySelector(".notes-editor-scroll");
    if (e.button !== 0 || container === null || container === undefined) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const handle = e.currentTarget;
    // Left and right grips pull in opposite directions but both widen symmetrically,
    // so each side moves half of the change and the width delta is doubled.
    const direction = handle.dataset.side === "left" ? -1 : 1;
    const style = getComputedStyle(container);
    // The pane is the only ceiling: the column may be dragged to fill the whole
    // reading area, so there is no upper bound beyond the space that exists.
    const availableWidth = Math.max(0, container.clientWidth
      - (parseFloat(style.paddingLeft) || 0)
      - (parseFloat(style.paddingRight) || 0));
    const startX = e.clientX;
    const startWidth = Math.min(editorWidth, availableWidth);
    let latestWidth = editorWidth;

    // Pointer capture keeps the drag alive outside the grip, but it throws when the
    // pointer is already gone (a synthetic event, or a release racing the handler).
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
    }
    handle.dataset.dragging = "";
    document.documentElement.classList.add("is-resizing-editor");

    function handlePointerMove(moveEvent) {
      latestWidth = Math.min(
        EditorWidthPreferences.clamp(startWidth + (moveEvent.clientX - startX) * direction * 2),
        availableWidth
      );
      setEditorWidth(latestWidth);
      const { top } = handle.getBoundingClientRect();
      handle.style.setProperty("--notes-editor-handle-y", `${moveEvent.clientY - top}px`);
    }

    function handlePointerUp(upEvent) {
      handle.removeEventListener("pointermove", handlePointerMove);
      handle.removeEventListener("pointerup", handlePointerUp);
      handle.removeEventListener("pointercancel", handlePointerUp);
      delete handle.dataset.dragging;
      document.documentElement.classList.remove("is-resizing-editor");
      try {
        handle.releasePointerCapture(upEvent.pointerId);
      } catch {
      }
      EditorWidthPreferences.setWidth(latestWidth, isEditorExpanded);
    }

    handle.addEventListener("pointermove", handlePointerMove);
    handle.addEventListener("pointerup", handlePointerUp);
    handle.addEventListener("pointercancel", handlePointerUp);
  }

  const { handleHeadingClick } = useCollapsibleHeadings(contentRef, selectedNote?.noteId);

  // A new note inherits the tag or single-tag focus mode currently being browsed
  useNewNoteTag({ isNewNote, setTags });

  // Coming back to the tab picks up edits made elsewhere, but never while typing
  useRefreshOnTabFocus({
    note: selectedNote,
    isEditable,
    onRefresh: replaceNote
  });

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

  // Edit mode scrolls the content box, the read view scrolls the whole reading area,
  // so scroll bookkeeping has to ask for the right one.
  function getScrollContainer() {
    const content = document.querySelector('.notes-editor-content');
    if (isEditable === true && content !== null) {
      return content;
    }
    return document.querySelector('.notes-editor-scroll');
  }

  // Auto focus editor textarea whenever entering edit mode
  useEffect(() => {
    if (isEditable) {
      setTimeout(() => {
        const container = getScrollContainer();
        const savedTop = readScrollRef.current;
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

  // Keep the autosave snapshot of the tags in step with the editor state
  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  // Re-render when the editor preferences change so spellcheck applies without a reopen
  useEffect(() => {
    function handlePreferencesChange() {
      setPreferencesVersion(version => version + 1);
    }

    window.addEventListener('editor-preferences:change', handlePreferencesChange);
    return () => window.removeEventListener('editor-preferences:change', handlePreferencesChange);
  }, []);

  // Activate edit mode when navigated from edit button (same note already selected)
  useEffect(() => {
    function handleNavigate() {
      const match = window.location.pathname.match(/^\/notes\/(\d+)/);
      const urlNoteId = match ? parseInt(match[1], 10) : null;
      if (urlNoteId === selectedNote?.noteId && consumeEditMode()) {
        setIsEditable(true);
      }
    }
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, [selectedNote?.noteId]);

  // A pending autosave belongs to the note that was open when it was scheduled
  useEffect(() => {
    return () => cancelAutoSave();
  }, [selectedNote?.noteId]);

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
      const editorContainer = getScrollContainer();
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
    cancelAutoSave();

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
        handleNoteChange();
        onSaved(savedNote);
      })
      .finally(() => setIsSaveLoading(false));
  }, [tags, isNewNote, selectedNote, patchNote, resetAttachments, handleNoteChange]);

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
    cancelAutoSave();

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
    cancelAutoSave();

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

  // Table actions open a grid editor instead of splicing markdown blindly; the rest of
  // the formatting actions go straight to the formatter.
  function handleEditorActions(action, placeholder) {
    if (action !== "insertTable" && action !== "editTable") {
      applyMarkdownFormat(action, placeholder);
      return;
    }

    const textarea = textareaRef.current;
    if (textarea === null) {
      return;
    }

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const isEditing = action === "editTable";
    const selectedText = textarea.value.substring(startPos, endPos);
    const beforeText = textarea.value.substring(0, startPos);
    const afterText = textarea.value.substring(endPos);

    function handleConfirm(tableMarkdown) {
      closeModal('.note-modal-root');
      updateContent(beforeText + tableMarkdown + afterText);
      scheduleAutoSave();
    }

    openModal(
      <TableEditorModal
        isEditing={isEditing}
        selectedText={selectedText}
        beforeText={beforeText}
        afterText={afterText}
        onConfirm={handleConfirm}
        onCloseClick={() => closeModal('.note-modal-root')}
      />,
      '.note-modal-root'
    );
  }

  function handleTitleChange(e) {
    setTitle(e.target.textContent);
    scheduleAutoSave();
  }

  function handleAddTag(tag) {
    setTags(prev => [...prev, tag]);
    scheduleAutoSave();
  }

  function handleRemoveTag(tag) {
    setTags(prev => prev.filter(t => t.tagId !== tag.tagId));
    scheduleAutoSave();
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
    cancelAutoSave();

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

  // Apply a note fetched from the server without leaving edit mode's baseline stale
  function replaceNote(latestNote) {
    savedNoteRef.current = latestNote;
    setTitle(latestNote.title || "");
    updateContent(latestNote.content || "");
    setTags(latestNote.tags || []);
    patchNote(latestNote.noteId, latestNote);
  }

  function closeLightbox() {
    // the lightbox is mounted into .note-modal-root, so it must be cleared there
    closeModal('.note-modal-root');
  }

  function handleInternalNoteLinkClick(e) {
    if (handleCodeWrapClick(e) === true) {
      return;
    }

    if (handleCodeCopyClick(e) === true) {
      return;
    }

    // A plain heading click folds or unfolds its section; links and text selections win.
    if (handleHeadingClick(e) === true) {
      return;
    }

    const image = e.target.closest('.notes-editor-rendered img');
    if (image !== null) {
      const selectedImage = {
        url: image.src,
        filename: image.src.substring(image.src.lastIndexOf('/') + 1),
        aspectRatio: image.naturalWidth / image.naturalHeight,
      };
      openModal(<Lightbox selectedImage={selectedImage} imageDetails={[selectedImage]} onClose={closeLightbox} />, '.note-modal-root');
      return;
    }

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

  function handleOpenTemplateSlashMenu() {
    setShowTemplateSlashMenu(true);
    setTemplateSlashSelectedIndex(0);
    ApiClient.getRecommendedTemplates()
      .then(data => setTemplateList(Array.isArray(data) ? data : []))
      .catch(() => setTemplateList([]));
  }

  function handleTemplateSlashKeyDown(e) {
    if (!showTemplateSlashMenu) return false;
    if (templateList.length === 0 && e.key !== 'Escape') return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTemplateSlashSelectedIndex(prev => (prev + 1) % templateList.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTemplateSlashSelectedIndex(prev => (prev - 1 + templateList.length) % templateList.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const template = templateList[templateSlashSelectedIndex];
      if (template) handleTemplateSlashApply(template);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowTemplateSlashMenu(false);
      setTemplateList([]);
      return true;
    }
    return false;
  }

  function handleTemplateSlashApply(template) {
    if (title === "" && template.title && template.title.trim() !== "") setTitle(template.title);
    const ta = textareaRef.current;
    const currentVal = ta ? ta.value : content;
    const cursorPos = ta ? ta.selectionStart : currentVal.length;
    const inserted = currentVal.slice(0, cursorPos) + template.content + currentVal.slice(cursorPos);
    updateContent(inserted);
    if (tags.length === 0 && template.tags && template.tags.length > 0) setTags(template.tags);
    setShowTemplateSlashMenu(false);
    setTemplateList([]);
    ApiClient.incrementTemplateUsage(template.templateId).catch(console.error);
    setTimeout(() => {
      if (ta) {
        ta.focus();
        const newPos = cursorPos + template.content.length;
        ta.selectionStart = newPos;
        ta.selectionEnd = newPos;
      }
    }, 0);
  }

  function handleTemplateApply(templateTitle, templateContent, templateTags) {
    if (title === "" && templateTitle && templateTitle.trim() !== "") setTitle(templateTitle);
    const ta = textareaRef.current;
    const currentVal = ta ? ta.value : content;
    const cursorPos = ta ? ta.selectionStart : currentVal.length;
    const inserted = currentVal.slice(0, cursorPos) + templateContent + currentVal.slice(cursorPos);
    updateContent(inserted);
    if (tags.length === 0 && templateTags && templateTags.length > 0) setTags(templateTags);
    setTimeout(() => {
      if (ta) {
        ta.focus();
        const newPos = cursorPos + templateContent.length;
        ta.selectionStart = newPos;
        ta.selectionEnd = newPos;
      }
    }, 0);
  }

  // ─── Memoized rendered content ───
  const renderedContent = useMemo(() => {
    if (isEditable || (title === "" && content === "")) return null;
    return renderMarkdown(content, { anchorPrefix: selectedNote ? `n${selectedNote.noteId}-` : '', hasCodeCopyButton: true });
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
  const spellcheckValue = SpellcheckPreferences.isEnabled() ? "true" : "false";

  let contentArea = null;
  if (isEditable) {
    contentArea = (
      <div style={{ position: 'relative' }}>
        <textarea
          className="notes-editor-textarea"
          placeholder={t('notes.editor.placeholder')}
          spellCheck={spellcheckValue}
          ref={textareaRef}
          value={content}
          onInput={e => {
            const v = e.target.value;
            updateContent(v);
            scheduleAutoSave();
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
            if (handleTemplateSlashKeyDown(e)) return;
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
                skipSlashCheck.current = false;
                handleOpenTemplateSlashMenu();
              }
            }}
          />
        )}
        {showLinkPicker && (
          <NoteLinkPicker onInsertLink={handleInsertInternalLink} onClose={() => setShowLinkPicker(false)} textareaRef={textareaRef} cursorPos={linkPickerPos} />
        )}
        {showTemplateSlashMenu && templateList.length > 0 && (
          <TemplateSlashMenu
            templates={templateList}
            selectedIndex={templateSlashSelectedIndex}
            onApply={handleTemplateSlashApply}
            textareaRef={textareaRef}
          />
        )}
      </div>
    );
  } else if (title === "" && content === "") {
    contentArea = <div className="notes-editor-empty-text">{t('notes.editor.empty')}</div>;
  } else {
    contentArea = (
      <div className="notes-editor-rendered has-foldable-headings" ref={contentRef}
        dangerouslySetInnerHTML={{ __html: renderedContent }}
        onClick={handleInternalNoteLinkClick}
      />
    );
  }

  const showImageDropzone = isEditable === true;
  const shouldShowTemplatePicker = (isNewNote === true && isEditable === true && title === "" && content === "");

  // ─── Render ───
  return (
    <div className={`notes-editor${isEditable ? ' is-editable' : ''}`} tabIndex="0" onPaste={handlePaste} ref={editorRef}>
      {/* Pinned above the scroller, not inside it: the scrollbar belongs to the
          reading area below, so it never runs alongside this header. */}
      <div className="notes-editor-sticky">
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
          onVersionsClick={handleVersionsClick}
          onToggleShare={onToggleShare}
        />
        <div className="notes-editor-header">
          <div className="notes-editor-title" spellCheck={spellcheckValue} contentEditable={isEditable} ref={titleRef} onBlur={handleTitleChange} dangerouslySetInnerHTML={{ __html: title }} />
        </div>
        <NotesEditorTags tags={tags} isEditable={isEditable} canCreateTag onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} />
      </div>
      <div className="notes-editor-scroll" onScroll={(e) => { readScrollRef.current = e.currentTarget.scrollTop; }}>
        <div className="notes-editor-column">
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
          <NotesEditorFormattingToolbar isEditable={isEditable} onFormat={handleEditorActions} onInsertInternalLink={handleShowLinkPicker} onOpenAI={handleOpenAI} />
          {showAIModal && (
            <AIPanel
              fullContent={content}
              selectedText={textareaRef.current ? textareaRef.current.value.substring(textareaRef.current.selectionStart, textareaRef.current.selectionEnd) : ""}
              noteTitle={title}
              messages={aiMessages}
              setMessages={setAiMessages}
              onInsert={handleAIInsert}
              onReplace={handleAIReplace}
              onClose={handleCloseAI}
            />
          )}
          <div className="notes-editor-content" onScroll={(e) => { editScrollRef.current = e.currentTarget.scrollTop; }}>
            {contentArea}
          </div>
          {shouldShowTemplatePicker && <TemplatePicker onTemplateApply={handleTemplateApply} />}
          {!isNewNote && !isEditable && (backlinks.length > 0 || isBacklinksLoading) && (
            <BacklinksPanel backlinks={backlinks} isLoading={isBacklinksLoading} />
          )}
        </div>
      </div>
      {isEditable && !showAIModal && (
        <button type="button" className="ai-fab" onClick={handleOpenAI} title={t('notes.toolbar.ai')}>
          <BrainCircuitIcon />
        </button>
      )}
      {editorLayout === null ? null : (
        <>
          <div
            className="notes-editor-resize-handle"
            data-side="left"
            aria-hidden="true"
            style={{ top: `${editorLayout.panelTop}px`, bottom: `${Math.max(0, window.innerHeight - editorLayout.panelBottom)}px`, left: `${editorLayout.leftHandle.left}px`, width: `${editorLayout.leftHandle.width}px` }}
            onPointerMove={handleResizeHandlePointerMove}
            onPointerDown={handleResizePointerDown}
          />
          <div
            className="notes-editor-resize-handle"
            data-side="right"
            aria-hidden="true"
            style={{ top: `${editorLayout.panelTop}px`, bottom: `${Math.max(0, window.innerHeight - editorLayout.panelBottom)}px`, left: `${editorLayout.rightHandle.left}px`, width: `${editorLayout.rightHandle.width}px` }}
            onPointerMove={handleResizeHandlePointerMove}
            onPointerDown={handleResizePointerDown}
          />
        </>
      )}
      {editorLayout === null ? null : (
        <NoteOutline
          contentRef={contentRef}
          noteId={selectedNote?.noteId}
          content={content}
          isEditable={isEditable}
          rightOffset={editorLayout.outlineRight}
        />
      )}
    </div>
  );
}
