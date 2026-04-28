import { h, useState } from "../../assets/preact.esm.js"
import { UploadIcon, SuccessIcon, WarnIcon, ErrorIcon } from "../../commons/components/Icon.jsx";
import { showToast } from "../../commons/components/Toast.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import pluralize from "../../commons/utils/pluralize.js";
import { t, getLang } from "../../commons/i18n/index.js";

export default function ImportPane() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [skippedFiles, setSkippedFiles] = useState([]);
  const [erroredFiles, setErroredFiles] = useState([]);
  const [summaryMessage, setSummaryMessage] = useState("");

  async function handleFileUpload(e) {
    const files = Array.from(e.target.files);

    if (!files.length) {
      showToast(t('settings.import.noFiles'));
      return;
    }

    const isZip = files.length === 1 && files[0].name.toLowerCase().endsWith('.zip');

    if (isZip) {
      await handleZipUpload(files[0]);
      e.target.value = '';
      return;
    }

    const supportedFiles = files.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ext === 'md' || ext === 'txt';
    });

    const unsupportedFiles = files.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ext !== 'md' && ext !== 'txt';
    });

    if (supportedFiles.length === 0) {
      showToast(t('settings.import.noSupported'));
      return;
    }

    setUploadedFiles([]);
    setSkippedFiles(unsupportedFiles.map(file => file.webkitRelativePath || file.name));
    setErroredFiles([]);
    setSummaryMessage("");

    setIsUploading(true);
    setUploadProgress({ current: 0, total: supportedFiles.length });

    try {
      const newUploadedFiles = [];
      const newErroredFiles = [];

      for (let i = 0; i < supportedFiles.length; i++) {
        const file = supportedFiles[i];
        setUploadProgress({ current: i + 1, total: supportedFiles.length });

        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('path', file.webkitRelativePath);
          await ApiClient.importFile(formData);
          newUploadedFiles.push(file.webkitRelativePath || file.name);
        } catch (error) {
          newErroredFiles.push(file.webkitRelativePath || file.name);
          console.error(`Error importing ${file.name}:`, error);
        }
      }

      setUploadedFiles(newUploadedFiles);
      setErroredFiles(newErroredFiles);

      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });

      const uploadedCount = newUploadedFiles.length;
      const errorCount = newErroredFiles.length;
      const unsupportedCount = unsupportedFiles.length;

      const lang = (typeof getLang === 'function' ? getLang() : 'en');
      let parts = [];
      if (uploadedCount > 0) {
        parts.push(t('settings.import.summary.msg.imported', {count: uploadedCount, fileNoun: lang === 'en' ? pluralize(uploadedCount, 'file') : ''}));
      }

      if (errorCount > 0) {
        parts.push(t('settings.import.summary.msg.errors', {count: errorCount, errorNoun: lang === 'en' ? pluralize(errorCount, 'error') : ''}));
      }

      if (unsupportedCount > 0) {
        parts.push(t('settings.import.summary.msg.skipped', {count: unsupportedCount}));
      }

      const message = parts.length ? parts.join(' ') : t('settings.import.summary.msg.none');
      setSummaryMessage(message);
      e.target.value = '';
    } catch (error) {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
      console.error('Import error:', error);
    }
  }

  async function handleZipUpload(file) {
    setUploadedFiles([]);
    setSkippedFiles([]);
    setErroredFiles([]);
    setSummaryMessage("");

    setIsUploading(true);
    setUploadProgress({ current: 0, total: 1 });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', file.name);

      let result;
      try {
        result = await ApiClient.importFile(formData);
      } catch (error) {
        showToast(t('settings.import.noSupported'));
        setIsUploading(false);
        setUploadProgress({ current: 0, total: 0 });
        return;
      }

      if (result && result.importedMd) {
        setUploadedFiles(result.importedMd);
      }
      if (result && result.errorFiles) {
        setErroredFiles(result.errorFiles);
      }
      if (result && result.skippedFiles) {
        setSkippedFiles(result.skippedFiles);
      }

      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });

      const importedCount = result?.imported || 0;
      const errorCount = result?.errors || 0;
      const skippedCount = result?.skipped || 0;

      const lang = (typeof getLang === 'function' ? getLang() : 'en');
      let parts = [];
      if (importedCount > 0) {
        parts.push(t('settings.import.summary.msg.imported', {count: importedCount, fileNoun: lang === 'en' ? pluralize(importedCount, 'file') : ''}));
      }

      if (errorCount > 0) {
        parts.push(t('settings.import.summary.msg.errors', {count: errorCount, errorNoun: lang === 'en' ? pluralize(errorCount, 'error') : ''}));
      }

      if (skippedCount > 0) {
        parts.push(t('settings.import.summary.msg.skipped', {count: skippedCount}));
      }

      const message = parts.length ? parts.join(' ') : t('settings.import.summary.msg.none');
      setSummaryMessage(message);
    } catch (error) {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
      console.error('Import error:', error);
    }
  }

  return (
    <div className="settings-tab-content">
      <h3>{t('settings.import.title')}</h3>
      <p>{t('settings.import.desc')}</p>
      <p>{t('settings.import.frontmatterHint')}</p>
      <pre className="code-block">{`---\ncreated: 2023-04-15T10:30:00Z\nupdated: 2023-06-20T14:45:00Z\n---\n\n${t('settings.import.noteContentPlaceholder')}`}</pre>

      <div className="file-upload-container">
        <p className="file-upload-label-text">{t('settings.import.chooseFolder')}</p>
        <input
          type="file"
          id="folder-upload"
          webkitdirectory
          directory
          multiple
          onChange={handleFileUpload}
          disabled={isUploading}
        />
        <label htmlFor="folder-upload" className={`file-upload-label ${isUploading ? 'disabled' : ''}`}>
          <UploadIcon />
          {isUploading ? t('settings.import.btn.importing') : t('settings.import.btn.chooseFolder')}
        </label>

        <p className="file-upload-label-text" style={{ marginTop: '16px' }}>{t('settings.import.orImportZip')}</p>
        <input
          type="file"
          id="zip-upload"
          accept=".zip"
          onChange={handleFileUpload}
          disabled={isUploading}
        />
        <label htmlFor="zip-upload" className={`file-upload-label ${isUploading ? 'disabled' : ''}`}>
          <UploadIcon />
          {isUploading ? t('settings.import.btn.importing') : t('settings.import.chooseZip')}
        </label>

        <UploadProgress isUploading={isUploading} uploadProgress={uploadProgress} />
        <UploadSummary
          summaryMessage={summaryMessage}
          uploadedFiles={uploadedFiles}
          skippedFiles={skippedFiles}
          erroredFiles={erroredFiles}
        />
      </div>
    </div>
  )
}

