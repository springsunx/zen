import { h, useState, useEffect, useRef } from "../../assets/preact.esm.js"
import NotesEditor from './NotesEditor.jsx';
import RightSideToc from "./RightSideToc.jsx";
import { ModalBackdrop, ModalContainer, ModalContent, closeModal } from "../../commons/components/Modal.jsx";
import { useNotes } from "../../commons/contexts/NotesContext.jsx";
import "./NotesEditorModal.css";
import ApiClient from '../../commons/http/ApiClient.js';
import { extractHeadingsFromMarkdown } from "../../commons/utils/markdownToc.js";

export default function NotesEditorModal({ note, isNewNote, onModalClose }) {
  const { setSelectedNote, selectedNote } = useNotes();
  const [isEditorEditable, setIsEditorEditable] = useState(false);
  const [currentContent, setCurrentContent] = useState(note?.content || selectedNote?.content || "");
  const savedNoteRef = useRef(null);
  const [showToc, setShowToc] = useState(() => {
    try { return localStorage.getItem('zen.modalShowToc') === 'true'; } catch { return false; }
  });
  const headings = extractHeadingsFromMarkdown(currentContent);
  const hasTocContent = showToc && !isEditorEditable && headings.length >= 2;

  function handleCloseModal() {
    document.title = "Zen";
    closeModal('.note-modal-root');
    if (onModalClose) {
      onModalClose(savedNoteRef.current);
    }
  }

  // Set the selected note when the modal opens (only on noteId change, not every render)
  useEffect(() => {
    if (isNewNote !== true && note) {
      setSelectedNote(note);
      setCurrentContent(note?.content || "");
    }
  }, [note?.noteId]);

  useEffect(() => {
    if (note?.noteId) {
      ApiClient.getNoteById(note.noteId)
        .then((fresh) => { setSelectedNote(fresh); setCurrentContent(fresh?.content || ''); })
        .catch(() => {});
    }
  }, [note?.noteId]);

  return (
    <ModalBackdrop onClose={handleCloseModal} isCentered={true} closeOnBackdrop={false}>
      <ModalContainer className="notes-editor-modal">
        <ModalContent className={`notes-editor-container${hasTocContent ? ' toc-visible' : ''}`}>
          <NotesEditor
            key={selectedNote?.noteId || note?.noteId || "n"}
            isNewNote={isNewNote === true}
            isModal={true}
            onClose={handleCloseModal}
            onEditModeChange={setIsEditorEditable}
            onContentChange={setCurrentContent}
            onSaved={(n) => { savedNoteRef.current = n; setSelectedNote(n); setCurrentContent(n?.content || ""); }}
            onToggleToc={() => setShowToc(prev => { const next = !prev; try { localStorage.setItem('zen.modalShowToc', String(next)); } catch {} return next; })}
          />
          {/* 在弹窗右侧显示 TOC（仅在非编辑状态且有足够标题时生效） */}
          <RightSideToc
            content={currentContent}
            showToc={showToc}
            isEditable={isEditorEditable}
            isNewNote={false}
            inModal={true}
            noteId={(selectedNote?.noteId || note?.noteId)}
            onContentPatched={setCurrentContent}
          />
        </ModalContent>
      </ModalContainer>
    </ModalBackdrop>
  );
}
