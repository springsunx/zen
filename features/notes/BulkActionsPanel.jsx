import { h, useState } from "../../assets/preact.esm.js"
import { CloseIcon, ArchiveIcon, TrashIcon, FileCheckIcon, CheckIcon } from '../../commons/components/Icon.jsx';
import ApiClient from '../../commons/http/ApiClient.js';
import { showToast } from '../../commons/components/Toast.jsx';
import { openModal, closeModal } from '../../commons/components/Modal.jsx';
import { useNotes } from '../../commons/contexts/NotesContext.jsx';
import { useAppContext } from '../../commons/contexts/AppContext.jsx';
import BulkDeleteModal from './BulkDeleteModal.jsx';
import NotesEditorTags from '../tags/NotesEditorTags.jsx';
import pluralize from '../../commons/utils/pluralize.js';
import { t, getLang } from '../../commons/i18n/index.js';
import "./BulkActionsPanel.css";

export default function BulkActionsPanel({ selectedIds, allIds, selectedNotes, onClose, onSelectAll }) {
  const { refreshNotes } = useNotes();
  const { refreshTags } = useAppContext();
  const count = selectedIds.length;
  const isAllSelected = selectedIds.length === allIds.length;

  const [pendingAdds, setPendingAdds] = useState([]);
  const [pendingRemoves, setPendingRemoves] = useState(new Set());

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

  // Build display tags: original minus removed, plus pending adds
  const displayTags = [];
  for (const [id, tag] of tagMap) {
    if (!pendingRemoves.has(id)) {
      displayTags.push(tag);
    }
  }
  for (const tag of pendingAdds) {
    displayTags.push(tag);
  }

  function handleAddTag(tag) {
    // If it's a tag that was pending remove, just undo the remove
    if (tag.tagId > 0 && pendingRemoves.has(tag.tagId)) {
      setPendingRemoves(prev => { const next = new Set(prev); next.delete(tag.tagId); return next; });
      return;
    }
    // Otherwise add to pending
    setPendingAdds(prev => [...prev, tag]);
  }

  function handleRemoveTag(tag) {
    // If it's a pending add, just remove from adds
    if (tag.tagId < 0) {
      setPendingAdds(prev => prev.filter(t => t !== tag));
      return;
    }
    // If it was originally there, mark for removal
    if (tagMap.has(tag.tagId)) {
      setPendingRemoves(prev => new Set([...prev, tag.tagId]));
    } else {
      // It's a pending add with a real id, remove from adds
      setPendingAdds(prev => prev.filter(t => t.tagId !== tag.tagId));
    }
  }

  function handleConfirm() {
    const promises = [];
    for (const tag of pendingAdds) {
      const tagId = tag.tagId === -1 ? 0 : tag.tagId;
      const tagName = tag.tagId === -1 ? tag.name : "";
      promises.push(ApiClient.bulkAddTag(selectedIds, tagId, tagName));
    }
    for (const tagId of pendingRemoves) {
      promises.push(ApiClient.bulkRemoveTag(selectedIds, tagId));
    }
    if (promises.length === 0) return;
    Promise.all(promises).then(() => {
      showToast(t('bulk.toast.tagsUpdated', { count }));
      refreshNotes();
      refreshTags();
      onClose();
    }).catch(() => {
      showToast(t('bulk.toast.tagsUpdateFailed'));
    });
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

  const hasPending = pendingAdds.length > 0 || pendingRemoves.size > 0;

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
        <NotesEditorTags tags={displayTags} isEditable canCreateTag onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} />
      </div>

      {hasPending && (
        <div className="bulk-actions-panel-row primary" onClick={handleConfirm}>
          <div className="bulk-actions-panel-row-icon">
            <CheckIcon />
          </div>
          <span className="bulk-actions-panel-row-label">{t('bulk.confirmTags')}</span>
        </div>
      )}

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
