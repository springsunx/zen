import { h, Fragment } from "../../assets/preact.esm.js";
import Button from '../../commons/components/Button.jsx';
import DropdownMenu from '../../commons/components/DropdownMenu.jsx';
import { CloseIcon, SidebarCloseIcon, SidebarOpenIcon, BackIcon, ListOrderedIcon, CopyIcon } from "../../commons/components/Icon.jsx";
import isMobile from '../../commons/utils/isMobile.js';
import { t } from "../../commons/i18n/index.js";
import { showToast } from "../../commons/components/Toast.jsx";

export default function NotesEditorToolbar({ note, isNewNote, isEditable, isModal, isSaveLoading, isExpanded, isExpandable, onSaveClick, onSaveAndCloseClick, onEditClick, onEditCancelClick, onCloseClick, onDeleteClick, onArchiveClick, onUnarchiveClick, onRestoreClick, onExpandToggleClick, onPinClick, onUnpinClick, onToggleToc, isFitToWindow, onFitToWindowToggle }) {
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
        key: 'fitToWindow',
        condition: isExpanded === true && !isMobile() && onFitToWindowToggle != null,
        component: <Button variant="ghost" onClick={onFitToWindowToggle} data-tooltip={isFitToWindow ? t('notes.editor.fitToWindow.exit') : t('notes.editor.fitToWindow')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            {isFitToWindow
              ? <Fragment><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></Fragment>
              : <Fragment><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></Fragment>
            }
          </svg>
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