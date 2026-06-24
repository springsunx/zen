import { h, Fragment, useMemo } from "../../assets/preact.esm.js"
import NotesListToolbar from './NotesListToolbar.jsx';
import Link from '../../commons/components/Link.jsx';
import Spinner from '../../commons/components/Spinner.jsx';
import Button from '../../commons/components/Button.jsx';
import ApiClient from '../../commons/http/ApiClient.js';
import { showToast } from '../../commons/components/Toast.jsx';
import { openModal, closeModal } from '../../commons/components/Modal.jsx';
import { AppProvider } from '../../commons/contexts/AppContext.jsx';
import { NotesProvider, useNotes } from "../../commons/contexts/NotesContext.jsx";
import NoteDeleteModal from './NoteDeleteModal.jsx';
import { PinIcon, PencilIcon, CheckboxUncheckedIcon, CheckboxCheckedIcon, NotesIcon, ImagesIcon, AttachmentsIcon, ArchiveIcon, TrashIcon } from '../../commons/components/Icon.jsx';
import renderMarkdown from '../../commons/utils/renderMarkdown.js';
import formatDate from '../../commons/utils/formatDate.js';
import isMobile from "../../commons/utils/isMobile.js";
import navigateTo from "../../commons/utils/navigateTo.js";
import { requestEditMode } from "../../commons/utils/editMode.js";
import useLongPress from "../../commons/utils/useLongPress.js";
import ImageGallery from "./ImageGallery.jsx";
import ImageTable from "./ImageTable.jsx";
import AttachmentList from "./AttachmentList.jsx";
import NotesEditorModal from './NotesEditorModal.jsx';
import EmptyState from '../../commons/components/EmptyState.jsx';
import "./NotesList.css";
import { t } from "../../commons/i18n/index.js";
import { TAG_COLORS } from "../tags/TagDetailModal.jsx";
import useSearchParams from '../../commons/components/useSearchParams.jsx';

export default function NotesList({ notes = [], total, isLoading, images = [], imagesTotal, isImagesLoading, attachments = [], attachmentsTotal, isAttachmentsLoading, view, onViewChange, onLoadMoreClick, onLoadMoreImagesClick, onLoadMoreAttachmentsClick, isMultiSelect, selectedIds, onMultiSelectStart, onToggleSelect, cardSize = 240, onCardSizeChange = () => {}, isGlobalView = false, onGlobalViewToggle = () => {} }) {
  const searchParams = useSearchParams();
  const isArchivesPage = searchParams.get("isArchived") === "true";
  const isTrashPage = searchParams.get("isDeleted") === "true";
  let listClassName = "notes-list";
  let content = <div className="notes-list-spinner"><Spinner /></div>;
  let loadMoreHandler = onLoadMoreClick;
  let currentTotal = total;
  let currentItems = notes;

  let items = notes.map(note => <NotesListItem note={note} key={note.noteId} isMultiSelect={isMultiSelect} isSelected={selectedIds.includes(note.noteId)} onMultiSelectStart={onMultiSelectStart} onToggleSelect={onToggleSelect} isArchivesPage={isArchivesPage} isTrashPage={isTrashPage} />);

  if (view === "card") {
    listClassName = "";
    items = notes.map((note, index) => <NotesGridItem note={note} key={note.noteId} index={index} cardHeight={Math.round((cardSize||200)*1.41421356)} />);
    items = (
      <div className="notes-grid" style={{ gridTemplateColumns: view==="card" ? `repeat(auto-fill, minmax(${cardSize}px, 1fr))` : undefined }} >
        {items}
      </div>
    );
  } else if (view === "gallery") {
    listClassName = "notes-image-table";
    items = <ImageTable images={images} />;
    loadMoreHandler = onLoadMoreImagesClick;
    currentTotal = imagesTotal;
    currentItems = images;
  } else if (view === "attachments") {
    listClassName = "notes-attachments-list";
    items = <AttachmentList attachments={attachments} />;
    loadMoreHandler = onLoadMoreAttachmentsClick;
    currentTotal = attachmentsTotal;
    currentItems = attachments;
  }

  const isViewLoading = (view === "gallery" && isImagesLoading) || (view === "attachments" && isAttachmentsLoading) || (view !== "gallery" && view !== "attachments" && isLoading);
  if (!isViewLoading) {
    content = (
      <div className={listClassName} style={view==="card" ? {"--card-min-width": `${cardSize}px`, "--card-height": `${Math.round(cardSize*1.75)}px`, } : null}>
        {items}
        <LoadMoreButton items={currentItems} total={currentTotal} onLoadMoreClick={loadMoreHandler} />
        <EmptyList items={currentItems} view={view} />
      </div>
    )
  }

  return (
    <>
      <NotesListToolbar onViewChange={onViewChange} view={view} cardSize={cardSize} onCardSizeChange={onCardSizeChange} isGlobalView={isGlobalView} onGlobalViewToggle={onGlobalViewToggle} />
      {content}
    </>
  );
}

