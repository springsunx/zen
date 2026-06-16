import { h } from "../../assets/preact.esm.js"
import { CloseIcon, ArchiveIcon, TrashIcon, FileCheckIcon } from '../../commons/components/Icon.jsx';
import ApiClient from '../../commons/http/ApiClient.js';
import { showToast } from '../../commons/components/Toast.jsx';
import { openModal, closeModal } from '../../commons/components/Modal.jsx';
import { useNotes } from '../../commons/contexts/NotesContext.jsx';
import BulkDeleteModal from './BulkDeleteModal.jsx';
import NotesEditorTags from '../tags/NotesEditorTags.jsx';
import pluralize from '../../commons/utils/pluralize.js';
import { t, getLang } from '../../commons/i18n/index.js';
import "./BulkActionsPanel.css";

export default function BulkActionsPanel({ selectedIds, allIds, selectedNotes, onClose, onSelectAll }) {
  const { refreshNotes } = useNotes();
  const count = selectedIds.length;
  const isAllSelected = selectedIds.length === allIds.length;

  // Collect unique tags from all selected notes
  const tagMap = new Map();
  if (selectedNotes) {
    for (const note of selectedNotes) {
      if (note.tags) {
        for (const tag of note.tags) {
          if (!tagMap.has(tag.tagId)) {
            tagMap.set(tag.tagId, tag);
          }
        }
      }
    }
  }
  const mergedTags = Array.from(tagMap.values());

  function handleAddTag(tag) {
    const tagId = tag.tagId === -1 ? 0 : tag.tagId;
    const tagName = tag.tagId === -1 ? tag.name : "";
    ApiClient.bulkAddTag(selectedIds, tagId, tagName).then(() => {
      showToast(t('bulk.toast.tagAdded', { count, tagName: tag.name }));
      refreshNotes();
    }).catch(() => { showToast(t('bulk.toast.tagAddFailed')); });
  }

  function handleRemoveTag(tag) {
    ApiClient.bulkRemoveTag(selectedIds, tag.tagId).then(() => {
      showToast(t('bulk.toast.tagRemoved', { count, tagName: tag.name }));
      refreshNotes();
    }).catch(() => { showToast(t('bulk.toast.tagRemoveFailed')); });
  }

  function handleTrashClick() {
    openModal(
      <BulkDeleteModal
        count={count}
        onDeleteClick={handleTrashConfirmClick}
        onCloseClick={() => closeModal()}
      />
    );
  }

  function handleTrashConfirmClick() {
    ApiClient.bulkDeleteNotes(selectedIds)
      .then(() => {
        closeModal();
        showToast(t('bulk.toast.trashed', {count, noteNoun: getLang()==='en'? pluralize(count,'note'): ''}));
        refreshNotes();
        onClose();
      })
      .catch(() => {
        showToast(t('bulk.toast.trashFailed'));
      });
  }

  function handleArchiveClick() {
    ApiClient.bulkArchiveNotes(selectedIds)
      .then(() => {
        showToast(t('bulk.toast.archived', {count, noteNoun: getLang()==='en'? pluralize(count,'note'): ''}));
        refreshNotes();
        onClose();
      })
      .catch(() => {
        showToast(t('bulk.toast.archiveFailed'));
      });
  }

  let selectAllRow = null;
  if (isAllSelected !== true) {
    selectAllRow = (
      <div className="bulk-actions-panel-row" onClick={onSelectAll}>
        <div className="bulk-actions-panel-row-icon">
          <FileCheckIcon />
        </div>
        <span className="bulk-actions-panel-row-label">{t('bulk.selectEverything')}</span>
      </div>
    );
  }

  return (
    <div className="bulk-actions-panel">
      <div className="bulk-actions-panel-count">{t('bulk.countSelected', {count, noteNoun: getLang()==='en'? pluralize(count,'note'): ''})}</div>

      {selectAllRow}

      <div className="bulk-actions-panel-tags">
        <label>{t('bulk.tags')}</label>
        <NotesEditorTags tags={mergedTags} isEditable canCreateTag onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} />
      </div>

      <div className="bulk-actions-panel-row" onClick={handleArchiveClick}>
        <div className="bulk-actions-panel-row-icon">
          <ArchiveIcon />
        </div>
        <span className="bulk-actions-panel-row-label">{t('bulk.archive')}</span>
      </div>

      <div className="bulk-actions-panel-row" onClick={handleTrashClick}>
        <div className="bulk-actions-panel-row-icon">
          <TrashIcon />
        </div>
        <span className="bulk-actions-panel-row-label">{t('bulk.delete')}</span>
      </div>

      <div className="bulk-actions-panel-row cancel" onClick={onClose}>
        <div className="bulk-actions-panel-row-icon">
          <CloseIcon />
        </div>
        <span className="bulk-actions-panel-row-label">{t('bulk.cancel')}</span>
      </div>
    </div>
  );
}
