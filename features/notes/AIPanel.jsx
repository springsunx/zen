import { h, useState, useEffect, useRef } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import { showToast } from '../../commons/components/Toast.jsx';
import renderMarkdown from '../../commons/utils/renderMarkdown.js';
import { t } from "../../commons/i18n/index.js";
import "./AIPanel.css";

export default function AIPanel({ fullContent, selectedText, onInsert, onReplace, onClose }) {
  const [configs, setConfigs] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    ApiClient.getAIConfigs().then(list => {
      setConfigs(list);
      const def = list.find(c => c.isDefault);
      if (def) setSelectedConfigId(def.configId);
      else if (list.length > 0) setSelectedConfigId(list[0].configId);
    }).catch(err => { console.error('Failed to load AI configs:', err); });
    setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 100);
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  function handleSend() {
    const text = instruction.trim();
    if (!text || isProcessing) return;

    // Add user message
    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInstruction("");
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';

    setIsProcessing(true);

    ApiClient.processWithAI(selectedConfigId, text, fullContent || "", selectedText || "")
      .then(res => {
        const aiMsg = { role: "assistant", content: res.result };
        setMessages(prev => [...prev, aiMsg]);
      })
      .catch(() => {
        const errMsg = { role: "assistant", content: t('ai.process.failed'), isError: true };
        setMessages(prev => [...prev, errMsg]);
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text);
    showToast(t('ai.modal.copied'));
  }

  const lastAiMessage = [...messages].reverse().find(m => m.role === "assistant" && !m.isError);

  function formatFullConversation() {
    return messages.map(m => {
      if (m.role === "user") {
        return `**You:** ${m.content}`;
      }
      return `**AI:** ${m.content}`;
    }).join('\n\n');
  }

  return (
    <div className="ai-panel">
      {/* Header */}
      <div className="ai-panel-header">
        <div className="ai-panel-header-left">
          <span className="ai-panel-title">{t('ai.modal.title')}</span>
          <select
            className="ai-panel-config-select"
            value={selectedConfigId}
            onChange={e => setSelectedConfigId(Number(e.target.value))}
          >
            {configs.map(c => (
              <option key={c.configId} value={c.configId}>{c.name} ({c.model})</option>
            ))}
          </select>
          {messages.length > 1 && (
            <button className="ai-panel-insert-all" onClick={() => onInsert(formatFullConversation())} title={t('ai.modal.insertAll')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
          )}
        </div>
        <button className="ai-panel-close" onClick={onClose} title="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {/* Messages Area */}
      <div className="ai-panel-body" ref={bodyRef}>
        {messages.length === 0 && !isProcessing && (
          <div className="ai-panel-empty">
            <div className="ai-panel-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                <path d="M16 14v2a4 4 0 0 1-8 0v-2" />
                <line x1="12" y1="18" x2="12" y2="22" />
              </svg>
            </div>
            <span>{t('ai.panel.emptyHint')}</span>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="ai-panel-msg ai-panel-msg-user">
                <div className="ai-panel-msg-content">{msg.content}</div>
              </div>
            );
          }
          const rendered = renderMarkdown(msg.content);
          const isLast = i === messages.length - 1;
          return (
            <div key={i} className={`ai-panel-msg ai-panel-msg-ai ${msg.isError ? 'is-error' : ''}`}>
              <div className="ai-panel-msg-content rendered" dangerouslySetInnerHTML={{ __html: rendered }} />
              {!msg.isError && isLast && !isProcessing && (
                <div className="ai-panel-result-actions">
                  <button className="ai-panel-action-btn" onClick={() => handleCopy(msg.content)} title={t('ai.modal.copy')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    {t('ai.modal.copy')}
                  </button>
                  {selectedText && (
                    <button className="ai-panel-action-btn" onClick={() => onReplace(msg.content)} title={t('ai.modal.replaceSelection')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="17 1 21 5 17 9"/>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                        <polyline points="7 23 3 19 7 15"/>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                      </svg>
                      {t('ai.modal.replaceSelection')}
                    </button>
                  )}
                  <button className="ai-panel-action-btn" onClick={() => onInsert(msg.content)} title={t('ai.modal.insert')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    {t('ai.modal.insert')}
                  </button>
                  <button className="ai-panel-action-btn primary" onClick={() => onReplace(msg.content)} title={t('ai.modal.replace')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                    {t('ai.modal.replace')}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {isProcessing && (
          <div className="ai-panel-msg ai-panel-msg-ai">
            <div className="ai-panel-thinking">
              <div className="ai-panel-thinking-dots">
                <span></span><span></span><span></span>
              </div>
              <span>{t('ai.modal.waiting')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="ai-panel-footer">
        <textarea
          ref={inputRef}
          className="ai-panel-input"
          value={instruction}
          onInput={e => {
            setInstruction(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('ai.modal.placeholder')}
          rows="1"
        />
        <button
          className="ai-panel-send"
          onClick={handleSend}
          disabled={isProcessing || !instruction.trim()}
          title={t('ai.modal.send')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
