import { h } from "../../assets/preact.esm.js"
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import Button from "../../commons/components/Button.jsx";
import pluralize from "../../commons/utils/pluralize.js";
import { t } from "../../commons/i18n/index.js";

export default function BulkDeleteModal({ count, onDeleteClick, onCloseClick }) {
  const label = pluralize(count, 'note');

  return (
    <ModalBackdrop onClose={onCloseClick}>
      <ModalContainer className="note-delete-modal">
        <ModalHeader title={`${t('bulk.delete.title')} ${count} ${label}`} onClose={onCloseClick} />
        <ModalContent>
          <p className="modal-description">{count} {label} {t('bulk.delete.desc')}</p>
        </ModalContent>
        <ModalFooter isRightAligned>
          <Button onClick={onCloseClick}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onDeleteClick}>{t('common.delete')}</Button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
}