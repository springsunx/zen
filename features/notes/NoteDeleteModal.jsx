import { h } from "../../assets/preact.esm.js"
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import Button from "../../commons/components/Button.jsx";
import "./NoteDeleteModal.css";
import { t } from "../../commons/i18n/index.js";

export default function NoteDeleteModal({ onDeleteClick, onCloseClick }) {
  return (
    <ModalBackdrop onClose={onCloseClick}>
      <ModalContainer className="note-delete-modal">
        <ModalHeader title={t('notes.delete.title')} onClose={onCloseClick} />
        <ModalContent>
          <p className="modal-description">{t('notes.delete.desc')}</p>
        </ModalContent>
        <ModalFooter isRightAligned>
          <Button onClick={onCloseClick}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onDeleteClick}>{t('common.delete')}</Button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
}