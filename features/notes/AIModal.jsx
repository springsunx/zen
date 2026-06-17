import { h, useState, useEffect } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import { showToast } from '../../commons/components/Toast.jsx';
import renderMarkdown from '../../commons/utils/renderMarkdown.js';
import { t } from "../../commons/i18n/index.js";
import "./AIModal.css";

export default function AIModal({ fullContent, selectedText, onInsert, onReplace, onClose }) {
  const [configs, setConfigs] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    ApiClient.getAIConfigs().then(list => {
      setConfigs(list);
      const def = list.find(c => c.isDefault);
      if (def) setSelectedConfigId(def.configId);
      else if (list.length > 0) setSelectedConfigId(list[0].configId);
    }).catch(() => {});
  }, []);

  function handleSend() {
    if (!instruction.trim()) return;
    setIsProcessing(true);
    setResult("");

    ApiClient.processWithAI(selectedConfigId, instruction, fullContent || "", selectedText || "")
      .then(res => {
        setResult(res.result);
      })
      .catch(err => {
        showToast(t('ai.process.failed'));
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasResult = result.length > 0;
  const renderedResult = hasResult ? renderMarkdown(result) : "";

  return (
    <div className="modal-backdrop-container" onClick={e => { if (e.target.classList.contains('modal-backdrop-container')) onClose(); }}>
      <div className="modal-container ai-modal">
        <div className="modal-header">
          <h3>{t('ai.modal.title')}</h3>
          <span className="modal-close" onClick={onClose}>✕</span>
        </div>
        <div className="modal-content">
          <div className="ai-modal-config-row">
            <select value={selectedConfigId} onChange={e => setSelectedConfigId(Number(e.target.value))}>
              {configs.map(c => (
                <option key={c.configId} value={c.configId}>{c.name} ({c.model})</option>
              ))}
            </select>
          </div>

          <div className="ai-modal-input-area">
            <textarea
              value={instruction}
              onInput={e => setInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('ai.modal.placeholder')}
              rows="3"
            />
            <button className="button primary ai-modal-send" onClick={handleSend} disabled={isProcessing || !instruction.trim()}>
              {isProcessing ? t('ai.modal.processing') : t('ai.modal.send')}
            </button>
          </div>

          {isProcessing && (
            <div className="ai-modal-loading">
              <div className="ai-modal-spinner"></div>
              <span>{t('ai.modal.waiting')}</span>
            </div>
          )}

          {hasResult && !isProcessing && (
            <div className="ai-modal-result">
              <div className="ai-modal-result-header">{t('ai.modal.result')}</div>
              <div className="ai-modal-result-content rendered" dangerouslySetInnerHTML={{ __html: renderedResult }} />
            </div>
          )}
        </div>

        {hasResult && !isProcessing && (
          <div className="modal-footer">
            <button className="ghost-button" onClick={() => { navigator.clipboard.writeText(result); showToast(t('ai.modal.copied')); }}>
              {t('ai.modal.copy')}
            </button>
            {selectedText && (
              <button className="ghost-button" onClick={() => onReplace(result)}>
                {t('ai.modal.replaceSelection')}
              </button>
            )}
            <button className="ghost-button" onClick={() => onInsert(result)}>
              {t('ai.modal.insert')}
            </button>
            <button className="button primary" onClick={() => onReplace(result)}>
              {t('ai.modal.replace')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
