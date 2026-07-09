import { h, useState, useEffect } from "../../assets/preact.esm.js"
import Sidebar from '../../commons/components/Sidebar.jsx';
import MobileNavbar from '../../commons/components/MobileNavbar.jsx';
import Spinner from '../../commons/components/Spinner.jsx';
import EmptyState from '../../commons/components/EmptyState.jsx';
import { ClipboardIcon, CopyIcon, DownloadIcon, LinkIcon, StickyNoteIcon, TrashIcon, UploadIcon, CloseIcon } from '../../commons/components/Icon.jsx';
import ApiClient from "../../commons/http/ApiClient.js";
import { showToast } from "../../commons/components/Toast.jsx";
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import Button from "../../commons/components/Button.jsx";
import { t } from "../../commons/i18n/index.js";
import navigateTo from "../../commons/utils/navigateTo.js";
import { LayoutProvider } from '../../commons/contexts/LayoutContext.jsx';
import GalleryLightbox from '../../commons/components/GalleryLightbox.jsx';
import "./Clipboard.css";

export default function ClipboardPage() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [textInput, setTextInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [lightboxImages, setLightboxImages] = useState([]);

  useEffect(() => {
    refreshMessages();
  }, []);

  function refreshMessages() {
    setIsLoading(true);
    ApiClient.getClipboardContent({ limit: 50 })
      .then(resp => {
        setMessages(resp.messages || []);
      })
      .catch(error => {
        console.error('Error loading clipboard messages:', error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }

  function handleTextChange(e) {
    setTextInput(e.target.value);
  }

  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  }

  function handleRemoveFile(index) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleClearFiles() {
    setSelectedFiles([]);
    const fileInput = document.querySelector('.clipboard-file-input');
    if (fileInput) fileInput.value = '';
  }

  function genId() {
    // Simple UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function handleSend() {
    const hasText = textInput.trim() !== '';
    const hasFiles = selectedFiles.length > 0;

    if (isSending || (!hasText && !hasFiles)) {
      if (!hasText && !hasFiles) showToast(t('clipboard.toast.emptyInput'));
      return;
    }

    setIsSending(true);

    let sendPromise;

    if (hasText && !hasFiles) {
      sendPromise = ApiClient.pushClipboardText({ content: textInput.trim() });
    } else if (hasFiles) {
      const content = hasText ? textInput.trim() : '';
      const batchId = selectedFiles.length > 1 ? genId() : '';
      const uploads = selectedFiles.map(file => () => ApiClient.uploadClipboardFile(file, content, batchId));
      sendPromise = uploads.reduce((p, fn) => p.then(fn), Promise.resolve());
    } else {
      sendPromise = Promise.resolve();
    }

    sendPromise
      .then(() => {
        setTextInput('');
        setSelectedFiles([]);
        const fileInput = document.querySelector('.clipboard-file-input');
        if (fileInput) fileInput.value = '';
        refreshMessages();
      })
      .catch(error => {
        console.error('Error sending to clipboard:', error);
        showToast(t('clipboard.toast.sendFailed'));
      })
      .finally(() => {
        setIsSending(false);
      });
  }

  function handleSaveAsNote(id) {
    ApiClient.saveClipboardAsNote(id)
      .then(note => {
        navigateTo(`/notes/${note.noteId}`);
      })
      .catch(error => {
        console.error('Error saving clipboard as note:', error);
        showToast(t('clipboard.toast.saveAsNoteFailed'));
      });
  }

  function handleSaveBatchAsNote(batchId) {
    ApiClient.saveClipboardBatchAsNote(batchId)
      .then(note => {
        navigateTo(`/notes/${note.noteId}`);
      })
      .catch(error => {
        console.error('Error saving batch as note:', error);
        showToast(t('clipboard.toast.saveAsNoteFailed'));
      });
  }

  function handleDeleteBatchText(batchId) {
    ApiClient.deleteClipboardBatchText(batchId)
      .then(() => {
        refreshMessages();
      })
      .catch(error => {
        console.error('Error deleting batch text:', error);
        showToast(t('clipboard.toast.deleteFailed'));
      });
  }

  function handleDelete(id) {
    setDeleteTarget({ type: 'single', id });
  }

  function handleDeleteBatch(batchId) {
    setDeleteTarget({ type: 'batch', batchId });
  }

  function handleDeleteConfirm() {
    if (deleteTarget === null) return;
    const target = deleteTarget;
    setDeleteTarget(null);

    const promise = target.type === 'batch'
      ? ApiClient.revokeClipboardBatch(target.batchId)
      : ApiClient.revokeClipboardItem(target.id);

    promise
      .then(() => {
        refreshMessages();
      })
      .catch(error => {
        console.error('Error deleting clipboard item:', error);
        showToast(t('clipboard.toast.deleteFailed'));
      });
  }

  function handleCancelDelete() {
    setDeleteTarget(null);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  // Open lightbox at a specific image index
  function openLightbox(images, index) {
    setLightboxImages(images);
    setLightboxIndex(index);
  }

  function closeLightbox() {
    setLightboxIndex(-1);
    setLightboxImages([]);
  }

  // Group messages by batch_id
  const groups = groupMessages(messages);

  let content;
  if (isLoading === true) {
    content = <div className="clipboard-spinner"><Spinner /></div>;
  } else if (groups.length === 0) {
    content = (
      <EmptyState
        icon={<ClipboardIcon />}
        title={t('clipboard.empty.title')}
        description={t('clipboard.empty.description')}
      />
    );
  } else {
    const items = groups.map((group, i) => {
      if (group.type === 'batch') {
        return (
          <BatchGroup
            key={group.batchId || 'g' + i}
            group={group}
            onDeleteBatch={() => handleDeleteBatch(group.batchId)}
            onDeleteFile={handleDelete}
            onSaveBatchAsNote={() => handleSaveBatchAsNote(group.batchId)}
            onDeleteBatchText={() => handleDeleteBatchText(group.batchId)}
            onOpenLightbox={(images, idx) => openLightbox(images, idx)}
          />
        );
      }
      return (
        <ClipboardItem key={group.msg.id} message={group.msg} onDelete={() => handleDelete(group.msg.id)} onSaveAsNote={() => handleSaveAsNote(group.msg.id)} onOpenLightbox={group.isImage ? () => openLightbox([group.msg], 0) : undefined} />
      );
    });
    content = <div className="clipboard-list">{items}</div>;
  }

  const canSend = !isSending && (textInput.trim() !== '' || selectedFiles.length > 0);

  const fileLabel = selectedFiles.length > 0
    ? selectedFiles.length + t('clipboard.filesSelected')
    : t('clipboard.chooseFile');

  return (
    <LayoutProvider>
      <div className="page-container">
        <Sidebar />

        <div className="clipboard-page-content">
          <div className="clipboard-header">
            <h1 className="clipboard-title">{t('nav.clipboard')}</h1>
            <p className="clipboard-subtitle">{t('clipboard.subtitle')}</p>
          </div>

          <div className="clipboard-input-section">
            <textarea
              className="clipboard-text-input"
              placeholder={t('clipboard.textPlaceholder')}
              value={textInput}
              onInput={handleTextChange}
              onKeyDown={handleKeyDown}
              rows={3}
            />

            <div className="clipboard-file-row">
              <label className="clipboard-file-label">
                <UploadIcon />
                <span className="clipboard-file-label-text">{fileLabel}</span>
                <input
                  type="file"
                  multiple
                  className="clipboard-file-input"
                  onChange={handleFileChange}
                />
              </label>
              {selectedFiles.length > 0 && (
                <button
                  className="clipboard-clear-file"
                  onClick={handleClearFiles}
                  title={t('common.clear')}
                >
                  &times;
                </button>
              )}
            </div>

            {selectedFiles.length > 0 && (
              <div className="clipboard-file-list">
                {selectedFiles.map((file, i) => (
                  <div key={i} className="clipboard-file-chip">
                    <span className="clipboard-file-chip-name">{file.name}</span>
                    <span className="clipboard-file-chip-size">({Math.round(file.size / 1024)} KB)</span>
                    <button className="clipboard-file-chip-remove" onClick={() => handleRemoveFile(i)}>&times;</button>
                  </div>
                ))}
              </div>
            )}

            <button
              className={'clipboard-send-btn' + (canSend ? '' : ' is-disabled')}
              onClick={canSend ? handleSend : undefined}
            >
              {t('clipboard.send')}
            </button>
          </div>

          <div className="clipboard-messages-section">
            {content}
          </div>
        </div>

        <MobileNavbar />
        <div className="modal-root"></div>
        <div className="toast-root"></div>
      </div>
      {deleteTarget !== null && (
        <ModalBackdrop onClose={handleCancelDelete}>
          <ModalContainer>
            <ModalHeader title={t('clipboard.confirmDeleteTitle')} onClose={handleCancelDelete} />
            <ModalContent>
              <p className="modal-description">{t('clipboard.confirmDeleteMessage')}</p>
            </ModalContent>
            <ModalFooter isRightAligned>
              <Button onClick={handleCancelDelete}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={handleDeleteConfirm}>{t('common.delete')}</Button>
            </ModalFooter>
          </ModalContainer>
        </ModalBackdrop>
      )}

      {/* Lightbox */}
      {lightboxIndex >= 0 && lightboxImages.length > 0 && (
        <GalleryLightbox
          images={lightboxImages.map(img => img.url)}
          startIndex={lightboxIndex}
          onClose={closeLightbox}
        />
      )}
    </LayoutProvider>
  );
}

// ─── Batch grouping ───

function groupMessages(messages) {
  const groups = [];
  const batchMap = {};

  for (const msg of messages) {
    if (msg.batchId) {
      if (!batchMap[msg.batchId]) {
        batchMap[msg.batchId] = {
          batchId: msg.batchId,
          content: '',
          files: [],
          createdAt: msg.createdAt,
        };
      }
      if (msg.type === 'file') {
        batchMap[msg.batchId].files.push(msg);
      }
      if (msg.content && !batchMap[msg.batchId].content) {
        batchMap[msg.batchId].content = msg.content;
      }
      if (msg.createdAt > batchMap[msg.batchId].createdAt) {
        batchMap[msg.batchId].createdAt = msg.createdAt;
      }
    } else {
      const isImage = msg.type === 'file' && /\.(jpg|jpeg|png|gif)$/i.test(msg.filename || '');
      groups.push({ type: 'single', msg, isImage });
    }
  }

  // Add batches in reverse chronological order (newest first, matching message order)
  const batchIds = Object.keys(batchMap).sort((a, b) => {
    const aTime = batchMap[a].createdAt;
    const bTime = batchMap[b].createdAt;
    return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
  });

  for (const bid of batchIds) {
    groups.push({ type: 'batch', ...batchMap[bid] });
  }

  // Sort all groups by createdAt descending (newest first)
  groups.sort((a, b) => {
    const aTime = a.createdAt || (a.msg ? a.msg.createdAt : '');
    const bTime = b.createdAt || (b.msg ? b.msg.createdAt : '');
    return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
  });

  return groups;
}

// ─── Batch Group Component ───

function BatchGroup({ group, onDeleteBatch, onDeleteFile, onSaveBatchAsNote, onDeleteBatchText, onOpenLightbox }) {
  const hasContent = !!group.content;
  const allFiles = group.files;
  const timeAgo = formatRelativeTime(group.createdAt);

  const imageFiles = allFiles.filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f.filename || ''));

  function handleDownloadAll() {
    for (const file of allFiles) {
      if (file.url) downloadFile(file.url, file.originalName || file.filename);
    }
  }

  function handleCopyAllLinks() {
    const links = allFiles.map(f => {
      const isImg = /\.(jpg|jpeg|png|gif)$/i.test(f.filename || '');
      if (isImg) return '![](' + f.url + ')';
      return '[' + (f.originalName || f.filename) + '](' + f.url + ')';
    }).join('\n');
    navigator.clipboard.writeText(links)
      .then(() => showToast(t('clipboard.toast.copied')))
      .catch(() => showToast(t('clipboard.toast.copyFailed')));
  }

  function handleCopyText() {
    navigator.clipboard.writeText(group.content)
      .then(() => showToast(t('clipboard.toast.copied')))
      .catch(() => showToast(t('clipboard.toast.copyFailed')));
  }

  function getFileIcon(file) {
    const isImg = /\.(jpg|jpeg|png|gif)$/i.test(file.filename || '');
    if (isImg) return <span className="clipboard-file-icon-image">🖼</span>;
    const ext = (file.originalName || file.filename || '').split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return <span className="clipboard-file-icon-pdf">📄</span>;
    if (['zip','rar','7z','tar','gz'].includes(ext)) return <span className="clipboard-file-icon-archive">📦</span>;
    if (['doc','docx'].includes(ext)) return <span className="clipboard-file-icon-doc">📝</span>;
    if (['xls','xlsx','csv'].includes(ext)) return <span className="clipboard-file-icon-sheet">📊</span>;
    if (['mp4','avi','mov','mkv'].includes(ext)) return <span className="clipboard-file-icon-video">🎥</span>;
    if (['mp3','wav','flac'].includes(ext)) return <span className="clipboard-file-icon-audio">🎵</span>;
    return <span className="clipboard-file-icon-generic">📁</span>;
  }

  return (
    <div className="clipboard-batch">
      <div className="clipboard-batch-header">
        <div className="clipboard-batch-meta">{allFiles.length} files · {timeAgo}</div>
        <div className="clipboard-batch-actions">
          <button className="clipboard-item-action" onClick={handleDownloadAll} title={t('clipboard.downloadAll')}>
            <DownloadIcon />
          </button>
          <button className="clipboard-item-action" onClick={handleCopyAllLinks} title={t('clipboard.copyLink')}>
            <LinkIcon />
          </button>
          <button className="clipboard-item-action" onClick={onSaveBatchAsNote} title={t('clipboard.saveAsNote')}>
            <StickyNoteIcon />
          </button>
          <button className="clipboard-item-action clipboard-item-action-delete" onClick={onDeleteBatch} title={t('common.delete')}>
            <TrashIcon />
          </button>
        </div>
      </div>

      {hasContent && (
        <div className="clipboard-batch-text">
          <span className="clipboard-batch-text-content">{group.content}</span>
          <div className="clipboard-batch-text-actions">
            <button className="clipboard-item-action" onClick={handleCopyText} title={t('clipboard.copy')}>
              <CopyIcon />
            </button>
            <button className="clipboard-item-action clipboard-item-action-delete" onClick={onDeleteBatchText} title={t('common.delete')}>
              <TrashIcon />
            </button>
          </div>
        </div>
      )}

      <div className="clipboard-batch-files">
        {allFiles.map((file, i) => {
          const isImg = /\.(jpg|jpeg|png|gif)$/i.test(file.filename || '');
          const imgIdx = isImg ? imageFiles.indexOf(file) : -1;
          return (
            <div key={file.id} className="clipboard-batch-file">
              <div className={`clipboard-batch-file-icon${isImg && imgIdx >= 0 ? ' clickable' : ''}`} onClick={isImg && imgIdx >= 0 ? () => onOpenLightbox(imageFiles, imgIdx) : undefined}>
                {getFileIcon(file)}
              </div>
              <span className="clipboard-batch-file-name">{file.originalName || file.filename}</span>
              <span className="clipboard-batch-file-size">{formatFileSize(file.fileSize)}</span>
              <div className="clipboard-item-actions">
                <button className="clipboard-item-action" onClick={() => downloadFile(file.url, file.originalName || file.filename)} title={t('clipboard.download')}>
                  <DownloadIcon />
                </button>
                <button className="clipboard-item-action clipboard-item-action-delete" onClick={() => onDeleteFile(file.id)} title={t('common.delete')}>
                  <TrashIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Single Clipboard Item ───

function ClipboardItem({ message, onDelete, onSaveAsNote, onOpenLightbox }) {
  const isFile = message.type === 'file';
  const isImage = isFile && /\.(jpg|jpeg|png|gif)$/i.test(message.filename || '');
  const canView = !!(onOpenLightbox || isImage);

  function handleDownload() {
    if (message.url) downloadFile(message.url, message.originalName || message.filename);
  }

  function handleViewImage() {
    if (onOpenLightbox) {
      onOpenLightbox();
    } else if (message.url) {
      window.open(message.url, '_blank');
    }
  }

  function handleCopyLink() {
    if (!message.url) return;
    const i = /\.(jpg|jpeg|png|gif)$/i.test(message.filename || '');
    const md = i ? '![](' + message.url + ')' : '[' + (message.originalName || message.filename) + '](' + message.url + ')';
    navigator.clipboard.writeText(md)
      .then(() => showToast(t('clipboard.toast.copied')))
      .catch(() => showToast(t('clipboard.toast.copyFailed')));
  }

  function handleCopyText() {
    if (message.content) {
      navigator.clipboard.writeText(message.content)
        .then(() => showToast(t('clipboard.toast.copied')))
        .catch(() => showToast(t('clipboard.toast.copyFailed')));
    }
  }

  const timeAgo = formatRelativeTime(message.createdAt);

  let icon;
  let primaryInfo;
  let secondaryInfo;
  let actions;

  if (isFile) {
    const sizeInfo = formatFileSize(message.fileSize) + ' · ' + timeAgo;
    if (message.content) {
      icon = <ClipboardIcon />;
      primaryInfo = message.content.length > 120 ? message.content.substring(0, 120) + '...' : message.content;
      secondaryInfo = (message.originalName || message.filename) + ' · ' + sizeInfo;
      actions = (
        <div className="clipboard-item-actions">
          <button className="clipboard-item-action" onClick={handleDownload} title={t('clipboard.download')}><DownloadIcon /></button>
          <button className="clipboard-item-action" onClick={handleCopyText} title={t('clipboard.copy')}><CopyIcon /></button>
          <button className="clipboard-item-action" onClick={onSaveAsNote} title={t('clipboard.saveAsNote')}><StickyNoteIcon /></button>
          <button className="clipboard-item-action clipboard-item-action-delete" onClick={onDelete} title={t('common.delete')}><TrashIcon /></button>
        </div>
      );
    } else {
      icon = <DownloadIcon />;
      primaryInfo = message.originalName || message.filename;
      secondaryInfo = sizeInfo;
      actions = (
        <div className="clipboard-item-actions">
          <button className="clipboard-item-action" onClick={handleDownload} title={t('clipboard.download')}><DownloadIcon /></button>
          <button className="clipboard-item-action" onClick={handleCopyLink} title={t('clipboard.copyLink')}><LinkIcon /></button>
          <button className="clipboard-item-action" onClick={onSaveAsNote} title={t('clipboard.saveAsNote')}><StickyNoteIcon /></button>
          <button className="clipboard-item-action clipboard-item-action-delete" onClick={onDelete} title={t('common.delete')}><TrashIcon /></button>
        </div>
      );
    }
  } else {
    icon = <ClipboardIcon />;
    primaryInfo = message.content.length > 120 ? message.content.substring(0, 120) + '...' : message.content;
    secondaryInfo = timeAgo;
    actions = (
      <div className="clipboard-item-actions">
        <button className="clipboard-item-action" onClick={handleCopyText} title={t('clipboard.copy')}><CopyIcon /></button>
        <button className="clipboard-item-action" onClick={onSaveAsNote} title={t('clipboard.saveAsNote')}><StickyNoteIcon /></button>
        <button className="clipboard-item-action clipboard-item-action-delete" onClick={onDelete} title={t('common.delete')}><TrashIcon /></button>
      </div>
    );
  }

  return (
    <div className={`clipboard-item clipboard-item-${isFile ? 'file' : 'text'}`}>
      <div className={`clipboard-item-icon${canView ? ' clickable' : ''}`} onClick={canView ? handleViewImage : undefined} title={canView ? t('clipboard.view') : ''}>
        {icon}
      </div>
      <div className="clipboard-item-body">
        <div className="clipboard-item-primary">{primaryInfo}</div>
        <div className="clipboard-item-secondary">{secondaryInfo}</div>
      </div>
      {actions}
    </div>
  );
}

// ─── Utilities ───

function formatRelativeTime(dateStr) {
  const now = Date.now();
  const date = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return Math.floor(days / 30) + 'mo';
  if (days > 7) return Math.floor(days / 7) + 'w';
  if (days > 1) return days + 'd';
  if (days === 1) return '1d';
  if (hours > 0) return hours + 'h';
  if (minutes > 0) return minutes + 'm';
  return 'now';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
