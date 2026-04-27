import { h, useState, useRef, useEffect } from "../../assets/preact.esm.js"
import ApiClient from "../../commons/http/ApiClient.js";
import { LinkIcon } from "../../commons/components/Icon.jsx";
import { t } from "../../commons/i18n/index.js";
import "./NoteLinkPicker.css";

export default function NoteLinkPicker({ onInsertLink, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  function handleInput(e) {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(0);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim() === "") {
      setResults([]);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(() => {
      ApiClient.search(value.trim())
        .then(data => {
          // 只保留标题中包含搜索词的笔记
          const query = value.trim().toLowerCase();
          const noteResults = [
            ...(data.lexical_notes || []),
            ...(data.semantic_notes || [])
          ];
          // 标题过滤 + 去重
          const seen = new Set();
          const deduped = noteResults.filter(n => {
            if (seen.has(n.noteId)) return false;
            seen.add(n.noteId);
            return n.title && n.title.toLowerCase().includes(query);
          });
          setResults(deduped);
          setIsLoading(false);
        })
        .catch(() => {
          setResults([]);
          setIsLoading(false);
        });
    }, 200);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      insertLink(results[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (onClose) onClose();
    }
  }

  function insertLink(note) {
    const title = note.title || note.name || "Untitled";
    const link = `[${title}](/notes/${note.noteId})`;
    if (onInsertLink) {
      onInsertLink(link);
    }
    if (onClose) {
      onClose();
    }
  }

  return (
    <div className="note-link-picker">
      <div className="note-link-picker-header">
        <LinkIcon />
        <input
          ref={inputRef}
          type="text"
          className="note-link-picker-input"
          placeholder={t('notes.linkPicker.searchPlaceholder')}
          value={query}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />
        <button className="note-link-picker-close" onClick={onClose}>&times;</button>
      </div>
      {isLoading && (
        <div className="note-link-picker-loading">{t('common.loading')}</div>
      )}
      {!isLoading && results.length > 0 && (
        <div className="note-link-picker-results">
          {results.map((note, index) => (
            <div
              key={note.noteId}
              className={`note-link-picker-item ${index === selectedIndex ? 'is-selected' : ''}`}
              onClick={() => insertLink(note)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="note-link-picker-item-title">{note.title || t('notes.editor.empty')}</div>
              {note.snippet && (
                <div className="note-link-picker-item-snippet">{note.snippet}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {!isLoading && query.trim() !== "" && results.length === 0 && (
        <div className="note-link-picker-empty">{t('notes.linkPicker.noResults')}</div>
      )}
    </div>
  );
}
