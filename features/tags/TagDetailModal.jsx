import { h, useState } from "../../assets/preact.esm.js"
import Input from "../../commons/components/Input.jsx";
import NotesEditorTags from "./NotesEditorTags.jsx";
import Button from "../../commons/components/Button.jsx";
import ButtonGroup from "../../commons/components/ButtonGroup.jsx";
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter, closeModal } from "../../commons/components/Modal.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import navigateTo from "../../commons/utils/navigateTo.js";
import "./TagDetailModal.css";
import { t } from "../../commons/i18n/index.js";

const TAG_COLORS = [
  { value: "", label: "None", hex: null },
  { value: "red", label: "Red", hex: "#ef4444" },
  { value: "orange", label: "Orange", hex: "#f97316" },
  { value: "amber", label: "Amber", hex: "#f59e0b" },
  { value: "yellow", label: "Yellow", hex: "#eab308" },
  { value: "lime", label: "Lime", hex: "#84cc16" },
  { value: "green", label: "Green", hex: "#22c55e" },
  { value: "teal", label: "Teal", hex: "#14b8a6" },
  { value: "cyan", label: "Cyan", hex: "#06b6d4" },
  { value: "blue", label: "Blue", hex: "#3b82f6" },
  { value: "indigo", label: "Indigo", hex: "#6366f1" },
  { value: "purple", label: "Purple", hex: "#a855f7" },
  { value: "pink", label: "Pink", hex: "#ec4899" },
  { value: "rose", label: "Rose", hex: "#f43f5e" },
];

export { TAG_COLORS };

export default function TagDetailModal({ tag, refreshTags }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color || "");
  const [parentTags, setParentTags] = useState(tag.parentTags || []);

  function handleNameChange(e) {
    setName(e.target.value);
  }

  function handleColorChange(e) {
    setColor(e.target.value);
  }

  function handleAddParentTag(parentTag) {
    setParentTags(prev => [...prev, parentTag]);
  }

  function handleRemoveParentTag(removedTag) {
    setParentTags(prev => prev.filter(t => t.tagId !== removedTag.tagId));
  }

  function handleUpdateClick() {
    const payload = {
      tagId: tag.tagId,
      name: name,
      color: color || ""
    };

    ApiClient.updateTag(payload)
      .then(async () => {
        if (parentTags.length === 0) {
          // Remove parent (set to root)
          if (tag.parentId !== null) {
            await ApiClient.moveTag(tag.tagId, null);
          }
          return;
        }

        // Process chain from deepest (leaf) to root
        // Each step moves the "current" tag under the next parent up
        let tagToMove = tag.tagId;
        for (let i = parentTags.length - 1; i >= 0; i--) {
          const pt = parentTags[i];
          if (pt.tagId === -1) {
            // New tag — create it and set tagToMove under it
            const res = await ApiClient.moveTag(tagToMove, null, pt.name);
            tagToMove = res.parentId;
          } else {
            // Existing tag — set tagToMove under it
            await ApiClient.moveTag(tagToMove, pt.tagId);
            tagToMove = pt.tagId;
          }
        }
      })
      .then(() => {
        refreshTags();
        try { window.dispatchEvent(new CustomEvent('notes:refresh')); } catch(_) {}
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

  const colorSwatches = TAG_COLORS.map(c => {
    const isSelected = color === c.value;
    const swatchStyle = c.hex
      ? `background-color: ${c.hex}; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid ${isSelected ? 'var(--neutral-800)' : 'transparent'}; box-shadow: ${isSelected ? '0 0 0 2px var(--bg-primary)' : 'none'};`
      : `background: linear-gradient(135deg, var(--neutral-200) 45%, var(--neutral-400) 55%); width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid ${isSelected ? 'var(--neutral-800)' : 'transparent'}; box-shadow: ${isSelected ? '0 0 0 2px var(--bg-primary)' : 'none'};`;
    return h('span', {
      key: c.value,
      style: swatchStyle,
      title: c.value || t('tags.color.none'),
      onClick: () => setColor(c.value)
    });
  });

  return (
    <ModalBackdrop onClose={handleCancelClick} isCentered={true}>
      <ModalContainer className="tag-dialog">
        <ModalHeader title={t('tags.detail.manage')} onClose={handleCancelClick} />
        <ModalContent>
          <p className="modal-description">{t("tags.detail.desc")}</p>
          <Input id="tag-name" label={t("tags.detail.name")} type="text" placeholder={t("tags.detail.ph.name")} value={name} hint="" error="" isDisabled={false} onChange={handleNameChange} />
          <div className="tag-color-section">
            <label>{t("tags.detail.color")}</label>
            <div className="tag-color-swatches">
              {colorSwatches}
            </div>
          </div>
          <div className="form-field-container">
            <label>{t("tags.detail.parent")}</label>
            <NotesEditorTags tags={parentTags} isEditable canCreateTag onAddTag={handleAddParentTag} onRemoveTag={handleRemoveParentTag} />
          </div>
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
