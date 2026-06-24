import { h } from "../../assets/preact.esm.js"
import { ListViewIcon, CardViewIcon, GalleryViewIcon, AttachmentsIcon, BrushCleaningIcon, MinusIcon, PlusIcon } from "../../commons/components/Icon.jsx";
import useSearchParams from "../../commons/components/useSearchParams.jsx";
import { openModal } from "../../commons/components/Modal.jsx";
import { showToast } from "../../commons/components/Toast.jsx";
import { AppProvider, useAppContext } from '../../commons/contexts/AppContext.jsx';
import { NotesProvider, useNotes } from "../../commons/contexts/NotesContext.jsx";
import { HamburgerIcon } from '../../commons/components/Icon.jsx';
import ButtonGroup from '../../commons/components/ButtonGroup.jsx';
import Button from '../../commons/components/Button.jsx';
import ApiClient from "../../commons/http/ApiClient.js";
import navigateTo from "../../commons/utils/navigateTo.js";
import isMobile from "../../commons/utils/isMobile.js";
import TrashClearModal from "./TrashClearModal.jsx"
import "./NotesListToolbar.css";
import { t } from "../../commons/i18n/index.js";
import { useLayout } from "../../commons/contexts/LayoutContext.jsx";


export default function NotesListToolbar({ onViewChange, view, cardSize, onCardSizeChange, isGlobalView, onGlobalViewToggle }) {

  const searchParams = useSearchParams();
  const { refreshNotes } = useNotes();
  const { tags, focusModes } = useAppContext();

  const selectedTagId = searchParams.get("tagId");
  const selectedFocusId = searchParams.get("focusId");
  const isArchivesPage = searchParams.get("isArchived") === "true";
  const isTrashPage = searchParams.get("isDeleted") === "true";

  let listName = t('notes.list.all');

  if (selectedFocusId !== null) {
    const focusId = parseInt(selectedFocusId, 10);
    const focusMode = focusModes.find(fm => fm.focusId === focusId);
    if (focusMode !== undefined) {
      listName = focusMode.name;
    }
  } else if (selectedTagId !== null) {
    const tagId = parseInt(selectedTagId, 10);
    const tag = tags.find(t => t.tagId === tagId);
    if (tag !== undefined) {
      listName = tag.name;
    }
  } else if (isArchivesPage === true) {
    listName = t('notes.list.archived');
  } else if (isTrashPage === true) {
    listName = t('notes.list.trash');
  }

  function handleTrashCleared() {
    navigateTo("/notes/?isDeleted=true")
    refreshNotes(null, null, false, true);
  }

  function handleClearTrash() {
    openModal(
      <AppProvider>
        <NotesProvider>
          <TrashClearModal onTrashCleared={handleTrashCleared} />
        </NotesProvider>
      </AppProvider>
    );
  }

  let actions = [];

  if (isTrashPage) {
    actions = [
      {
        icon: BrushCleaningIcon,
        onClick: handleClearTrash,
        title: t('notes.trash.clear')
      }
    ];
  } else {
    actions = [
      {
        icon: ListViewIcon,
        onClick: () => onViewChange("list"),
        title: t('notes.view.list')
      },
      {
        icon: CardViewIcon,
        onClick: () => onViewChange("card"),
        title: t('notes.view.card')
      },
      {
        icon: GalleryViewIcon,
        onClick: () => onViewChange("gallery"),
        title: t('notes.view.gallery')
      },
      {
        icon: AttachmentsIcon,
        onClick: () => onViewChange("attachments"),
        title: t('notes.view.attachments')
      }
    ];
  }

    return (
    <Toolbar actions={actions} listName={listName} className="notes-list-toolbar" view={view} cardSize={cardSize} onCardSizeChange={onCardSizeChange} isGlobalView={isGlobalView} onGlobalViewToggle={onGlobalViewToggle} />
  );
}

