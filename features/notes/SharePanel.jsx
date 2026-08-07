import { h, useState, useEffect } from "../../assets/preact.esm.js";
import { t } from "../../commons/i18n/index.js";
import { showToast } from "../../commons/components/Toast.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import "./SharePanel.css";

var EXPIRY_OPTIONS = [1, 24, 168, 720, 0];

function formatExpiry(expiresAt) {
  if (expiresAt == null) return t("notes.share.expiry.neverExpires");
  var d = new Date(expiresAt);
  var now = new Date();
  if (d < now) return t("notes.share.expiry.expired");
  var diff = d - now;
  var hours = Math.ceil(diff / (1000 * 60 * 60));
  if (hours < 24) return t("notes.share.expiry.hoursLeft").replace("{n}", String(hours));
  var days = Math.ceil(hours / 24);
  return t("notes.share.expiry.daysLeft").replace("{n}", String(days));
}

function getShareUrl(token) {
  return window.location.origin + "/s/" + token;
}

export default function SharePanel({ noteId, showShare }) {
  var sharesState = useState([]);
  var shares = sharesState[0];
  var setShares = sharesState[1];
  var isCreatingState = useState(false);
  var isCreating = isCreatingState[0];
  var setIsCreating = isCreatingState[1];
  var expiryState = useState(0);
  var expiry = expiryState[0];
  var setExpiry = expiryState[1];

  useEffect(function () {
    if (showShare === true && noteId && noteId !== "new") {
      loadShares();
      document.body.classList.add('has-right-share');
    } else {
      document.body.classList.remove('has-right-share');
    }
    return function () { document.body.classList.remove('has-right-share'); };
  }, [showShare, noteId]);

  function loadShares() {
    if (noteId == null || noteId === "new") return;
    ApiClient.getShares(noteId)
      .then(function (data) { setShares(data || []); })
      .catch(function (e) { console.error("Failed to load shares:", e); });
  }

  function handleCreateShare() {
    var hours = expiry === 0 ? null : expiry;
    setIsCreating(true);
    ApiClient.createShare(noteId, hours)
      .then(function () {
        setIsCreating(false);
        loadShares();
        showToast(t("notes.share.created"));
      })
      .catch(function (e) {
        setIsCreating(false);
        console.error("Failed to create share:", e);
        showToast(t("notes.share.createFailed"));
      });
  }

  function handleDeleteShare(shareId) {
    ApiClient.deleteShare(shareId)
      .then(function () {
        setShares(function (prev) { return prev.filter(function (s) { return s.id !== shareId; }); });
        showToast(t("notes.share.deleted"));
      })
      .catch(function (e) {
        console.error("Failed to delete share:", e);
        showToast(t("notes.share.deleteFailed"));
      });
  }

  function handleCopyUrl(token) {
    var url = getShareUrl(token);
    navigator.clipboard.writeText(url)
      .then(function () { showToast(t("notes.share.copied")); })
      .catch(function () { showToast(t("notes.share.copyFailed")); });
  }

  if (!showShare || noteId == null || noteId === "new") {
    return null;
  }

  var items = shares.map(function (s) {
    var url = getShareUrl(s.shareToken);
    var isExpired = s.expiresAt != null && new Date(s.expiresAt) < new Date();

    return (
      <div key={s.id} className={"share-panel-item" + (isExpired ? " is-expired" : "")}>
        <div className="share-panel-item-url">{url}</div>
        <div className="share-panel-item-meta">
          <span className="share-panel-item-expiry">{formatExpiry(s.expiresAt)}</span>
          <div className="share-panel-item-actions">
            <button className="share-panel-action-btn share-panel-copy-btn" onClick={function () { handleCopyUrl(s.shareToken); }}>
              {t("notes.share.copyLink")}
            </button>
            <button className="share-panel-action-btn share-panel-delete-btn" onClick={function () { handleDeleteShare(s.id); }}>
              {t("notes.share.deleteLink")}
            </button>
          </div>
        </div>
      </div>
    );
  });

  var emptyContent = null;
  if (shares.length === 0) {
    emptyContent = <div className="share-panel-empty">{t("notes.share.empty")}</div>;
  }

  return (
    <div className="share-panel-container">
      <div className="share-panel-header">
        <span className="share-panel-title">{t("notes.share.title")}</span>
      </div>
      <div className="share-panel-create">
        <label className="share-panel-create-label">{t("notes.share.createLabel")}</label>
        <div className="share-panel-create-row">
          <select className="share-panel-create-select" value={expiry} onChange={function (e) { setExpiry(parseInt(e.target.value, 10)); }}>
            {EXPIRY_OPTIONS.map(function (opt) {
              return <option key={opt} value={opt}>{t("notes.share.expiry." + opt)}</option>;
            })}
          </select>
          <button className="share-panel-create-btn" onClick={handleCreateShare} disabled={isCreating}>
            {isCreating ? t("common.creating") : t("notes.share.create")}
          </button>
        </div>
      </div>
      <div className="share-panel-content">
        {emptyContent}
        {items}
      </div>
    </div>
  );
}
