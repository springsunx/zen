import { h } from "../../assets/preact.esm.js"
import { ListViewIcon, CardViewIcon, BrushCleaningIcon, MinusIcon, PlusIcon, SearchIcon, CloseIcon } from "../../commons/components/Icon.jsx";
import useSearchParams from "../../commons/components/useSearchParams.jsx";
import { openModal } from "../../commons/components/Modal.jsx";
import { AppProvider, useAppContext } from '../../commons/contexts/AppContext.jsx';
import { NotesProvider, useNotes } from "../../commons/contexts/NotesContext.jsx";
import { HamburgerIcon } from '../../commons/components/Icon.jsx';
import ButtonGroup from '../../commons/components/ButtonGroup.jsx';
import navigateTo from "../../commons/utils/navigateTo.js";
import isMobile from "../../commons/utils/isMobile.js";
import TrashClearModal from "./TrashClearModal.jsx"
import "./NotesListToolbar.css";
import { t } from "../../commons/i18n/index.js";
import { useLayout } from "../../commons/contexts/LayoutContext.jsx";


export default function NotesListToolbar({ onViewChange, view, cardSize, onCardSizeChange, isGlobalView, onGlobalViewToggle, showFilter = false, filterQuery = "", onFilterQueryChange = () => {} }) {

  const searchParams = useSearchParams();
  const { refreshNotes } = useNotes();
  const { tags, focusModes, refreshTags } = useAppContext();

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
    refreshTags(selectedFocusId, isArchivesPage, isTrashPage);
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
      }
    ];
  }

    return (
    <Toolbar actions={actions} listName={listName} className="notes-list-toolbar" view={view} cardSize={cardSize} onCardSizeChange={onCardSizeChange} isGlobalView={isGlobalView} onGlobalViewToggle={onGlobalViewToggle} showFilter={showFilter} filterQuery={filterQuery} onFilterQueryChange={onFilterQueryChange} />
  );
}

function Toolbar({ actions, listName, className, view, cardSize = 240, onCardSizeChange = () => {}, isGlobalView = false, onGlobalViewToggle = () => {}, showFilter, filterQuery, onFilterQueryChange }) {
  const { toggleSidebar } = useLayout();
  const buttons = actions.map(action => (
    <div key={action.title} {...action}>
      <action.icon />
    </div>
  ));

  let title = null;
  if (isMobile() === true && !showFilter) {
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
      <div className="notes-list-toolbar-main">
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
      </div>
      {showFilter && (
        <div className="notes-list-filter">
          <SearchIcon />
          <input type="search" value={filterQuery} onInput={(event) => onFilterQueryChange(event.target.value)} placeholder={t('notes.filter.placeholder')} aria-label={t('notes.filter.label')} />
          {filterQuery && <button type="button" onClick={() => onFilterQueryChange("")} aria-label={t('notes.filter.clear')}><CloseIcon /></button>}
        </div>
      )}
    </div>
  );
}
