import { h, useState } from "../../assets/preact.esm.js"
import Input from "../../commons/components/Input.jsx";
import NotesEditorTags from "../tags/NotesEditorTags.jsx";
import Button from "../../commons/components/Button.jsx";
import ButtonGroup from "../../commons/components/ButtonGroup.jsx";
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter, closeModal } from "../../commons/components/Modal.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import navigateTo from "../../commons/utils/navigateTo.js";
import "./FocusDetailsModal.css";
import { t } from "../../commons/i18n/index.js";

export default function FocusDetailsModal({ mode, focusMode, refreshFocusModes, refreshTags }) {
  const [name, setName] = useState(focusMode ? focusMode.name : "");
  const [tags, setTags] = useState(focusMode ? focusMode.tags : []);

  let title = t("focus.create.title");
  let buttonName = t("common.create");
  let deleteButton = null;

  if (mode === "edit") {
    title = t("focus.edit.title");
    buttonName = t("common.update");
    deleteButton = <Button variant="danger" onClick={handleDeleteClick}>{t("common.delete")}</Button>;
  }

  function handleNameChange(e) {
    setName(e.target.value);
  }

  function handleAddTag(tag) {
    setTags((prevTags) => [...prevTags, tag]);
    refreshTags();
  }

  function handleRemoveTag(tag) {
    setTags((prevTags) => prevTags.filter(t => t.tagId !== tag.tagId));
    refreshTags();
  }

  function handleCancelClick() {
    closeModal();
  }

  function handleCreateClick() {
    let promise = null;

    const payload = {
      name: name,
      tags: tags
    };

    if (mode === "edit") {
      payload.focusId = focusMode.focusId;
      promise = ApiClient.updateFocusMode(payload);
    } else {
      promise = ApiClient.createFocusMode(payload);
    }

    promise
      .then(newFocusMode => {
        refreshFocusModes();
        closeModal();
        if (mode === "create") {
          navigateTo(`/notes/?focusId=${newFocusMode.focusId}`);
        }
      });
  }

  function handleDeleteClick() {
    ApiClient.deleteFocusMode(focusMode.focusId)
      .then(() => {
        refreshFocusModes();
        closeModal();
        navigateTo("/notes/");
      });
  }

  return (
    <ModalBackdrop onClose={handleCancelClick} isCentered={true}>
      <ModalContainer className="focus-dialog">
        <ModalHeader title={title} onClose={handleCancelClick} />
        <ModalContent>
          <p className="modal-description">{t("focus.desc")}</p>
          <Input id="focus-name" label={t("focus.form.name")} type="text" placeholder={t("focus.form.ph.name")} value={name} hint="" error="" isDisabled={false} onChange={handleNameChange} />
          <div className="form-field-container">
            <label htmlFor="focus-tags">{t('templates.form.tags')}</label>
            <NotesEditorTags tags={tags} isEditable canCreateTag={false} onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} />
          </div>
        </ModalContent>
        <ModalFooter isRightAligned={mode === "create"}>
          {deleteButton}
          <ButtonGroup>
            <Button onClick={handleCancelClick}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={handleCreateClick}>{buttonName}</Button>
          </ButtonGroup>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  )
}