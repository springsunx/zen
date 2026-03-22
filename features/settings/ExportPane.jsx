import { h, useState } from "../../assets/preact.esm.js"
import { DownloadIcon } from "../../commons/components/Icon.jsx";
import { showToast } from "../../commons/components/Toast.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import Button from "../../commons/components/Button.jsx";
import { t } from "../../commons/i18n/index.js";

export default function ExportPane() {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExportClick() {
    if (isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      await ApiClient.exportNotes();
      showToast(t('settings.export.toast.ok'));
    } catch (error) {
      console.error('Export error:', error);
      showToast(t('settings.export.toast.fail'));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="settings-tab-content">
      <h3>{t('settings.export.title')}</h3>
      <p>{t('settings.export.desc')}</p>
      
      <div className="export-section">
        <h4>{t('settings.export.included.title')}</h4>
        <ul className="export-info-list">
          <li><strong>{t('settings.export.included.md').split(": ")[0]}:</strong> {t('settings.export.included.md').split(": ")[1]}</li>
          <li><strong>{t('settings.export.included.raw').split(": ")[0]}:</strong> {t('settings.export.included.raw').split(": ")[1]}</li>
          <li><strong>{t('settings.export.included.cross').split(": ")[0]}:</strong> {t('settings.export.included.cross').split(": ")[1]}</li>
        </ul>
        
        <h4>{t('settings.export.structure.title')}</h4>
        <pre className="export-tree">
{`zen-export-2025-08-08.zip
├── my-note.md
├── project-ideas.md
├── archived/
│   └── old-draft.md
├── images/
│   └── diagram.jpg
├── notes.json
├── tags.json
└── metadata.json`}
        </pre>
      </div>

      <div className="export-actions">
        <Button 
          variant={`primary ${isExporting ? 'disabled' : ''}`}
          onClick={handleExportClick}
          isDisabled={isExporting}
        >
          {isExporting ? t('settings.export.btn.exporting') : t('settings.export.btn.export')}
        </Button>
      </div>
    </div>
  )
}