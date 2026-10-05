import { h, useState, useEffect, useRef } from "../../assets/preact.esm.js"
import NotesEditor from './NotesEditor.jsx';
import { ModalBackdrop, ModalContainer, ModalContent, closeModal } from "../../commons/components/Modal.jsx";
import { useNotes } from "../../commons/contexts/NotesContext.jsx";
import "./NotesEditorModal.css";
import ApiClient from '../../commons/http/ApiClient.js';

export default function NotesEditorModal({ note, isNewNote, onModalClose }) {
  const { setSelectedNote, selectedNote } = useNotes();
  const [isEditorEditable, setIsEditorEditable] = useState(false);
  const savedNoteRef = useRef(null);
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
    }
  }, [note?.noteId]);

  useEffect(() => {
    if (note?.noteId) {
      ApiClient.getNoteById(note.noteId)
        .then((fresh) => { setSelectedNote(fresh); })
        .catch(() => {});
    }
  }, [note?.noteId]);

  function handleSaved(n) {
    savedNoteRef.current = n;
    setSelectedNote(n);
  }

  return (
    <ModalBackdrop onClose={handleCloseModal} isCentered={true} closeOnBackdrop={false}>
      <ModalContainer className="notes-editor-modal">
        <ModalContent className="notes-editor-container">
          <NotesEditor
            key={selectedNote?.noteId || note?.noteId || "n"}
            isNewNote={isNewNote === true}
            isModal={true}
            onClose={handleCloseModal}
            onEditModeChange={setIsEditorEditable}
            onSaved={handleSaved}
          />
        </ModalContent>
      </ModalContainer>
    </ModalBackdrop>
  );
}
