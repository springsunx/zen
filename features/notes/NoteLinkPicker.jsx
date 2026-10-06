import { h, useState, useRef, useEffect } from "../../assets/preact.esm.js"
import ApiClient from "../../commons/http/ApiClient.js";
import { HyperlinkIcon } from "../../commons/components/Icon.jsx";
import { t } from "../../commons/i18n/index.js";

export default function NoteLinkPicker({ onInsertLink, onClose, textareaRef, cursorPos }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    // Close on outside click
    function handleOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        if (textareaRef?.current) textareaRef.current.focus();
        onClose();
      }
    }
    // Close on Escape
    function handleEscape(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (textareaRef?.current) textareaRef.current.focus();
        onClose();
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // CodeMirror gives us the real visual cursor position, including wrapped lines.
  const position = (() => {
    if (!textareaRef?.current) return { top: 0, left: 0 };
    const pos = cursorPos != null ? cursorPos : textareaRef.current.selectionStart;
    const coords = textareaRef.current.getCursorCoords(pos);
    return { top: coords.bottom + 4, left: Math.max(0, coords.left) };
  })();

  function handleInput(e) {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); setIsLoading(false); return; }
    setIsLoading(true);
    debounceRef.current = setTimeout(() => {
      ApiClient.search(value.trim()).then(data => {
        const queryLower = value.trim().toLowerCase();
        const noteResults = [
          ...(data.lexicalNotes || []),
          ...(data.semanticNotes || [])
        ];
        const seen = new Set();
        const deduped = noteResults.filter(n => {
          if (seen.has(n.noteId)) return false;
          seen.add(n.noteId);
          return n.title && n.title.toLowerCase().includes(queryLower);
        });
        setResults(deduped);
        setIsLoading(false);
      }).catch(() => { setResults([]); setIsLoading(false); });
    }, 200);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) insertLink(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (textareaRef?.current) textareaRef.current.focus();
      onClose();
    }
  }

  function insertLink(note) {
    const title = note.title || "Untitled";
    const link = `[${title}](/notes/${note.noteId})`;
    onInsertLink(link);
    onClose();
  }

  return (
    <div className="note-link-picker" ref={pickerRef} style={{ position: 'absolute', top: position.top + 'px', left: position.left + 'px' }}>
      <div className="note-link-picker-input-row">
        <HyperlinkIcon />
        <input
          ref={inputRef}
          type="text"
          className="note-link-picker-input"
          placeholder={t('notes.linkPicker.searchPlaceholder')}
          value={query}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />
      </div>
      {isLoading && <div className="note-link-picker-loading">{t('common.loading')}</div>}
      {!isLoading && query.trim() && results.length === 0 && (
        <div className="note-link-picker-empty">{t('notes.linkPicker.noResults')}</div>
      )}
      {results.length > 0 && (
        <div className="note-link-picker-results">
          {results.map((note, i) => (
            <div
              key={note.noteId}
              className={`note-link-picker-item ${i === selectedIndex ? 'selected' : ''}`}
              onMouseDown={e => { e.preventDefault(); insertLink(note); }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="note-link-picker-item-title">{note.title}</span>
              {note.snippet && <span className="note-link-picker-item-snippet">{note.snippet}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
