import { h, useState } from "../../assets/preact.esm.js";
import AutoSavePreferences from "../../commons/preferences/AutoSavePreferences.js";
import SpellcheckPreferences from "../../commons/preferences/SpellcheckPreferences.js";
import Toggle from "../../commons/components/Toggle.jsx";
import { t } from "../../commons/i18n/index.js";

export default function EditorPane() {
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(() => AutoSavePreferences.isEnabled());
  const [isSpellcheckEnabled, setIsSpellcheckEnabled] = useState(() => SpellcheckPreferences.isEnabled());

  function handleAutoSaveChange(newValue) {
    setIsAutoSaveEnabled(newValue);
    AutoSavePreferences.setEnabled(newValue);
    notifyEditorPreferencesChanged();
  }

  function handleSpellcheckChange(newValue) {
    setIsSpellcheckEnabled(newValue);
    SpellcheckPreferences.setEnabled(newValue);
    notifyEditorPreferencesChanged();
  }

  // The editor reads these preferences during render, so an open editor has to be told
  // to render again or the toggle appears to do nothing until the note is reopened.
  function notifyEditorPreferencesChanged() {
    window.dispatchEvent(new CustomEvent('editor-preferences:change'));
  }

  return (
    <div className="settings-tab-content">
      <h3>{t('settings.editor.title')}</h3>
      <p>{t('settings.editor.desc')}</p>
      <ToggleOption
        label={t('settings.editor.autoSave')}
        description={t('settings.editor.autoSave.desc')}
        isEnabled={isAutoSaveEnabled}
        onChange={handleAutoSaveChange}
      />
      <ToggleOption
        label={t('settings.editor.spellcheck')}
        description={t('settings.editor.spellcheck.desc')}
        isEnabled={isSpellcheckEnabled}
        onChange={handleSpellcheckChange}
      />
    </div>
  );
}

function ToggleOption({ label, description, isEnabled, onChange }) {
  return (
    <div className="settings-toggle-option">
      <div className="settings-toggle-info">
        <div className="settings-toggle-label">{label}</div>
        <div className="settings-toggle-description">{description}</div>
      </div>
      <Toggle isEnabled={isEnabled} onChange={onChange} />
    </div>
  );
}
