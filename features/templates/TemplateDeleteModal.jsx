import { h } from "../../assets/preact.esm.js"
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import Button from "../../commons/components/Button.jsx";
import { t } from "../../commons/i18n/index.js";

export default function TemplateDeleteModal({ onDeleteClick, onCloseClick }) {
  return (
    <ModalBackdrop onClose={onCloseClick}>
      <ModalContainer>
        <ModalHeader title={t('templates.delete.title')} onClose={onCloseClick} />
        <ModalContent>
          <p className="modal-description">This template will be <b>permanently deleted</b>. This action cannot be undone.</p>
        </ModalContent>
        <ModalFooter isRightAligned>
          <Button onClick={onCloseClick}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onDeleteClick}>{t('common.delete')}</Button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
}