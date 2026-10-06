import { h, useEffect, useMemo, useState } from "../../assets/preact.esm.js";
import Sidebar from "../../commons/components/Sidebar.jsx";
import MobileNavbar from "../../commons/components/MobileNavbar.jsx";
import EmptyState from "../../commons/components/EmptyState.jsx";
import Spinner from "../../commons/components/Spinner.jsx";
import { ShareIcon } from "../../commons/components/Icon.jsx";
import { LayoutProvider } from "../../commons/contexts/LayoutContext.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import navigateTo from "../../commons/utils/navigateTo.js";
import { showToast } from "../../commons/components/Toast.jsx";
import { t } from "../../commons/i18n/index.js";
import "./SharesPage.css";

function isExpired(share) {
  return share.expiresAt != null && new Date(share.expiresAt) <= new Date();
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(navigator.language || "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatExpiry(share) {
  if (share.expiresAt == null) return t("shares.neverExpires");
  if (isExpired(share)) return t("shares.expired");
  return formatDate(share.expiresAt);
}

function getShareUrl(token) {
  return window.location.origin + "/s/" + token;
}

export default function SharesPage() {
  const [shares, setShares] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isMounted = true;

    ApiClient.getAllShares()
      .then((data) => {
        if (isMounted) setShares(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (!isMounted) return;
        console.error("Failed to load shares:", error);
        showToast(t("shares.loadFailed"));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  function handleCopy(shareToken) {
    navigator.clipboard.writeText(getShareUrl(shareToken))
      .then(() => showToast(t("notes.share.copied")))
      .catch(() => showToast(t("notes.share.copyFailed")));
  }

  function handleRevoke(shareId) {
    ApiClient.deleteShare(shareId)
      .then(() => {
        setShares((items) => items.filter((share) => share.id !== shareId));
        showToast(t("notes.share.deleted"));
      })
      .catch((error) => {
        console.error("Failed to revoke share:", error);
        showToast(t("notes.share.deleteFailed"));
      });
  }

  const visibleShares = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return shares.filter((share) => {
      if (filter === "active" && isExpired(share)) return false;
      if (filter === "expired" && !isExpired(share)) return false;
      return !normalizedQuery || (share.noteTitle || "").toLowerCase().includes(normalizedQuery);
    });
  }, [shares, filter, query]);

  let content;
  if (isLoading) {
    content = <div className="shares-loading"><Spinner /></div>;
  } else if (visibleShares.length === 0) {
    content = <EmptyState icon={<ShareIcon />} title={t("shares.empty.title")} description={t("shares.empty.desc")} />;
  } else {
    content = (
      <div className="shares-list">
        <table className="shares-table">
          <colgroup>
            <col className="shares-note-column" />
            <col className="shares-link-column" />
            <col className="shares-status-column" />
            <col className="shares-expiry-column" />
            <col className="shares-created-column" />
            <col className="shares-actions-column" />
          </colgroup>
          <thead>
            <tr>
              <th>{t("shares.column.note")}</th>
              <th>{t("shares.column.link")}</th>
              <th>{t("shares.column.status")}</th>
              <th>{t("shares.column.expiry")}</th>
              <th>{t("shares.column.created")}</th>
              <th>{t("shares.column.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleShares.map((share) => {
              const expired = isExpired(share);
              return (
                <tr className="shares-item" key={share.id}>
                  <td><button type="button" className="shares-note-title" onClick={() => navigateTo(`/notes/${share.noteId}`)}>{share.noteTitle || t("shares.untitled")}</button></td>
                  <td><a className="shares-link" href={getShareUrl(share.shareToken)} target="_blank" rel="noreferrer">{getShareUrl(share.shareToken)}</a></td>
                  <td><span className={`shares-status ${expired ? "is-expired" : "is-active"}`}>{expired ? t("shares.expired") : t("shares.active")}</span></td>
                  <td><span className="shares-item-detail">{formatExpiry(share)}</span></td>
                  <td><span className="shares-item-detail">{formatDate(share.createdAt)}</span></td>
                  <td><div className="shares-item-actions">
                    <button type="button" className="shares-action-button" onClick={() => handleCopy(share.shareToken)}>{t("notes.share.copyLink")}</button>
                    <button type="button" className="shares-action-button is-danger" onClick={() => handleRevoke(share.id)}>{t("shares.revoke")}</button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <LayoutProvider>
      <div className="page-container">
        <Sidebar />
        <main className="shares-page-content">
          <header className="shares-header">
            <h1>{t("shares.title")}</h1>
            <p>{t("shares.desc")}</p>
          </header>
          <div className="shares-controls">
            <input value={query} onInput={(event) => setQuery(event.target.value)} placeholder={t("shares.searchPlaceholder")} />
            <div className="shares-filter" role="tablist" aria-label={t("shares.filter") }>
              {["active", "expired", "all"].map((value) => (
                <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>
                  {t("shares.filter." + value)}
                </button>
              ))}
            </div>
          </div>
          {content}
        </main>
        <MobileNavbar />
        <div className="modal-root"></div>
        <div className="toast-root"></div>
      </div>
    </LayoutProvider>
  );
}
