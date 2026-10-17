import { h, useState, useEffect } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import { showToast } from '../../commons/components/Toast.jsx';
import Button from '../../commons/components/Button.jsx';
import { t } from "../../commons/i18n/index.js";
import { getAIQuickPrompts, saveAIQuickPrompts, resetAIQuickPrompts } from "../../commons/preferences/AIQuickPromptPreferences.js";
import "./AiPane.css";

export default function AiPane() {
  const [configs, setConfigs] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editConfig, setEditConfig] = useState(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [modelDisplayName, setModelDisplayName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [skipTlsVerify, setSkipTlsVerify] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [quickPrompts, setQuickPrompts] = useState(() => getAIQuickPrompts());

  useEffect(() => {
    loadConfigs();
  }, []);

  function loadConfigs() {
    ApiClient.getAIConfigs().then(setConfigs).catch(err => { console.error('Failed to load AI configs:', err); });
  }

  function resetForm() {
    setName("");
    setBaseUrl("https://api.openai.com/v1");
    setApiKey("");
    setModel("gpt-4o-mini");
    setModelDisplayName("");
    setIsDefault(false);
    setIsEditing(false);
    setEditConfig(null);
    setAvailableModels([]);
    setIsFetchingModels(false);
    setSkipTlsVerify(false);
    setSystemPrompt("");
  }

  function handleAdd() {
    resetForm();
    setIsEditing(true);
  }

  function handleEdit(config) {
    setEditConfig(config);
    setName(config.name);
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey === "***" ? "" : config.apiKey);
    setModel(config.model);
    setModelDisplayName(config.modelDisplayName || "");
    setIsDefault(config.isDefault);
    setSkipTlsVerify(config.skipTlsVerify || false);
    setSystemPrompt(config.systemPrompt || "");
    setIsEditing(true);
    setAvailableModels([]);
    // Auto-fetch models if both baseUrl and apiKey are available
    if (config.baseUrl && config.apiKey && config.apiKey !== "***") {
      setIsFetchingModels(true);
      ApiClient.fetchAIModels(config.baseUrl, config.apiKey, config.skipTlsVerify)
        .then(models => {
          setAvailableModels(models);
        })
        .catch(err => { console.error('Failed to auto-fetch models:', err); })
        .finally(() => { setIsFetchingModels(false); });
    }
  }

  function handleSave() {
    const payload = { name, baseUrl, apiKey: apiKey || (editConfig ? editConfig.apiKey : ""), model, modelDisplayName, isDefault, skipTlsVerify, systemPrompt };

    if (editConfig && editConfig.configId > 0) {
      ApiClient.updateAIConfig(editConfig.configId, payload)
        .then(() => { resetForm(); loadConfigs(); showToast(t('ai.config.saved')); })
        .catch(() => { showToast(t('ai.config.saveFailed')); });
    } else {
      ApiClient.createAIConfig(payload)
        .then(() => { resetForm(); loadConfigs(); showToast(t('ai.config.created')); })
        .catch(() => { showToast(t('ai.config.createFailed')); });
    }
  }

  function handleDelete(configId) {
    ApiClient.deleteAIConfig(configId)
      .then(() => { loadConfigs(); showToast(t('ai.config.deleted')); })
      .catch(() => { showToast(t('ai.config.deleteFailed')); });
  }

  function handleSetDefault(configId) {
    ApiClient.setDefaultAIConfig(configId)
      .then(() => { loadConfigs(); showToast(t('ai.config.setDefault')); })
      .catch(() => { showToast(t('ai.config.setDefaultFailed')); });
  }

  function handleCancel() {
    resetForm();
  }

  function updateQuickPrompt(index, changes) {
    setQuickPrompts(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  }

  function moveQuickPrompt(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= quickPrompts.length) return;
    const next = [...quickPrompts];
    [next[index], next[target]] = [next[target], next[index]];
    setQuickPrompts(next);
  }

  function handleAddQuickPrompt() {
    setQuickPrompts(items => [...items, { id: `custom-${Date.now()}`, label: "", instruction: "", enabled: true }]);
  }

  function handleSaveQuickPrompts() {
    const valid = quickPrompts.filter(item => item.label.trim() && item.instruction.trim());
    setQuickPrompts(saveAIQuickPrompts(valid));
    showToast(t('ai.quickPrompts.saved'));
  }

  function handleResetQuickPrompts() {
    setQuickPrompts(resetAIQuickPrompts());
    showToast(t('ai.quickPrompts.reset'));
  }

  function handleFetchModels() {
    if (!baseUrl) return;
    setIsFetchingModels(true);
    setAvailableModels([]);
    ApiClient.fetchAIModels(baseUrl, apiKey, skipTlsVerify)
      .then(models => {
        setAvailableModels(models);
        if (models.length > 0 && !models.includes(model)) {
          setModel(models[0]);
        }
      })
      .catch(() => { showToast(t('ai.config.fetchModelsFailed')); })
      .finally(() => { setIsFetchingModels(false); });
  }

  if (isEditing) {
    return (
      <div className="ai-pane">
        <div className="ai-pane-header">
          <h3>{editConfig ? t('ai.config.edit') : t('ai.config.add')}</h3>
        </div>
        <div className="ai-pane-form">
          <div className="ai-pane-field">
            <label>{t('ai.config.name')}</label>
            <input type="text" value={name} onInput={e => setName(e.target.value)} placeholder="OpenAI" />
          </div>
          <div className="ai-pane-field">
            <label>{t('ai.config.baseUrl')}</label>
            <input type="text" value={baseUrl} onInput={e => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
          </div>
          <div className="ai-pane-field">
            <label>{t('ai.config.apiKey')}</label>
            <input type="password" value={apiKey} onInput={e => setApiKey(e.target.value)} placeholder="sk-..." />
          </div>
          <div className="ai-pane-field">
            <label>{t('ai.config.model')}</label>
            <div className="ai-pane-model-row">
              <select value={model} onChange={e => setModel(e.target.value)} className="ai-pane-model-select">
                <option value="">{t('ai.config.selectModel')}</option>
                {availableModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button
                type="button"
                className="ghost-button ai-pane-fetch-btn"
                onClick={handleFetchModels}
                disabled={isFetchingModels || !baseUrl || !apiKey}
                title={t('ai.config.fetchModels')}
              >
                {isFetchingModels ? '...' : t('ai.config.fetchModels')}
              </button>
            </div>
          </div>
          <div className="ai-pane-field">
            <label>{t('ai.config.modelDisplayName')}</label>
            <input
              type="text"
              value={modelDisplayName}
              onInput={e => setModelDisplayName(e.target.value)}
              placeholder={t('ai.config.modelDisplayName.placeholder')}
            />
          </div>
          <div className="ai-pane-field ai-pane-checkboxes-row">
            <label className="ai-pane-checkbox">
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
              {t('ai.config.isDefault')}
            </label>
            <label className="ai-pane-checkbox">
              <input type="checkbox" checked={skipTlsVerify} onChange={e => setSkipTlsVerify(e.target.checked)} />
              {t('ai.config.skipTlsVerify')}
            </label>
          </div>
          <div className="ai-pane-field">
            <label>{t('ai.config.systemPrompt')}</label>
            <textarea
              className="ai-pane-system-prompt"
              value={systemPrompt}
              onInput={e => setSystemPrompt(e.target.value)}
              placeholder={t('ai.config.systemPrompt.placeholder')}
              rows="4"
            />
          </div>
          <div className="ai-pane-actions">
            <Button onClick={handleCancel}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSave}>{t('common.save')}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-pane">
      <div className="ai-pane-header">
        <p className="ai-pane-desc">{t('ai.config.desc')}</p>
        <button className="ghost-button" onClick={handleAdd}>+ {t('ai.config.add')}</button>
      </div>

      {configs.length === 0 && (
        <div className="ai-pane-empty">{t('ai.config.noConfigs')}</div>
      )}

      <div className="ai-pane-list">
        {configs.map(config => (
          <div className="ai-pane-item" key={config.configId}>
            <div className="ai-pane-item-info">
              <div className="ai-pane-item-name">
                {config.name}
                {config.isDefault && <span className="ai-pane-default-badge">{t('ai.config.default')}</span>}
              </div>
              <div className="ai-pane-item-detail">{config.modelDisplayName || config.model} @ {config.baseUrl}</div>
            </div>
            <div className="ai-pane-item-actions">
              {!config.isDefault && config.configId > 0 && (
                <button className="ghost-button" onClick={() => handleSetDefault(config.configId)}>{t('ai.config.setDefault')}</button>
              )}
              <button className="ghost-button" onClick={() => handleEdit(config)}>{t('common.edit')}</button>
              {config.configId > 0 && (
                <button className="ghost-button danger" onClick={() => handleDelete(config.configId)}>{t('common.delete')}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <section className="ai-quick-prompts-settings">
        <div className="ai-quick-prompts-header">
          <div>
            <h3>{t('ai.quickPrompts.title')}</h3>
            <p>{t('ai.quickPrompts.desc')}</p>
          </div>
          <button className="ghost-button" onClick={handleAddQuickPrompt}>+ {t('ai.quickPrompts.add')}</button>
        </div>
        <div className="ai-quick-prompts-list">
          {quickPrompts.map((prompt, index) => (
            <div className="ai-quick-prompts-item" key={prompt.id}>
              <label className="ai-pane-checkbox"><input type="checkbox" checked={prompt.enabled !== false} onChange={e => updateQuickPrompt(index, { enabled: e.target.checked })} />{t('ai.quickPrompts.show')}</label>
              <input value={prompt.label} onInput={e => updateQuickPrompt(index, { label: e.target.value })} placeholder={t('ai.quickPrompts.name')} />
              <textarea value={prompt.instruction} onInput={e => updateQuickPrompt(index, { instruction: e.target.value })} placeholder={t('ai.quickPrompts.prompt')} rows="3" />
              <div className="ai-quick-prompts-actions">
                <button className="ghost-button" onClick={() => moveQuickPrompt(index, -1)} disabled={index === 0}>↑</button>
                <button className="ghost-button" onClick={() => moveQuickPrompt(index, 1)} disabled={index === quickPrompts.length - 1}>↓</button>
                <button className="ghost-button danger" onClick={() => setQuickPrompts(items => items.filter((_, itemIndex) => itemIndex !== index))}>{t('common.delete')}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="ai-pane-actions">
          <Button onClick={handleResetQuickPrompts}>{t('ai.quickPrompts.reset')}</Button>
          <Button variant="primary" onClick={handleSaveQuickPrompts}>{t('common.save')}</Button>
        </div>
      </section>
    </div>
  );
}
