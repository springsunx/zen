import { h } from "../../assets/preact.esm.js";
import { t } from "../../commons/i18n/index.js";
import ApiClient from "../../commons/http/ApiClient.js";
import { showToast } from "../../commons/components/Toast.jsx";
import { openModal } from "../../commons/components/Modal.jsx";
import { AppProvider } from "../../commons/contexts/AppContext.jsx";
import { NotesProvider, useNotes } from "../../commons/contexts/NotesContext.jsx";
import NotesEditorModal from "./NotesEditorModal.jsx";
import { TAG_COLORS } from "../tags/TagDetailModal.jsx";
import "./AttachmentList.css";

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

function getFileIcon(contentType) {
  if (contentType.startsWith("image/")) return "🖼️";
  if (contentType.startsWith("video/")) return "🎬";
  if (contentType.startsWith("audio/")) return "🎵";
  if (contentType.includes("pdf")) return "📄";
  if (contentType.includes("word") || contentType.includes("document")) return "📝";
  if (contentType.includes("sheet") || contentType.includes("excel")) return "📊";
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) return "📽️";
  if (contentType.includes("zip") || contentType.includes("rar") || contentType.includes("tar")) return "📦";
  return "📎";
}

function getShortType(contentType) {
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("word") || contentType.includes("document")) return "DOCX";
  if (contentType.includes("sheet") || contentType.includes("excel")) return "XLSX";
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) return "PPTX";
  if (contentType.includes("zip")) return "ZIP";
  if (contentType.includes("rar")) return "RAR";
  if (contentType.startsWith("image/")) return contentType.split("/")[1].toUpperCase();
  if (contentType.startsWith("video/")) return contentType.split("/")[1].toUpperCase();
  if (contentType.startsWith("audio/")) return contentType.split("/")[1].toUpperCase();
  if (contentType.startsWith("text/")) return "TXT";
  return contentType.split("/")[1]?.toUpperCase() || "FILE";
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
    <span className="attachment-note-link" onClick={handleClick}>
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

export default function AttachmentList({ attachments = [] }) {
  async function handleDelete(e, filename) {
    e.stopPropagation();
    if (!confirm(t('attachments.list.deleteConfirm'))) return;
    try {
      await ApiClient.deleteAttachment(filename);
      showToast(t('attachments.list.deleted'));
      window.dispatchEvent(new CustomEvent('attachments:refresh'));
    } catch (err) {
      console.error('Delete attachment failed:', err);
      showToast(t('attachments.list.deleteFailed'));
    }
  }

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="attachment-table">
      <div className="attachment-table-header">
        <div className="col-name">{t('attachments.list.name')}</div>
        <div className="col-type">{t('attachments.list.type')}</div>
        <div className="col-size">{t('attachments.list.size')}</div>
        <div className="col-notes">{t('attachments.list.linkedNotes')}</div>
        <div className="col-tags">{t('attachments.list.tags')}</div>
        <div className="col-storage">{t('attachments.list.storage')}</div>
        <div className="col-date">{t('attachments.list.date')}</div>
        <div className="col-actions">{t('attachments.list.actions')}</div>
      </div>
      {attachments.map(att => (
        <div className="attachment-row" key={att.filename}>
          <div className="col-name">
            <span className="attachment-file-icon">{getFileIcon(att.contentType)}</span>
            <a href={`/attachments/${att.filename}`} target="_blank" rel="noopener" title={att.originalName}>
              {att.originalName}
            </a>
          </div>
          <div className="col-type">
            <span className="attachment-type-badge">{getShortType(att.contentType)}</span>
          </div>
          <div className="col-size">{formatFileSize(att.fileSize)}</div>
          <div className="col-notes">
            {att.linkedNotes && att.linkedNotes.length > 0
              ? att.linkedNotes.map((ref, i) => (
                  <span key={ref.noteId}>
                    {i > 0 && ", "}
                    <NoteLink noteId={ref.noteId} title={ref.title} />
                  </span>
                ))
              : <span className="attachment-no-notes">—</span>
            }
          </div>
          <div className="col-tags">
            {(() => {
              const tags = collectTags(att.linkedNotes);
              if (tags.length === 0) return <span className="attachment-no-notes">—</span>;
              return tags.map(tag => {
                const hex = tag.color ? (TAG_COLORS.find(c => c.value === tag.color)?.hex || null) : null;
                const style = hex
                  ? { backgroundColor: `${hex}22`, color: hex, padding: '1px 6px', borderRadius: '10px', fontSize: '12px' }
                  : { backgroundColor: 'var(--neutral-100)', color: 'var(--neutral-400)', padding: '1px 6px', borderRadius: '10px', fontSize: '12px' };
                return <span key={tag.tagId} className="attachment-tag" style={style}>{tag.name}</span>;
              });
            })()}
          </div>
          <div className="col-storage">
            <span className={`attachment-storage-badge ${att.storage === 's3' ? 'is-s3' : 'is-local'}`}>
              {att.storage === 's3' ? 'S3' : t('attachments.list.storageLocal')}
            </span>
          </div>
          <div className="col-date">{formatDate(att.createdAt)}</div>
          <div className="col-actions">
            <div className="attachment-delete" title={t('common.delete')} onClick={(e) => handleDelete(e, att.filename)}>
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 6h18" stroke="currentColor" stroke-width="2"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" stroke="currentColor" stroke-width="2"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" stroke="currentColor" stroke-width="2"/></svg>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
