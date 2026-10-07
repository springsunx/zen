import { h } from "../../assets/preact.esm.js";
import Button from '../../commons/components/Button.jsx';
import DropdownMenu from '../../commons/components/DropdownMenu.jsx';
import { CloseIcon, SidebarCloseIcon, SidebarOpenIcon, BackIcon, CopyIcon, ShareIcon } from "../../commons/components/Icon.jsx";
import isMobile from '../../commons/utils/isMobile.js';
import { getLang, t } from "../../commons/i18n/index.js";
import { showToast } from "../../commons/components/Toast.jsx";

export default function NotesEditorToolbar({ note, isNewNote, isEditable, isModal, isSaveLoading, isExpanded, isExpandable, onSaveClick, onSaveAndCloseClick, onEditClick, onEditCancelClick, onCloseClick, onDeleteClick, onArchiveClick, onUnarchiveClick, onRestoreClick, onExpandToggleClick, onPinClick, onUnpinClick, onVersionsClick, onToggleShare }) {
  const saveButtonText = isSaveLoading ? t('common.saving') : t('common.save');
  const saveAndCloseText = t('editor.saveAndClose');

  function handleClick(e) {
    if (e.target.className !== "notes-editor-toolbar") {
      e.stopPropagation();
      return;
    }
    document.querySelector(".notes-editor-container").scrollTo({ top: 0, behavior: 'smooth' });
  }

  const actions = {
    left: [
      {
        key: 'share',
        condition: onToggleShare != null && !isNewNote,
        component: <Button variant="ghost" onClick={onToggleShare} data-tooltip={t('notes.share.toggleTitle') || 'Share'}>
          <ShareIcon />
        </Button>
      },
      {
        key: 'copyMarkdown',
        condition: !isNewNote && note?.content != null,
        component: <Button variant="ghost" onClick={async () => {
          try {
            await navigator.clipboard.writeText(note.content);
            showToast(t('notes.editor.copyMarkdown.success'));
          } catch (e) {
            console.error('Copy markdown failed:', e);
            showToast(t('notes.editor.copyMarkdown.failed'));
          }
        }} data-tooltip={t('notes.editor.copyMarkdown.tooltip')}>
          <CopyIcon />
        </Button>
      },
      {
        key: 'expand',
        condition: isExpandable === true && !isMobile(),
        component: <Button variant="ghost" onClick={onExpandToggleClick} data-tooltip={isExpanded ? t('notes.editor.collapse') : t('notes.editor.expand')}>
          {isExpanded ? <SidebarCloseIcon /> : <SidebarOpenIcon />}
        </Button>
      },
      {
        key: 'back',
        condition: isMobile() && !isNewNote,
        component: <Button variant="ghost" onClick={() => window.history.back()}><BackIcon /></Button>
      }
    ],
    right: [
      {
        key: 'close',
        condition: isModal,
        component: <Button variant="ghost" onClick={onCloseClick}><CloseIcon /></Button>
      },
      {
        key: 'save',
        condition: isEditable,
        component: <Button variant="ghost" isDisabled={isSaveLoading} onClick={() => onSaveClick(false)}>{saveButtonText}</Button>
      },
      {
        key: 'saveClose',
        condition: isEditable,
        component: <Button variant="ghost" isDisabled={isSaveLoading} onClick={onSaveAndCloseClick}>{saveAndCloseText}</Button>
      },
      {
        key: 'cancel',
        condition: isEditable,
        component: <Button variant="ghost" onClick={onEditCancelClick}>{t('common.cancel')}</Button>
      },
      {
        key: 'edit',
        condition: !isEditable,
        component: <Button variant="ghost" onClick={onEditClick}>{t('common.edit')}</Button>
      }
    ],
    menu: [
      {
        key: 'pin',
        condition: !isNewNote && !note?.isDeleted && !note?.isArchived,
        component: <div>
          {note?.isPinned ? t('notes.pin.unpin') : t('notes.pin.pin')}
        </div>,
        onClick: note?.isPinned ? onUnpinClick : onPinClick
      },
      {
        key: 'archive',
        condition: !isNewNote && !note?.isDeleted,
        component: <div>
          {note?.isArchived ? t('notes.archive.unarchive') : t('notes.archive.archive')}
        </div>,
        onClick: note?.isArchived ? onUnarchiveClick : onArchiveClick
      },
      {
        key: 'restore',
        condition: !isNewNote && note?.isDeleted,
        component: <div>{t('notes.restore')}</div>,
        onClick: onRestoreClick
      },
      {
        key: 'versions',
        condition: !isNewNote && !note?.isDeleted && onVersionsClick != null,
        component: <div>{t('notes.versions')}</div>,
        onClick: onVersionsClick
      },
      {
        key: 'delete',
        condition: !isNewNote && !note?.isDeleted,
        component: <div>{t('common.delete')}</div>,
        onClick: onDeleteClick
      }
    ]
  };

  const leftToolbarActions = actions.left
    .filter(action => action.condition)
    .map(action => action.component);

  const rightToolbarActions = actions.right
    .filter(action => action.condition)
    .map(action => action.component);

  const menuActions = actions.menu
    .filter(action => action.condition);

  const noteMetadata = !isNewNote && note ? (
    <div className="note-menu-metadata">
      <div className="note-menu-metadata-row"><span>{t("notes.metadata.createdAt")}</span><span>{formatNoteDate(note.createdAt)}</span></div>
      <div className="note-menu-metadata-row"><span>{t("notes.metadata.updatedAt")}</span><span>{formatNoteDate(note.updatedAt)}</span></div>
    </div>
  ) : null;

  return (
    <div className="notes-editor-toolbar" onClick={handleClick}>
      <div className="left-toolbar">
        {leftToolbarActions}
      </div>
      <div className="right-toolbar">
        {rightToolbarActions}
        <DropdownMenu actions={menuActions} footer={noteMetadata} />
      </div>
    </div>
  );
}

function formatNoteDate(value) {
  if (!value) return t("common.unknown");
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) return t("common.unknown");
  return new Intl.DateTimeFormat(getLang(), { dateStyle: "medium" }).format(date);
}
