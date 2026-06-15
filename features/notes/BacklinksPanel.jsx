import { h } from "../../assets/preact.esm.js";
import { LinkIcon } from "../../commons/components/Icon.jsx";
import navigateTo from "../../commons/utils/navigateTo.js";
import formatDate from "../../commons/utils/formatDate.js";
import "./BacklinksPanel.css";

export default function BacklinksPanel({ backlinks = [], isLoading = false }) {
  if (isLoading === true) {
    return (
      <div className="backlinks-panel">
        <div className="backlinks-header">
          <LinkIcon />
          <span className="backlinks-title">Backlinks</span>
        </div>
        <div className="backlinks-loading">Loading...</div>
      </div>
    );
  }

  if (backlinks.length === 0) {
    return null;
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
        <div className="backlinks-item-title">{note.title || "Untitled"}</div>
        {snippet && <div className="backlinks-item-snippet">{snippet}</div>}
        <div className="backlinks-item-date">{shortDate}</div>
      </a>
    );
  });

  return (
    <div className="backlinks-panel">
      <div className="backlinks-header">
        <LinkIcon />
        <span className="backlinks-title">Backlinks</span>
        <span className="backlinks-count">{backlinks.length}</span>
      </div>
      <div className="backlinks-list">
        {items}
      </div>
    </div>
  );
}
