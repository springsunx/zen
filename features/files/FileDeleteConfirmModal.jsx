import { h } from "../../assets/preact.esm.js";
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import Button from "../../commons/components/Button.jsx";
import { t } from "../../commons/i18n/index.js";

export default function FileDeleteConfirmModal({ description, onConfirm, onClose }) {
  return (
    <ModalBackdrop onClose={onClose}>
      <ModalContainer className="note-delete-modal">
        <ModalHeader title={t("files.delete.title")} onClose={onClose} />
        <ModalContent>
          <p className="modal-description">{description}</p>
        </ModalContent>
        <ModalFooter isRightAligned>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" onClick={onConfirm}>{t("files.delete.confirm")}</Button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
}
