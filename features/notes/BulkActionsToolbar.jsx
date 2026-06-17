import { h, useState } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import { CloseIcon, ArchiveIcon, TrashIcon, CheckIcon } from '../../commons/components/Icon.jsx';
import { showToast } from '../../commons/components/Toast.jsx';
import { openModal, closeModal } from '../../commons/components/Modal.jsx';
import { useNotes } from '../../commons/contexts/NotesContext.jsx';
import { useAppContext } from '../../commons/contexts/AppContext.jsx';
import BulkDeleteModal from './BulkDeleteModal.jsx';
import NotesEditorTags from '../tags/NotesEditorTags.jsx';
import pluralize from '../../commons/utils/pluralize.js';
import { t, getLang } from '../../commons/i18n/index.js';
import "./BulkActionsToolbar.css";

export default function BulkActionsToolbar({ selectedIds, allIds, selectedNotes, onClose, onSelectAll }) {
  const { refreshNotes } = useNotes();
  const { refreshTags } = useAppContext();
  const count = selectedIds.length;
  const isAllSelected = selectedIds.length === allIds.length;

  const [pendingAdds, setPendingAdds] = useState([]);
  const [pendingRemoves, setPendingRemoves] = useState(new Set());

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
    if (tag.tagId > 0 && pendingRemoves.has(tag.tagId)) {
      setPendingRemoves(prev => { const next = new Set(prev); next.delete(tag.tagId); return next; });
      return;
    }
    setPendingAdds(prev => [...prev, tag]);
  }

  function handleRemoveTag(tag) {
    if (tag.tagId < 0) {
      setPendingAdds(prev => prev.filter(t => t !== tag));
      return;
    }
    if (tagMap.has(tag.tagId)) {
      setPendingRemoves(prev => new Set([...prev, tag.tagId]));
    } else {
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

  const hasPending = pendingAdds.length > 0 || pendingRemoves.size > 0;

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
          <NotesEditorTags tags={displayTags} isEditable canCreateTag onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} />
        </div>
        {hasPending && (
          <div className="bulk-actions-toolbar-icon confirm" onClick={handleConfirm}>
            <CheckIcon />
          </div>
        )}
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
