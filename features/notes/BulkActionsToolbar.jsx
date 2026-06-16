import { h } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import { CloseIcon, ArchiveIcon, TrashIcon } from '../../commons/components/Icon.jsx';
import { showToast } from '../../commons/components/Toast.jsx';
import { openModal, closeModal } from '../../commons/components/Modal.jsx';
import { useNotes } from '../../commons/contexts/NotesContext.jsx';
import BulkDeleteModal from './BulkDeleteModal.jsx';
import NotesEditorTags from '../tags/NotesEditorTags.jsx';
import pluralize from '../../commons/utils/pluralize.js';
import { t, getLang } from '../../commons/i18n/index.js';
import "./BulkActionsToolbar.css";

export default function BulkActionsToolbar({ selectedIds, allIds, selectedNotes, onClose, onSelectAll }) {
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

  let selectAllButton = null;
  if (isAllSelected !== true) {
    selectAllButton = <div className="bulk-actions-toolbar-select-all" onClick={onSelectAll}>{t('bulk.selectAll')}</div>;
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

  return (
    <div className="bulk-actions-toolbar">
      <div className="bulk-actions-toolbar-left">
        <div className="bulk-actions-toolbar-close" onClick={onClose}>
          <CloseIcon />
        </div>
        <span className="bulk-actions-toolbar-count">{t('bulk.countSelected', {count, noteNoun: getLang()==='en'? pluralize(count,'note'): ''})}</span>
        {selectAllButton}
      </div>
      <div className="bulk-actions-toolbar-right">
        <div className="bulk-actions-toolbar-tags">
          <NotesEditorTags tags={mergedTags} isEditable canCreateTag onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} />
        </div>
        <div className="bulk-actions-toolbar-icon" onClick={handleArchiveClick}>
          <ArchiveIcon />
        </div>
        <div className="bulk-actions-toolbar-icon" onClick={handleTrashClick}>
          <TrashIcon />
        </div>
      </div>
    </div>
  );
}
