import { h, useState, useRef, useEffect, useCallback } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import NotesEditorTags from "../tags/NotesEditorTags.jsx";
import NotesEditorFormattingToolbar from './NotesEditorFormattingToolbar.jsx';
import TableOfContents from './TableOfContents.jsx';
import TemplatePicker from '../templates/TemplatePicker.jsx';
import renderMarkdown from '../../commons/utils/renderMarkdown.js';
import navigateTo from '../../commons/utils/navigateTo.js';
import isMobile from '../../commons/utils/isMobile.js';
import NoteDeleteModal from './NoteDeleteModal.jsx';
import DropdownMenu from '../../commons/components/DropdownMenu.jsx';
import Button from '../../commons/components/Button.jsx';
import { showToast } from '../../commons/components/Toast.jsx';
import { closeModal, openModal } from '../../commons/components/Modal.jsx';
import { useNotes } from "../../commons/contexts/NotesContext.jsx";
import { useVisibleHeadings } from "./useVisibleHeadings.js";
import useEditorKeyboardShortcuts from "./useEditorKeyboardShortcuts.js";
import useImageUpload from "./useImageUpload.js";
import useMarkdownFormatter from "./useMarkdownFormatter.js";
import "./NotesEditor.css";
import { CloseIcon, SidebarCloseIcon, SidebarOpenIcon, BackIcon } from "../../commons/components/Icon.jsx";
import { t } from "../../commons/i18n/index.js";