function UploadProgress({ isUploading, uploadProgress }) {
  if (!isUploading || uploadProgress.total === 0) {
    return null;
  }

  return (
    <div className="upload-progress">
      <div className="upload-progress-text">
        {t('settings.import.progress', {current: uploadProgress.current, total: uploadProgress.total})}
      </div>
      <div className="upload-progress-bar">
        <div className="upload-progress-fill" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}></div>
      </div>
    </div>
  );
}

function UploadSummary({ summaryMessage, uploadedFiles, skippedFiles, erroredFiles }) {
  const hasAnyFiles = uploadedFiles.length > 0 || skippedFiles.length > 0 || erroredFiles.length > 0;

  if (!hasAnyFiles) {
    return null;
  }

  let messageSection = null;
  let uploadedSection = null;
  let skippedSection = null;
  let erroredSection = null;

  if (summaryMessage) {
    messageSection = (
      <div className="upload-summary-message">
        <p>{summaryMessage} <a href="#" onClick={() => window.location.reload()}>{t('settings.import.summary.refresh')}</a></p>
      </div>
    );
  }

  if (uploadedFiles.length > 0) {
    const uploadedFileItems = uploadedFiles.map((fileName, index) => (
      <li key={index} className="file-item uploaded">{fileName}</li>
    ));

    uploadedSection = (
      <div className="upload-summary-section uploaded">
        <h5><SuccessIcon /> {t('settings.import.summary.imported', {count: uploadedFiles.length})}</h5>
        <ul className="file-list">
          {uploadedFileItems}
        </ul>
      </div>
    );
  }

  if (skippedFiles.length > 0) {
    const skippedFileItems = skippedFiles.map((fileName, index) => (
      <li key={index} className="file-item skipped">{fileName}</li>
    ));

    skippedSection = (
      <div className="upload-summary-section skipped">
        <h5><WarnIcon /> {t('settings.import.summary.skipped', {count: skippedFiles.length})}</h5>
        <ul className="file-list">
          {skippedFileItems}
        </ul>
      </div>
    );
  }

  if (erroredFiles.length > 0) {
    const erroredFileItems = erroredFiles.map((fileName, index) => (
      <li key={index} className="file-item errored">{fileName}</li>
    ));

    erroredSection = (
      <div className="upload-summary-section errored">
        <h5><ErrorIcon /> {t('settings.import.summary.errors', {count: erroredFiles.length})}</h5>
        <ul className="file-list">
          {erroredFileItems}
        </ul>
      </div>
    );
  }

  return (
    <div className="upload-summary">
      <h4>{t('settings.import.summary.title')}</h4>
      {messageSection}
      {uploadedSection}
      {skippedSection}
      {erroredSection}
    </div>
  );
}