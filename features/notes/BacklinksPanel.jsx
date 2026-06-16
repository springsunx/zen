import { h, useState } from "../../assets/preact.esm.js";
import { LinkIcon, ChevronRightIcon } from "../../commons/components/Icon.jsx";
import navigateTo from "../../commons/utils/navigateTo.js";
import formatDate from "../../commons/utils/formatDate.js";
import { t } from "../../commons/i18n/index.js";
import "./BacklinksPanel.css";

export default function BacklinksPanel({ backlinks = [], isLoading = false }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (isLoading === true) {
    return (
      <div className="backlinks-panel">
        <div className="backlinks-header">
          <LinkIcon />
          <span className="backlinks-title">{t('backlinks.title')}</span>
        </div>
        <div className="backlinks-loading">{t('backlinks.loading')}</div>
      </div>
    );
  }

  if (backlinks.length === 0) {
    return null;
  }

  function handleToggle(e) {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  }

  const items = backlinks.map(note => {
    const updatedAtDate = new Date(note.updatedAt);
    const shortDate = formatDate(updatedAtDate);
    const snippet = note.snippet ? note.snippet.substring(0, 120) : "";

    function handleClick(e) {
      e.preventDefault();
      navigateTo(`/notes/${note.noteId}`);
    }

    return (
      <a className="backlinks-item" key={note.noteId} href={`/notes/${note.noteId}`} onClick={handleClick}>
        <div className="backlinks-item-title">{note.title || t('backlinks.untitled')}</div>
        {snippet && <div className="backlinks-item-snippet">{snippet}</div>}
        <div className="backlinks-item-date">{shortDate}</div>
      </a>
    );
  });

  return (
    <div className="backlinks-panel">
      <div className="backlinks-header" onClick={handleToggle} style="cursor: pointer;">
        <span className={`backlinks-toggle ${isExpanded ? 'is-expanded' : ''}`}>
          <ChevronRightIcon />
        </span>
        <LinkIcon />
        <span className="backlinks-title">{t('backlinks.title')}</span>
        <span className="backlinks-count">{backlinks.length}</span>
      </div>
      {isExpanded && (
        <div className="backlinks-list">
          {items}
        </div>
      )}
    </div>
  );
}