function NotesListItem({ note, isMultiSelect, isSelected, onMultiSelectStart, onToggleSelect, isArchivesPage, isTrashPage }) {
  const link = `/notes/${note.noteId}`;
  const updatedAtDate = new Date(note.updatedAt);
  const shortUpdatedAt = formatDate(updatedAtDate);
  const fullUpdatedAt = updatedAtDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const tags = note.tags?.map(tag => {
    const tagColor = tag.color ? (TAG_COLORS.find(c => c.value === tag.color)?.hex || null) : null;
    const style = tagColor
      ? `background-color: ${tagColor}22; color: ${tagColor}; padding: 1px 8px; border-radius: 10px;`
      : `background-color: var(--neutral-100); padding: 1px 8px; border-radius: 10px;`;
    return <div className="notes-list-item-tag" key={tag.tagId} style={style}>{tag.name}</div>;
  });
  const longPress = useLongPress(() => onMultiSelectStart(note.noteId));
  let title = <div className="notes-list-item-title">{note.title}</div>

  if (note.title === "") {
    let preview = note.snippet.split(" ").slice(0, 10).join(" ");
    if (preview.startsWith("![](/images/")) {
      preview = "Image";
    }
    title = <div className="notes-list-item-title untitled">{preview}</div>
  }

  function handlePin(e) {
    e.preventDefault();
    e.stopPropagation();
    const apiCall = note.isPinned ? ApiClient.unpinNote : ApiClient.pinNote;
    apiCall(note.noteId)
      .then(() => window.dispatchEvent(new CustomEvent('notes:refresh')))
      .catch(err => console.error('Pin toggle failed:', err));
  }

  function handleArchive(e) {
    e.preventDefault();
    e.stopPropagation();
    const apiCall = isArchivesPage ? ApiClient.unarchiveNote : ApiClient.archiveNote;
    apiCall(note.noteId)
      .then(() => {
        showToast(isArchivesPage ? t('notes.archive.unarchived') : t('notes.archive.archived'));
        window.dispatchEvent(new CustomEvent('notes:refresh'));
      })
      .catch(err => console.error('Archive toggle failed:', err));
  }

  function handleDelete(e) {
    e.preventDefault();
    e.stopPropagation();
    if (isTrashPage) {
      ApiClient.restoreNote(note.noteId)
        .then(() => {
          showToast(t('notes.delete.restored'));
          window.dispatchEvent(new CustomEvent('notes:refresh'));
        })
        .catch(err => console.error('Restore failed:', err));
      return;
    }
    openModal(
      <AppProvider>
        <NotesProvider>
          <NoteDeleteModal
            onDeleteClick={() => {
              ApiClient.deleteNote(note.noteId)
                .then(() => {
                  closeModal();
                  showToast(t('notes.delete.deleted'));
                  window.dispatchEvent(new CustomEvent('notes:refresh'));
                })
                .catch(err => console.error('Delete failed:', err));
            }}
            onCloseClick={() => closeModal()}
          />
        </NotesProvider>
      </AppProvider>
    );
  }

  function handleEdit(e) {
    e.preventDefault();
    e.stopPropagation();
    requestEditMode();
    navigateTo(`/notes/${note.noteId}`, true);
  }

  if (isMultiSelect === true) {
    const checkbox = (
      <div className={`notes-list-item-checkbox ${isSelected ? 'is-checked' : ''}`}>
        {isSelected === true ? <CheckboxCheckedIcon /> : <CheckboxUncheckedIcon />}
      </div>
    );

    return (
      <div {...longPress} className={`notes-list-item ${note.isPinned ? 'pinned' : ''} ${isSelected ? 'is-selected' : ''}`} onClick={() => onToggleSelect(note.noteId)}>
        {checkbox}
        <div className="notes-list-item-body">
          <div className="notes-list-item-header">
            {title}
          </div>
          <div className="notes-list-item-subcontainer">
            <div className="notes-list-item-tags">{tags}</div>
            <div className="notes-list-item-subtext" title={fullUpdatedAt}>{shortUpdatedAt}</div>
          </div>
        </div>
      </div>
    );
  }

  function formatNoteSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1024).toFixed(1) + " KB";
  }

  function handleCmdClick(e) {
    if (e.metaKey === true || e.ctrlKey === true) {
      e.preventDefault();
      onMultiSelectStart(note.noteId);
    }
  }

  const noteSize = formatNoteSize(new TextEncoder().encode(note.content || '').length);

  return (
    <div {...longPress} onClickCapture={handleCmdClick} className="notes-list-item-wrapper">
      <Link to={link} className={`notes-list-item ${note.isPinned ? 'pinned' : ''}`} activeClassName="is-active" shouldPreserveSearchParams>
        <div className="notes-list-item-header">
          {title}
          <PinIcon isPinned={note.isPinned} className="notes-list-item-pin" onClick={handlePin} />
        </div>
        <div className="notes-list-item-subcontainer">
          <div className="notes-list-item-tags">{tags}</div>
          <div className="notes-list-item-subtext" title={fullUpdatedAt}>{shortUpdatedAt}</div>
        </div>
        <div className="notes-list-item-footer">
          <span className="notes-list-item-size">{noteSize}</span>
          <div className="notes-list-item-actions">
            <div className="notes-list-action" title={t('common.edit')} onClick={handleEdit}>
              <PencilIcon />
            </div>
            <div className="notes-list-action" title={isArchivesPage ? t('notes.archive.unarchive') : t('notes.archive.archive')} onClick={handleArchive}>
              <ArchiveIcon />
            </div>
            <div className="notes-list-action is-delete" title={isTrashPage ? t('notes.delete.restore') : t('common.delete')} onClick={handleDelete}>
              <TrashIcon />
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

function NotesGridItem({ note, index, cardHeight }) {
  const link = `/notes/${note.noteId}`;
  function tagUrl(tagId) {
    const p = new URLSearchParams(window.location.search);
    p.set('tagId', tagId);
    p.delete('isUntagged');
    return `/notes/?${p.toString()}`;
  }
  const tags = note.tags?.map(tag => {
    const tagColor = tag.color ? (TAG_COLORS.find(c => c.value === tag.color)?.hex || null) : null;
    const style = tagColor
      ? { backgroundColor: `${tagColor}22`, color: tagColor, padding: '1px 8px', borderRadius: '10px' }
      : { backgroundColor: 'var(--neutral-100)', padding: '1px 8px', borderRadius: '10px' };
    return (<Link className="tag" key={tag.tagId} to={tagUrl(tag.tagId)} style={style}>{tag.name}</Link>);
  });
  let title = <div className="notes-grid-item-title">{note.title}</div>

  if (note.title === "") {
    title = null;
  }

  const { patchNote } = useNotes();

  function handleClick() {
    openModal(
      <AppProvider>
        <NotesProvider>
          <NotesEditorModal note={note} onModalClose={(savedNote) => { if (savedNote) patchNote(note.noteId, savedNote); }} />
        </NotesProvider>
      </AppProvider>,
      '.note-modal-root'
    );
  }


  const snippetHtml = useMemo(() => renderMarkdown(note.snippet, { stripHeadingIds: true }), [note.snippet]);

  const content = (
    <>
      <div className="notes-grid-item-header">
        {title}
        <PinIcon
          isPinned={note.isPinned}
          className="notes-grid-item-pin"
        />
      </div>
      <div className="notes-grid-item-content" dangerouslySetInnerHTML={{ __html: snippetHtml }} />
      <div className="notes-grid-item-tags">{tags}</div>
    </>
  );

  if (isMobile()) {
    return (
      <Link className={`notes-grid-item ${note.isPinned ? 'pinned' : ''} reveal-animate`} to={link} shouldPreserveSearchParams style={`--reveal-index: ${index + 1}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className={`notes-grid-item ${note.isPinned ? 'pinned' : ''} reveal-animate`} onClick={handleClick} style={{"--reveal-index": `${index + 1}`, height: (cardHeight ? `${cardHeight}px` : undefined) }}>
      {content}
    </div>
  );
}

function LoadMoreButton({ items, total, onLoadMoreClick }) {
  if (items.length === 0) {
    return null;
  }

  if (items.length === total) {
    return null;
  }

  return <Button className="notes-list-load-more-button" onClick={onLoadMoreClick}>{t("common.loadMore")}</Button>
}

function EmptyList({ items, view }) {
  if (items.length > 0) {
    return null;
  }

  if (view === "gallery") {
    return <EmptyState icon={<ImagesIcon />} title={t('notes.empty.images.title')} description={t('notes.empty.images.desc')} />;
  }

  if (view === "attachments") {
    return <EmptyState icon={<AttachmentsIcon />} title={t('notes.empty.attachments.title')} description={t('notes.empty.attachments.desc')} />;
  }

  return <EmptyState icon={<NotesIcon />} title={t('notes.empty.notes.title')} description={t('notes.empty.notes.desc')} />;
}