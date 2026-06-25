import { h, useState } from "../../assets/preact.esm.js";
import { t } from "../../commons/i18n/index.js";
import ApiClient from "../../commons/http/ApiClient.js";
import { showToast } from "../../commons/components/Toast.jsx";
import { openModal, closeModal } from "../../commons/components/Modal.jsx";
import { AppProvider } from "../../commons/contexts/AppContext.jsx";
import { NotesProvider, useNotes } from "../../commons/contexts/NotesContext.jsx";
import NotesEditorModal from "./NotesEditorModal.jsx";
import ImageDeleteConfirmModal from "./ImageDeleteConfirmModal.jsx";
import GalleryLightbox from "../../commons/components/GalleryLightbox.jsx";
import { TAG_COLORS } from "../tags/TagDetailModal.jsx";
import "./ImageTable.css";

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function NoteLink({ noteId, title }) {
  const { patchNote } = useNotes();

  async function handleClick(e) {
    e.preventDefault();
    try {
      const note = await ApiClient.getNoteById(noteId);
      openModal(
        <AppProvider>
          <NotesProvider>
            <NotesEditorModal note={note} onModalClose={(savedNote) => { if (savedNote) patchNote(noteId, savedNote); }} />
          </NotesProvider>
        </AppProvider>,
        '.note-modal-root'
      );
    } catch (err) {
      console.error('Failed to open note:', err);
    }
  }

  return (
    <span className="image-note-link" onClick={handleClick}>
      {title || t('notes.empty.untitled')}
    </span>
  );
}

function collectTags(linkedNotes) {
  if (!linkedNotes || linkedNotes.length === 0) return [];
  const seen = new Set();
  const result = [];
  for (const ref of linkedNotes) {
    if (!ref.tags) continue;
    for (const tag of ref.tags) {
      if (!seen.has(tag.tagId)) {
        seen.add(tag.tagId);
        result.push(tag);
      }
    }
  }
  return result;
}

export default function ImageTable({ images = [] }) {
  const { patchNote } = useNotes();
  const [openIndex, setOpenIndex] = useState(null);
  const urls = images.map(img => img.url);

  async function handleDelete(e, filename, referencedBy) {
    e.stopPropagation();
    try {
      await ApiClient.deleteImage(filename);
      showToast(t('images.deleted'));
      window.dispatchEvent(new CustomEvent('images:refresh'));
    } catch (err) {
      if (err?.code === "IMAGE_IN_USE" && Array.isArray(err?.referencedBy)) {
        const confirmed = confirm(t('images.delete.confirm.inUse', { count: err.referencedBy.length }));
        if (confirmed) {
          try {
            await ApiClient.forceDeleteImage(filename);
            showToast(t('images.deleted'));
            window.dispatchEvent(new CustomEvent('images:refresh'));
          } catch (e) {
            console.error('Force delete failed:', e);
          }
        }
      } else {
        console.error('Delete image failed:', err);
        showToast(t('images.delete.failed'));
      }
    }
  }

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="image-table">
      <div className="image-table-header">
        <div className="col-thumb">{t('images.list.thumb')}</div>
        <div className="col-filename">{t('images.list.filename')}</div>
        <div className="col-dimensions">{t('images.list.dimensions')}</div>
        <div className="col-size">{t('images.list.size')}</div>
        <div className="col-notes">{t('images.list.linkedNotes')}</div>
        <div className="col-tags">{t('images.list.tags')}</div>
        <div className="col-storage">{t('images.list.storage')}</div>
        <div className="col-date">{t('images.list.date')}</div>
        <div className="col-actions">{t('images.list.actions')}</div>
      </div>
      {images.map(img => {
        const tags = collectTags(img.linkedNotes);
        return (
          <div className="image-row" key={img.filename}>
            <div className="col-thumb" onClick={() => setOpenIndex(images.indexOf(img))}>
              <img src={img.url} className="image-thumb" loading="lazy" alt="" />
            </div>
            <div className="col-filename">
              <a href={img.url} target="_blank" rel="noopener" title={img.filename}>
                {img.filename}
              </a>
            </div>
            <div className="col-dimensions">{img.width} × {img.height}</div>
            <div className="col-size">{formatFileSize(img.fileSize)}</div>
            <div className="col-notes">
              {img.linkedNotes && img.linkedNotes.length > 0
                ? img.linkedNotes.map((ref, i) => (
                    <span key={ref.noteId}>
                      {i > 0 && ", "}
                      <NoteLink noteId={ref.noteId} title={ref.title} />
                    </span>
                  ))
                : <span className="image-no-notes">—</span>
              }
            </div>
            <div className="col-tags">
              {tags.length > 0
                ? tags.map(tag => {
                    const hex = tag.color ? (TAG_COLORS.find(c => c.value === tag.color)?.hex || null) : null;
                    const style = hex
                      ? { backgroundColor: `${hex}22`, color: hex, padding: '1px 6px', borderRadius: '10px', fontSize: '12px' }
                      : { backgroundColor: 'var(--neutral-100)', color: 'var(--neutral-400)', padding: '1px 6px', borderRadius: '10px', fontSize: '12px' };
                    return <span key={tag.tagId} className="image-tag" style={style}>{tag.name}</span>;
                  })
                : <span className="image-no-notes">—</span>
              }
            </div>
            <div className="col-storage">
              <span className={`image-storage-badge ${img.storage === 's3' ? 'is-s3' : 'is-local'}`}>
                {img.storage === 's3' ? 'S3' : t('images.list.storageLocal')}
              </span>
            </div>
            <div className="col-date">{formatDate(img.createdAt)}</div>
            <div className="col-actions">
              <div className="image-delete" title={t('common.delete')} onClick={(e) => handleDelete(e, img.filename)}>
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 6h18" stroke="currentColor" stroke-width="2"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" stroke="currentColor" stroke-width="2"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" stroke="currentColor" stroke-width="2"/></svg>
              </div>
            </div>
          </div>
        );
      })}
      {openIndex !== null && (
        <GalleryLightbox images={urls} startIndex={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </div>
  );
}
