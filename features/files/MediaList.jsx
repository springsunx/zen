import { h, Fragment, useMemo, useState } from "../../assets/preact.esm.js";
import GalleryLightbox from "../../commons/components/GalleryLightbox.jsx";
import { t } from "../../commons/i18n/index.js";
import ApiClient from "../../commons/http/ApiClient.js";
import { showToast } from "../../commons/components/Toast.jsx";
import { openModal } from "../../commons/components/Modal.jsx";
import { AppProvider } from "../../commons/contexts/AppContext.jsx";
import { NotesProvider, useNotes } from "../../commons/contexts/NotesContext.jsx";
import NotesEditorModal from "../notes/NotesEditorModal.jsx";
import { TAG_COLORS } from "../tags/TagDetailModal.jsx";
import { buildMediaItems } from "./MediaGallery.jsx";
import "./MediaList.css";

function formatFileSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function NoteLink({ noteId, title }) {
  const { patchNote } = useNotes();

  async function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    try {
      const note = await ApiClient.getNoteById(noteId);
      openModal(<AppProvider><NotesProvider><NotesEditorModal note={note} onModalClose={(savedNote) => { if (savedNote) patchNote(noteId, savedNote); }} /></NotesProvider></AppProvider>, ".note-modal-root");
    } catch (error) {
      console.error("Failed to open note:", error);
    }
  }

  return <span className="media-note-link" onClick={handleClick}>{title || t("notes.empty.untitled")}</span>;
}

function MediaTags({ linkedNotes }) {
  const seen = new Set();
  const tags = [];
  for (const note of linkedNotes || []) {
    for (const tag of note.tags || []) {
      if (!seen.has(tag.tagId)) {
        seen.add(tag.tagId);
        tags.push(tag);
      }
    }
  }
  if (tags.length === 0) return <span className="media-empty-value">—</span>;
  return tags.map((tag) => {
    const hex = tag.color ? (TAG_COLORS.find((color) => color.value === tag.color)?.hex || null) : null;
    return <span key={tag.tagId} className="media-tag" style={hex ? { backgroundColor: `${hex}22`, color: hex } : { backgroundColor: "var(--neutral-100)", color: "var(--neutral-400)" }}>{tag.name}</span>;
  });
}

function NoteLocations({ linkedNotes }) {
  const notes = linkedNotes || [];
  const locations = [];
  if (notes.some((note) => !note.isDeleted && !note.isArchived)) locations.push("notes");
  if (notes.some((note) => !note.isDeleted && note.isArchived)) locations.push("archive");
  if (notes.some((note) => note.isDeleted)) locations.push("trash");
  if (locations.length === 0) return <span className="media-empty-value">—</span>;
  return <div className="media-note-locations">{locations.map((location) => <span key={location} className={`media-note-location is-${location}`}>{t(`files.location.${location}`)}</span>)}</div>;
}

export default function MediaList({ images = [], videos = [] }) {
  const [openIndex, setOpenIndex] = useState(null);
  const media = useMemo(() => buildMediaItems(images, videos), [images, videos]);

  async function handleDelete(event, item) {
    event.stopPropagation();
    try {
      if (item.type === "video") {
        if (!confirm(t("attachments.list.deleteConfirm"))) return;
        await ApiClient.deleteAttachment(item.filename);
        showToast(t("attachments.list.deleted"));
        window.dispatchEvent(new CustomEvent("attachments:refresh"));
        return;
      }
      await ApiClient.deleteImage(item.filename);
      showToast(t("images.deleted"));
      window.dispatchEvent(new CustomEvent("images:refresh"));
    } catch (error) {
      if (item.type === "image" && error?.code === "IMAGE_IN_USE" && Array.isArray(error?.referencedBy)) {
        if (!confirm(t("images.delete.confirm.inUse", { count: error.referencedBy.length }))) return;
        try {
          await ApiClient.forceDeleteImage(item.filename);
          showToast(t("images.deleted"));
          window.dispatchEvent(new CustomEvent("images:refresh"));
        } catch (forceError) {
          console.error("Force delete image failed:", forceError);
          showToast(t("images.delete.failed"));
        }
        return;
      }
      console.error("Delete media failed:", error);
      showToast(t(item.type === "image" ? "images.delete.failed" : "attachments.list.deleteFailed"));
    }
  }

  return (
    <>
      <div className="media-table">
        <div className="media-table-header">
          <div className="col-media-thumb">{t("images.list.thumb")}</div>
          <div className="col-media-name">{t("images.list.filename")}</div>
          <div className="col-media-type">{t("files.media.type")}</div>
          <div className="col-media-dimensions">{t("images.list.dimensions")}</div>
          <div className="col-media-size">{t("images.list.size")}</div>
          <div className="col-media-notes">{t("images.list.linkedNotes")}</div>
          <div className="col-media-location">{t("files.location.label")}</div>
          <div className="col-media-tags">{t("images.list.tags")}</div>
          <div className="col-media-storage">{t("images.list.storage")}</div>
          <div className="col-media-date">{t("images.list.date")}</div>
          <div className="col-media-actions">{t("images.list.actions")}</div>
        </div>
        {media.map((item, index) => (
          <div className="media-table-row" key={item.id}>
            <div className="col-media-thumb" onClick={() => setOpenIndex(index)}>
              {item.type === "image" ? <img src={item.thumbnailUrl} className="media-table-thumb" loading="lazy" decoding="async" width="48" height="48" alt="" /> : <span className="media-video-thumb"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>}
            </div>
            <div className="col-media-name"><a href={item.url} target="_blank" rel="noopener" title={item.name}>{item.name}</a></div>
            <div className="col-media-type"><span className="media-type-badge">{item.type === "video" ? t("files.media.video") : t("files.media.image")}</span></div>
            <div className="col-media-dimensions">{item.type === "image" ? `${item.width} × ${item.height}` : "—"}</div>
            <div className="col-media-size">{formatFileSize(item.fileSize)}</div>
            <div className="col-media-notes">{item.linkedNotes?.length ? item.linkedNotes.map((note, noteIndex) => <span key={note.noteId}>{noteIndex > 0 && ", "}<NoteLink noteId={note.noteId} title={note.title} /></span>) : <span className="media-empty-value">—</span>}</div>
            <div className="col-media-location"><NoteLocations linkedNotes={item.linkedNotes} /></div>
            <div className="col-media-tags"><MediaTags linkedNotes={item.linkedNotes} /></div>
            <div className="col-media-storage"><span className={`media-storage-badge ${item.storage === "s3" ? "is-s3" : "is-local"}`}>{item.storage === "s3" ? "S3" : t("images.list.storageLocal")}</span></div>
            <div className="col-media-date">{formatDate(item.createdAt)}</div>
            <div className="col-media-actions"><div className="media-delete" title={t("common.delete")} onClick={(event) => handleDelete(event, item)}><svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 6h18" stroke="currentColor" stroke-width="2"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" stroke="currentColor" stroke-width="2"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" stroke="currentColor" stroke-width="2"/></svg></div></div>
          </div>
        ))}
      </div>
      {openIndex !== null && <GalleryLightbox images={media} startIndex={openIndex} onClose={() => setOpenIndex(null)} />}
    </>
  );
}
