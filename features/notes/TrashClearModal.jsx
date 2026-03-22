import { h } from "../../assets/preact.esm.js"
import Button from "../../commons/components/Button.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import { closeModal, ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import "./TrashClearModal.css";
import { t } from "../../commons/i18n/index.js";

export default function TrashClearModal({ onTrashCleared }) {

  function handleConfirm() {
    ApiClient.clearTrash()
      .then(() => {
        onTrashCleared();
        closeModal();
      })
      .catch(error => {
        console.error('Error clearing trash:', error);
        closeModal();
      });
  }

  function handleCancel() {
    closeModal();
  }

  return (
    <ModalBackdrop onClose={handleCancel}>
      <ModalContainer className="note-clear-trash-modal">
        <ModalHeader title={t('notes.trash.clearTitle')} onClose={handleCancel} />
        <ModalContent>
          <p className="modal-description">Are you sure you want to <b>permanently delete</b> all notes in the trash? This action cannot be undone.</p>
        </ModalContent>
        <ModalFooter isRightAligned>
          <Button onClick={handleCancel}>{t('common.cancel')}</Button>
          <Button onClick={handleConfirm} className="danger">{t('notes.trash.clear')}</Button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
}