function Toolbar({ actions, listName, className, view, cardSize = 240, onCardSizeChange = () => {}, isGlobalView = false, onGlobalViewToggle = () => {} }) {
  const { toggleSidebar } = useLayout();
  const buttons = actions.map(action => (
    <div key={action.title} {...action}>
      <action.icon />
    </div>
  ));

  let title = null;
  if (isMobile() === true) {
    title = <div className="notes-list-toolbar-name">{listName}</div>;
  }

  // Card size helpers
  const MIN = 200, MAX = 360;
  const MID = Math.round((MIN + MAX) / 2);
  const B1 = (MIN + MID) / 2;
  const B2 = (MID + MAX) / 2;
  const getIdx = (v) => (v < B1 ? 0 : (v < B2 ? 1 : 2));
  const inc = () => { const idx = getIdx(cardSize || MID); const presets = [MIN, MID, MAX]; onCardSizeChange(presets[Math.min(2, idx + 1)]); };
  const dec = () => { const idx = getIdx(cardSize || MID); const presets = [MIN, MID, MAX]; onCardSizeChange(presets[Math.max(0, idx - 1)]); };

    return (
    <div className={className}>
      <ButtonGroup isMobile={true}>
        <div onClick={toggleSidebar} title={t('notes.sidebar.toggle')}>
          <HamburgerIcon />
        </div>
      </ButtonGroup>
      {title}
      <ButtonGroup>
        {buttons}
        {actions.length > 1 && (
          <div className={`view-mode-toggle ${isGlobalView ? 'is-on' : ''}`} onClick={onGlobalViewToggle}>
            {t('notes.view.global')}
            <span className="view-mode-toggle-track"></span>
          </div>
        )}
      </ButtonGroup>
      {(view === 'card' && isMobile() !== true) && (
        <div className="card-size-control">
          <span className="card-size-icon" role="button" title={t('notes.cardSize.decrease')} aria-label={t('notes.cardSize.decrease')} data-tooltip={t('notes.cardSize.decrease')} onClick={dec}><MinusIcon /></span>
          <input
            type="range"
            min="200"
            max="360"
            step="1"
            value={cardSize}
            onInput={e => onCardSizeChange(parseInt(e.target.value, 10))}
            title={t('notes.cardSize.tooltip')}
            aria-label={t('notes.cardSize.tooltip')}
            data-tooltip={t('notes.cardSize.tooltip')}
          />
          <span className="card-size-icon" role="button" title={t('notes.cardSize.increase')} aria-label={t('notes.cardSize.increase')} data-tooltip={t('notes.cardSize.increase')} onClick={inc}><PlusIcon /></span>
        </div>
      )}
      {view === 'gallery' && isMobile() !== true && (
        <div className="toolbar-cleanup">
          <Button onClick={async () => {
            try {
              const res = await ApiClient.cleanupImages();
              showToast(t('images.cleanup.toast', { missing: res?.RemovedMissing||0, orphans: res?.RemovedOrphans||0, registered: res?.Registered||0, linksRebuilt: res?.LinksRebuilt||0 }));
              window.dispatchEvent(new CustomEvent('attachments:refresh'));
            } catch (e) {
              console.error('Cleanup images failed:', e);
              showToast(t('images.cleanup.fail'));
            }
          }}>{t('images.cleanup.button')}</Button>
        </div>
      )}
      {view === 'attachments' && isMobile() !== true && (
        <div className="toolbar-cleanup">
          <Button onClick={async () => {
            try {
              const res = await ApiClient.cleanupAttachments();
              showToast(t('attachments.cleanup.toast', { orphans: res?.removedOrphans||0, linksRebuilt: res?.linksRebuilt||0 }));
              window.dispatchEvent(new CustomEvent('attachments:refresh'));
            } catch (e) {
              console.error('Cleanup attachments failed:', e);
              showToast(t('attachments.cleanup.fail'));
            }
          }}>{t('attachments.cleanup.button')}</Button>
        </div>
      )}
    </div>
  );
}