export default function NotesEditor({ isNewNote, isFloating, onClose, onEditModeChange = () => {}, onContentChange = () => {}, onSaved = () => {} }) {
  const { selectedNote, handleNoteChange, handlePinToggle } = useNotes();

  if (!isNewNote && selectedNote === null) {
    return null;
  }

  const [isEditable, setIsEditable] = useState(isNewNote);
  const [title, setTitle] = useState(selectedNote?.title || "");
  useEffect(() => {
    onEditModeChange(isEditable);
  }, [isEditable, onEditModeChange]);
  const [content, setContent] = useState(selectedNote?.content || "");
  const [tags, setTags] = useState(selectedNote?.tags || []);
  const [isSaveLoading, setIsSaveLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const titleRef = useRef(null);
  const textareaRef = useRef(null);
  const contentRef = useRef(null);

  const visibleHeadings = useVisibleHeadings(contentRef, content, isEditable, isExpanded);

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

  let contentArea = null;

  useEffect(() => {
    if (isNewNote === true || (isEditable === true && titleRef.current?.textContent === "")) {
      titleRef.current?.focus();
    }

    if (isNewNote !== true) {
      document.title = title === "" ? "Zen" : title;
    }
  }, []);

  useEffect(() => {
    handleTextAreaHeight();
  }, [content, isEditable]);

  // Sync from selectedNote when viewing (not editing), so re-open/edit always uses latest
  useEffect(() => {
    if (!isEditable) {
      setTitle(selectedNote?.title || "");
      setContent(selectedNote?.content || "");
      setTags(selectedNote?.tags || []);
    }
  }, [selectedNote?.noteId, selectedNote?.updatedAt, isEditable]);

  
  // Auto focus editor textarea whenever entering edit mode (any entry path)
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


  // Setup anchor links after markdown is rendered
  useEffect(() => {
    if (!isEditable && contentRef.current) {
      // Wait a tick for DOM to update
      setTimeout(() => {
        if (window.setupAnchorLinks) {
          window.setupAnchorLinks(contentRef.current);
        }
      }, 0);
    }
  }, [content, isEditable]);

  const handleSaveClick = useCallback((closeAfter = false) => {
    const currentTitle = titleRef.current?.textContent || "";
    const currentContent = textareaRef.current?.value || content;

    const note = {
      title: currentTitle,
      content: currentContent,
      tags: tags,
    };

    setTitle(currentTitle);
    setContent(currentContent);
    onContentChange(currentContent);

    let promise = null;
    setIsSaveLoading(true);

    if (isNewNote) {
      promise = ApiClient.createNote(note);
    } else {
      promise = ApiClient.updateNote(selectedNote.noteId, note);
    }

    promise
      .then(note => {
        if (closeAfter) {
          setIsEditable(false);
        }
        resetAttachments();

        if (closeAfter && isNewNote && !onClose) {
          navigateTo(`/notes/${note.noteId}`, true);
        }

        if (closeAfter) { handleNoteChange(); }
        onSaved(note);
      })
      .finally(() => {
        setIsSaveLoading(false);
      });
  }, [content, tags, isNewNote, selectedNote, handleNoteChange, resetAttachments]);

  const handleSaveAndCloseClick = useCallback(() => handleSaveClick(true), [handleSaveClick]);

  const { handleKeyDown } = useEditorKeyboardShortcuts({
    isEditable,
    isFloating,
    isExpanded,
    textareaRef,
    onSave: () => handleSaveClick(false),
    onSaveAndClose: () => handleSaveClick(true),
    onEdit: handleEditClick,
    onClose: handleCloseClick,
    onExpandToggle: handleExpandToggleClick,
    onInsertAtCursor: insertAtCursor,
    onFormatText: applyMarkdownFormat
  });

  function handleTextAreaHeight() {
    if (textareaRef.current === null) {
      return;
    }

    const textarea = textareaRef.current;
    // scrollHeight is height of content and padding
    // It doesn't include border, margin, or scrollbar
    // https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }

  function handleEditClick() {
    // Prefill with the freshest selectedNote before entering edit
    setTitle(selectedNote?.title || "");
    setContent(selectedNote?.content || "");
    setTags(selectedNote?.tags || []);
    setIsEditable(true);
  }

  function handleEditCancelClick() {
    if (isNewNote) {
      if (onClose) {
        onClose();
      } else {
        navigateTo("/", true);
      }
      // Ensure list reflects any in-edit saves
      handleNoteChange();
    } else {
      // Reset current edits
      setTitle(selectedNote?.title || "");
      setContent(selectedNote?.content || "");
      onContentChange(selectedNote?.content || "");
      setTags(selectedNote?.tags || []);
      setIsEditable(false);
      // Refresh list on exit from edit mode
      handleNoteChange();
    }
  }

  // https://blixtdev.com/how-to-use-contenteditable-with-react/
  function handleTitleChange(e) {
    const newTitle = e.target.textContent;
    setTitle(newTitle);
  }

  function handleAddTag(tag) {
    setTags((prevTags) => [...prevTags, tag]);
  }

  function handleRemoveTag(tag) {
    setTags((prevTags) => prevTags.filter(t => t.tagId !== tag.tagId));
  }

  function handleCloseClick() {
    if (onClose) {
      onClose();
    } else {
      navigateTo("/", true);
    }
    // Exiting editor: refresh list in case of in-edit saves
    handleNoteChange();
  }

  function handleDeleteClick() {
    openModal(
      <NoteDeleteModal
        onDeleteClick={handleDeleteConfirmClick}
        onCloseClick={handleDeleteCloseClick}
      />);
  }

  function handleDeleteConfirmClick() {
    ApiClient.deleteNote(selectedNote.noteId)
      .then(() => {
        handleDeleteCloseClick();
        if (onClose) {
          onClose();
        } else {
          navigateTo("/", true);
        }
        if (closeAfter) { handleNoteChange(); }
      });
  }

  function handleDeleteCloseClick() {
    closeModal();
  }

  function handleArchiveClick() {
    ApiClient.archiveNote(selectedNote.noteId)
      .then(() => {
        showToast("Note archived.");
        if (closeAfter) { handleNoteChange(); }
      });
  }

  function handleUnarchiveClick() {
    ApiClient.unarchiveNote(selectedNote.noteId)
      .then(() => {
        showToast("Note unarchived.");
        if (closeAfter) { handleNoteChange(); }
      });
  }

  function handleRestoreClick() {
    ApiClient.restoreNote(selectedNote.noteId)
      .then(() => {
        if (closeAfter) { handleNoteChange(); }
      });
  }

  function handleExpandToggleClick() {
    setIsExpanded((prev) => !prev);
    const editor = document.querySelector('.notes-editor-container');
    if (isExpanded) {
      editor.classList.remove('is-expanded');
    } else {
      editor.classList.add('is-expanded');
    }
  }

  function handlePinClick() {
    if (handlePinToggle && selectedNote) {
      handlePinToggle(selectedNote.noteId, selectedNote.isPinned);
    }
  }

  function handleUnpinClick() {
    if (handlePinToggle && selectedNote) {
      handlePinToggle(selectedNote.noteId, selectedNote.isPinned);
    }
  }

  function handleTemplateApply(templateTitle, templateContent, templateTags) {
    if (templateTitle && templateTitle.trim() !== "") {
      setTitle(templateTitle);
    }

    setContent(templateContent);

    onContentChange(templateContent);

    if (templateTags && templateTags.length > 0) {
      setTags(templateTags);
    }

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const length = templateContent.length;
        textareaRef.current.selectionStart = length;
        textareaRef.current.selectionEnd = length;
      }
    }, 0);
  }

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
    contentArea = (
      <div className="notes-editor-empty-text">{t('notes.editor.empty')}</div>
    );
  } else {
    contentArea = (
      <div className="notes-editor-rendered" ref={contentRef} dangerouslySetInnerHTML={{ __html: renderMarkdown(content, { anchorPrefix: selectedNote ? `n${selectedNote.noteId}-` : '' }) }} />
    );
  }

  const imagePreviewItems = attachments.map((file, index) => {
    const imageUrl = URL.createObjectURL(file);
    return (
      <img src={imageUrl} alt={`Attachment ${index}`} />
    );
  });

  let templatePicker = null;
  if (isNewNote === true && isEditable === true && title === "" && content === "") {
    templatePicker = <TemplatePicker onTemplateApply={handleTemplateApply} />;
  }

  // TODO: remove "is-editable" CSS and use JS
  return (
    <div className={`notes-editor ${isEditable ? "is-editable" : ""}`} tabIndex="0" onPaste={handlePaste}>
      <Toolbar
        note={selectedNote}
        isNewNote={isNewNote}
        isEditable={isEditable}
        isFloating={isFloating}
        isSaveLoading={isSaveLoading}
        isExpanded={isExpanded}
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
        onPinClick={handlePinClick}
        onUnpinClick={handleUnpinClick}
      />
      <div className="notes-editor-header">
        <div className="notes-editor-title" contentEditable={isEditable} ref={titleRef} onBlur={handleTitleChange} dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      <NotesEditorTags tags={tags} isEditable={isEditable} canCreateTag onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} />
      <div className={`notes-editor-image-dropzone ${isDraggingOver ? "dragover" : ""}`} onDrop={handleImageDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onClick={handleDropzoneClick}>
        {t('notes.editor.images.hint')}
        <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleFileInputChange} style={{ display: "none" }} />
      </div>
      <div className="notes-editor-image-attachment-preview">{imagePreviewItems}</div>
      <NotesEditorFormattingToolbar isEditable={isEditable} onFormat={applyMarkdownFormat} />
      <div className="notes-editor-content">
        {contentArea}
      </div>
      {templatePicker}
      {!isFloating && (<TableOfContents content={content} isExpanded={isExpanded} isEditable={isEditable} isNewNote={isNewNote} visibleHeadings={visibleHeadings} />)}
    </div>
  );
}

