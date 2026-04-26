import { h } from "../../assets/preact.esm.js"
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import Button from "../../commons/components/Button.jsx";
import { t } from "../../commons/i18n/index.js";
import "./CanvasDeleteModal.css";

export default function CanvasDeleteModal({ onDeleteClick, onCloseClick }) {
  return (
    <ModalBackdrop onClose={onCloseClick}>
      <ModalContainer className="canvas-delete-modal">
        <ModalHeader title={t('canvas.deleteModal.title')} onClose={onCloseClick} />
        <ModalContent>
          <p className="modal-description" dangerouslySetInnerHTML={{ __html: t('canvas.deleteModal.desc') }}></p>
        </ModalContent>
        <ModalFooter isRightAligned>
          <Button onClick={onCloseClick}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onDeleteClick}>{t('common.delete')}</Button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
}
