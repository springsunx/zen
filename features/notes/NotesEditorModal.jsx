import { h, useState, useEffect } from "../../assets/preact.esm.js"
import NotesEditor from './NotesEditor.jsx';
import RightSideToc from "./RightSideToc.jsx";
import { ModalBackdrop, ModalContainer, ModalContent, closeModal } from "../../commons/components/Modal.jsx";
import { useNotes } from "../../commons/contexts/NotesContext.jsx";
import "./NotesEditorModal.css";
import ApiClient from '../../commons/http/ApiClient.js';

export default function NotesEditorModal({ note, isNewNote }) {
  const { setSelectedNote, selectedNote } = useNotes();
  const [isEditorEditable, setIsEditorEditable] = useState(false);
  const [currentContent, setCurrentContent] = useState(note?.content || selectedNote?.content || "");

  function handleCloseModal() {
    document.title = "Zen";
    closeModal('.note-modal-root');
  }

  // Set the selected note when the modal opens
  if (isNewNote !== true) {
    setSelectedNote(note);
  }


  useEffect(() => {
    // Initialize selectedNote from the note prop for immediate rendering; fetch will overwrite if newer
    if (note) {
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

  useEffect(() => {
    setCurrentContent(selectedNote?.content || note?.content || "");
  }, [selectedNote, note]);

  return (
    <ModalBackdrop onClose={handleCloseModal} isCentered={true} closeOnBackdrop={false}>
      <ModalContainer className="notes-editor-modal">
        <ModalContent className="notes-editor-container">
          <NotesEditor
            key={(selectedNote?.noteId || note?.noteId || "n") + "-" + (selectedNote?.updatedAt || note?.updatedAt || "") }
            isNewNote={isNewNote === true}
            isModal={true}
            onClose={handleCloseModal}
            onEditModeChange={setIsEditorEditable}
            onContentChange={setCurrentContent}
            onSaved={(n) => { setSelectedNote(n); setCurrentContent(n?.content || ""); }}
          />
          {/* 在弹窗右侧显示 TOC（仅在非编辑状态且有足够标题时生效） */}
          <RightSideToc
            content={currentContent}
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
