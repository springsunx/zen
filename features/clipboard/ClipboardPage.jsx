import { h, useState, useEffect } from "../../assets/preact.esm.js"
import Sidebar from '../../commons/components/Sidebar.jsx';
import MobileNavbar from '../../commons/components/MobileNavbar.jsx';
import Spinner from '../../commons/components/Spinner.jsx';
import EmptyState from '../../commons/components/EmptyState.jsx';
import { ClipboardIcon, CopyIcon, DownloadIcon, LinkIcon, StickyNoteIcon, TrashIcon, UploadIcon } from '../../commons/components/Icon.jsx';
import ApiClient from "../../commons/http/ApiClient.js";
import { showToast } from "../../commons/components/Toast.jsx";
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import Button from "../../commons/components/Button.jsx";
import { t } from "../../commons/i18n/index.js";
import navigateTo from "../../commons/utils/navigateTo.js";
import { LayoutProvider } from '../../commons/contexts/LayoutContext.jsx';
import "./Clipboard.css";

export default function ClipboardPage() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [textInput, setTextInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  function handleSend() {
    const hasText = textInput.trim() !== '';
    const hasFiles = selectedFiles.length > 0;

    if (!hasText && !hasFiles) {
      showToast(t('clipboard.toast.emptyInput'));
      return;
    }

    let sendPromise;

    if (hasText && !hasFiles) {
      // Text only
      sendPromise = ApiClient.pushClipboardText({ content: textInput.trim() });
    } else if (hasFiles) {
      // Upload each file sequentially with the same text
      const content = hasText ? textInput.trim() : '';
      const uploads = selectedFiles.map(file => () => ApiClient.uploadClipboardFile(file, content));
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

  function handleDelete(id) {
    setDeleteTarget(id);
  }

  function handleDeleteConfirm() {
    if (deleteTarget === null) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    ApiClient.revokeClipboardItem(id)
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

  let content;
  if (isLoading === true) {
    content = <div className="clipboard-spinner"><Spinner /></div>;
  } else if (messages.length === 0) {
    content = (
      <EmptyState
        icon={<ClipboardIcon />}
        title={t('clipboard.empty.title')}
        description={t('clipboard.empty.description')}
      />
    );
  } else {
    const items = messages.map(msg => (
      <ClipboardItem key={msg.id} message={msg} onDelete={() => handleDelete(msg.id)} onSaveAsNote={() => handleSaveAsNote(msg.id)} />
    ));
    content = <div className="clipboard-list">{items}</div>;
  }

  const canSend = textInput.trim() !== '' || selectedFiles.length > 0;

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
    </LayoutProvider>
  );
}

function ClipboardItem({ message, onDelete, onSaveAsNote }) {
  const isFile = message.type === 'file';

  function handleDownload() {
    if (message.url) {
      window.open(message.url, '_blank');
    }
  }

  function handleCopyLink() {
    if (!message.url) return;
    const isImage = /\.(jpg|jpeg|png|gif)$/i.test(message.filename || '');
    let markdown;
    if (isImage) {
      markdown = '![](' + message.url + ')';
    } else {
      markdown = '[' + (message.originalName || message.filename) + '](' + message.url + ')';
    }
    navigator.clipboard.writeText(markdown)
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
    let sizeInfo = formatFileSize(message.fileSize) + ' · ' + timeAgo;
    if (message.content) {
      icon = <ClipboardIcon />;
      primaryInfo = message.content.length > 120
        ? message.content.substring(0, 120) + '...'
        : message.content;
      secondaryInfo = (message.originalName || message.filename) + ' · ' + sizeInfo;
      actions = (
        <div className="clipboard-item-actions">
          <button className="clipboard-item-action" onClick={handleDownload} title={t('clipboard.download')}>
            <DownloadIcon />
          </button>
          <button className="clipboard-item-action" onClick={handleCopyText} title={t('clipboard.copy')}>
            <CopyIcon />
          </button>
          <button className="clipboard-item-action" onClick={onSaveAsNote} title={t('clipboard.saveAsNote')}>
            <StickyNoteIcon />
          </button>
          <button className="clipboard-item-action clipboard-item-action-delete" onClick={onDelete} title={t('common.delete')}>
            <TrashIcon />
          </button>
        </div>
      );
    } else {
      icon = <DownloadIcon />;
      primaryInfo = message.originalName || message.filename;
      secondaryInfo = sizeInfo;
      actions = (
        <div className="clipboard-item-actions">
          <button className="clipboard-item-action" onClick={handleDownload} title={t('clipboard.download')}>
            <DownloadIcon />
          </button>
          <button className="clipboard-item-action" onClick={handleCopyLink} title={t('clipboard.copyLink')}>
            <LinkIcon />
          </button>
          <button className="clipboard-item-action" onClick={onSaveAsNote} title={t('clipboard.saveAsNote')}>
            <StickyNoteIcon />
          </button>
          <button className="clipboard-item-action clipboard-item-action-delete" onClick={onDelete} title={t('common.delete')}>
            <TrashIcon />
          </button>
        </div>
      );
    }
  } else {
    icon = <ClipboardIcon />;
    primaryInfo = message.content.length > 120
      ? message.content.substring(0, 120) + '...'
      : message.content;
    secondaryInfo = timeAgo;
    actions = (
      <div className="clipboard-item-actions">
        <button className="clipboard-item-action" onClick={handleCopyText} title={t('clipboard.copy')}>
          <CopyIcon />
        </button>
        <button className="clipboard-item-action" onClick={onSaveAsNote} title={t('clipboard.saveAsNote')}>
          <StickyNoteIcon />
        </button>
        <button className="clipboard-item-action clipboard-item-action-delete" onClick={onDelete} title={t('common.delete')}>
          <TrashIcon />
        </button>
      </div>
    );
  }

  return (
    <div className={`clipboard-item clipboard-item-${isFile ? 'file' : 'text'}`}>
      <div className="clipboard-item-icon">{icon}</div>
      <div className="clipboard-item-body">
        <div className="clipboard-item-primary">{primaryInfo}</div>
        <div className="clipboard-item-secondary">{secondaryInfo}</div>
      </div>
      {actions}
    </div>
  );
}

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
  const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
  return size + ' ' + units[i];
}
