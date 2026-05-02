import { h } from "../../assets/preact.esm.js";
import Button from '../../commons/components/Button.jsx';
import DropdownMenu from '../../commons/components/DropdownMenu.jsx';
import { CloseIcon, SidebarCloseIcon, SidebarOpenIcon, BackIcon, ListOrderedIcon } from "../../commons/components/Icon.jsx";
import isMobile from '../../commons/utils/isMobile.js';
import { t } from "../../commons/i18n/index.js";

export default function NotesEditorToolbar({ note, isNewNote, isEditable, isModal, isSaveLoading, isExpanded, isExpandable, onSaveClick, onSaveAndCloseClick, onEditClick, onEditCancelClick, onCloseClick, onDeleteClick, onArchiveClick, onUnarchiveClick, onRestoreClick, onExpandToggleClick, onPinClick, onUnpinClick, onToggleToc }) {
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
        key: 'toc',
        condition: onToggleToc != null,
        component: <Button variant="ghost" onClick={onToggleToc} data-tooltip={t('notes.toc.toggleTitle')}>
          <ListOrderedIcon />
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
        component: <div onClick={note?.isPinned ? onUnpinClick : onPinClick}>
          {note?.isPinned ? t('notes.pin.unpin') : t('notes.pin.pin')}
        </div>
      },
      {
        key: 'archive',
        condition: !isNewNote && !note?.isDeleted,
        component: <div onClick={note?.isArchived ? onUnarchiveClick : onArchiveClick}>
          {note?.isArchived ? t('notes.archive.unarchive') : t('notes.archive.archive')}
        </div>
      },
      {
        key: 'restore',
        condition: !isNewNote && note?.isDeleted,
        component: <div onClick={onRestoreClick}>{t('notes.restore')}</div>
      },
      {
        key: 'delete',
        condition: !isNewNote && !note?.isDeleted,
        component: <div onClick={onDeleteClick}>{t('common.delete')}</div>
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
    .filter(action => action.condition)
    .map(action => action.component);

  return (
    <div className="notes-editor-toolbar" onClick={handleClick}>
      <div className="left-toolbar">
        {leftToolbarActions}
      </div>
      <div className="right-toolbar">
        {rightToolbarActions}
        <DropdownMenu actions={menuActions} />
      </div>
    </div>
  );
}
