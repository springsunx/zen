import { h, useState } from "../../assets/preact.esm.js"
import Input from "../../commons/components/Input.jsx";
import Button from "../../commons/components/Button.jsx";
import ButtonGroup from "../../commons/components/ButtonGroup.jsx";
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter, closeModal } from "../../commons/components/Modal.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import navigateTo from "../../commons/utils/navigateTo.js";
import "./TagDetailModal.css";
import { t } from "../../commons/i18n/index.js";

export default function TagDetailModal({ tag, refreshTags }) {
  const [name, setName] = useState(tag.name);

  function handleNameChange(e) {
    setName(e.target.value);
  }

  function handleUpdateClick() {
    const payload = {
      tagId: tag.tagId,
      name: name
    };

    ApiClient.updateTag(payload)
      .then(() => {
        refreshTags();
        closeModal();
      });
  }

  function handleDeleteClick() {
    ApiClient.deleteTag(tag.tagId)
      .then(() => {
        refreshTags();
        closeModal();
        navigateTo("/notes/");
      });
  }

  function handleCancelClick() {
    closeModal();
  }


  return (
    <ModalBackdrop onClose={handleCancelClick} isCentered={true}>
      <ModalContainer className="tag-dialog">
        <ModalHeader title={t('tags.detail.manage')} onClose={handleCancelClick} />
        <ModalContent>
          <p className="modal-description">{t("tags.detail.desc")}</p>
          <Input id="tag-name" label={t("tags.detail.name")} type="text" placeholder={t("tags.detail.ph.name")} value={name} hint="" error="" isDisabled={false} onChange={handleNameChange} />
        </ModalContent>
        <ModalFooter>
          <Button variant="danger" onClick={handleDeleteClick}>{t("common.delete")}</Button>
          <ButtonGroup>
            <Button onClick={handleCancelClick}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={handleUpdateClick}>{t('common.update')}</Button>
          </ButtonGroup>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  )
}