function Toolbar({ note, isNewNote, isEditable, isFloating, isSaveLoading, isExpanded, onSaveClick, onSaveAndCloseClick, onEditClick, onEditCancelClick, onCloseClick, onDeleteClick, onArchiveClick, onUnarchiveClick, onRestoreClick, onExpandToggleClick, onPinClick, onUnpinClick }) {
  const saveButtonText = isSaveLoading ? t('common.saving') : t('common.save');
  const saveAndCloseText = t('editor.saveAndClose');

  function handleClick(e) {
    if (e.target.className !== "notes-editor-toolbar") {
      e.stopPropagation();
      return;
    }

    document.querySelector(".notes-editor-container").scrollTo({ top: 0, behavior: 'smooth' });
  }

  const actions = {
    left: [
      {
        key: 'expand',
        condition: !isFloating && !isMobile(),
        component: <Button variant="ghost" onClick={onExpandToggleClick}>
          {isExpanded ? <SidebarCloseIcon /> : <SidebarOpenIcon />}
        </Button>
      },
      {
        key: 'back',
        condition: isMobile() && !isNewNote,
        component: <Button variant="ghost" onClick={() => window.history.back()}><BackIcon /></Button>
      }
    ],
    right: [
      {
        key: 'close',
        condition: isFloating,
        component: <Button variant="ghost" onClick={onCloseClick}><CloseIcon /></Button>
      },
      {
        key: 'save',
        condition: isEditable,
        component: <Button variant="ghost" isDisabled={isSaveLoading} onClick={() => onSaveClick(false)}>{saveButtonText}</Button>
      },
      {
        key: 'saveClose',
        condition: isEditable,
        component: <Button variant="ghost" isDisabled={isSaveLoading} onClick={onSaveAndCloseClick}>{saveAndCloseText}</Button>
      },
      {
        key: 'cancel',
        condition: isEditable,
        component: <Button variant="ghost" onClick={onEditCancelClick}>{t('common.cancel')}</Button>
      },
      {
        key: 'edit',
        condition: !isEditable,
        component: <Button variant="ghost" onClick={onEditClick}>{t('common.edit')}</Button>
      }
    ],
    menu: [
      {
        key: 'pin',
        condition: !isNewNote && !note?.isDeleted && !note?.isArchived,
        component: <div onClick={note?.isPinned ? onUnpinClick : onPinClick}>
          {note?.isPinned ? t('notes.pin.unpin') : t('notes.pin.pin')}
        </div>
      },
      {
        key: 'archive',
        condition: !isNewNote && !note?.isDeleted,
        component: <div onClick={note?.isArchived ? onUnarchiveClick : onArchiveClick}>
          {note?.isArchived ? t('notes.archive.unarchive') : t('notes.archive.archive')}
        </div>
      },
      {
        key: 'restore',
        condition: !isNewNote && note?.isDeleted,
        component: <div onClick={onRestoreClick}>{t('notes.restore')}</div>
      },
      {
        key: 'delete',
        condition: !isNewNote && !note?.isDeleted,
        component: <div onClick={onDeleteClick}>{t('common.delete')}</div>
      }
    ]
  };

  const leftToolbarActions = actions.left
    .filter(action => action.condition)
    .map(action => action.component);

  const rightToolbarActions = actions.right
    .filter(action => action.condition)
    .map(action => action.component);

  const menuActions = actions.menu
    .filter(action => action.condition)
    .map(action => action.component);

  return (
    <div className="notes-editor-toolbar" onClick={handleClick}>
      <div className="left-toolbar">
        {leftToolbarActions}
      </div>
      <div className="right-toolbar">
        {rightToolbarActions}
        <DropdownMenu actions={menuActions} />
      </div>
    </div>
  );
}

