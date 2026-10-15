import { h, useState, useEffect, useRef } from '../../assets/preact.esm.js';
import ApiClient from '../../commons/http/ApiClient.js';
import renderMarkdown from '../../commons/utils/renderMarkdown.js';
import { toggleTaskAtLine } from '../../commons/utils/toggleTaskLine.js';
import handleCodeCopyClick from '../../commons/utils/handleCodeCopyClick.js';
import handleCodeWrapClick from '../../commons/utils/handleCodeWrapClick.js';
import { closeModal, openModal } from '../../commons/components/Modal.jsx';
import Lightbox from '../../commons/components/Lightbox.jsx';
import { BrainCogIcon } from '../../commons/components/Icon.jsx';
import { t } from '../../commons/i18n/index.js';
import AIPanel from './AIPanel.jsx';
import { useCollapsibleHeadings } from './useCollapsibleHeadings.js';
import './NotePreview.css';
import './NotesEditor.css';


export default function NotePreview({ noteId, onOpenLink, onNavigateLink, onNoteChange }) {
  const [note, setNote] = useState(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const contentRef = useRef(null);
  const { handleHeadingClick } = useCollapsibleHeadings(contentRef, note?.noteId);

  useEffect(() => {
    ApiClient.getNoteById(noteId)
      .then(setNote)
      .catch(() => setNote(null));
  }, [noteId]);

  if (note === null) {
    return null;
  }

  const titleText = note.title !== "" ? note.title : "Untitled";

  function closeLightbox() {
    closeModal();
  }

  function handleOpenAI() {
    setShowAIPanel(true);
  }

  function handleCloseAI() {
    setShowAIPanel(false);
  }

  function renderAIPanel() {
    if (!showAIPanel) return null;
    return (
      <AIPanel
        fullContent={note.content || ""}
        readOnly
        selectedText=""
        noteTitle={titleText}
        messages={aiMessages}
        setMessages={setAiMessages}
        onClose={handleCloseAI}
        quickPrompts={[
          { label: t('ai.preview.summary'), instruction: t('ai.preview.summaryPrompt') },
          { label: t('ai.preview.keyPoints'), instruction: t('ai.preview.keyPointsPrompt') },
          { label: t('ai.preview.todos'), instruction: t('ai.preview.todosPrompt') },
        ]}
      />
    );
  }

  function handleTaskCheckboxClick(checkbox) {
    const lineIndex = parseInt(checkbox.getAttribute('data-line'), 10);
    const newContent = toggleTaskAtLine(note.content, lineIndex);
    if (newContent === null) {
      return;
    }

    const updatedNote = { ...note, content: newContent };
    setNote(updatedNote);

    ApiClient.updateNote(note.noteId, {
      title: note.title,
      content: newContent,
      tags: note.tags,
    }).then(() => {
      if (onNoteChange) {
        onNoteChange();
      }
    }).catch(() => {
      setNote(note);
    });
  }

  function handleContentClick(e) {
    if (handleCodeWrapClick(e) === true) {
      return;
    }

    if (handleCodeCopyClick(e) === true) {
      return;
    }

    if (handleHeadingClick(e) === true) {
      return;
    }

    const checkbox = e.target.closest('.task-list-item-checkbox[data-line]');
    if (checkbox !== null) {
      handleTaskCheckboxClick(checkbox);
      return;
    }

    const link = e.target.closest('a[data-note-id]');
    if (link !== null) {
      e.preventDefault();
      const linkedNoteId = parseInt(link.getAttribute('data-note-id'), 10);

      // Shift keeps the note in the preview; a plain click navigates, as it does in the editor.
      if (e.shiftKey === true && onOpenLink) {
        onOpenLink(linkedNoteId);
        return;
      }

      if (onNavigateLink) {
        onNavigateLink(linkedNoteId);
      }
      return;
    }

    const image = e.target.closest('.notes-editor-rendered img');
    if (image === null) {
      return;
    }
    const filename = image.src.substring(image.src.lastIndexOf('/') + 1);
    const selectedImage = {
      url: image.src,
      filename: filename,
      aspectRatio: image.naturalWidth / image.naturalHeight,
    };
    openModal(<Lightbox selectedImage={selectedImage} imageDetails={[selectedImage]} onClose={closeLightbox} />);
  }

  return (
    <div className="note-preview">
      <div className="note-preview-header">
        <div className="notes-editor-title">{titleText}</div>
        <button className="note-preview-ai-button" onClick={handleOpenAI} title={t('ai.preview.open')}>
          <BrainCogIcon />
          <span>{t('ai.modal.title')}</span>
        </button>
      </div>
      <div className="notes-editor-rendered has-foldable-headings" ref={contentRef} dangerouslySetInnerHTML={{ __html: renderMarkdown(note.content, { hasCodeCopyButton: true, hasClickableTasks: true }) }} onClick={handleContentClick} />
      {renderAIPanel()}
    </div>
  );
}
