import { h, Fragment, useEffect, useState } from "../../assets/preact.esm.js"
import Link from './Link.jsx';
import SidebarTagsList from "../../features/tags/SidebarTagsList.jsx";
import FocusSwitcher from "../../features/focus/FocusSwitcher.jsx";
import SearchMenu from "../../features/search/SearchMenu.jsx";
import SettingsModal from "../../features/settings/SettingsModal.jsx";
import { openModal } from "./Modal.jsx";
import { NotesIcon, SearchIcon, NewIcon, ArchiveIcon, TrashIcon, BoardIcon, SettingsIcon, TemplatesIcon, ClipboardIcon, ShareIcon, AttachmentsIcon } from "./Icon.jsx";
import { useAppContext } from "../../commons/contexts/AppContext.jsx";
import { useLayout } from "../../commons/contexts/LayoutContext.jsx";
import { t } from "../../commons/i18n/index.js";
import navigateTo from "../utils/navigateTo.js";
import SidebarPreferences from "../preferences/SidebarPreferences.js";
import "./Sidebar.css";

export default function Sidebar() {
  const { isSidebarOpen, closeSidebar } = useLayout();
  const { focusModes, tags } = useAppContext();
  const [visibility, setVisibility] = useState(() => SidebarPreferences.getVisibility());

  useEffect(() => {
    const handleChange = (event) => setVisibility(event.detail || SidebarPreferences.getVisibility());
    window.addEventListener("sidebar-preferences:change", handleChange);
    return () => window.removeEventListener("sidebar-preferences:change", handleChange);
  }, []);

  function handleSearchClick() {
    openModal(<SearchMenu />);
  }

  function handleSettingsClick() {
    openModal(<SettingsModal />);
  }

  function handleBackdropClick() {
    if (isSidebarOpen) {
      closeSidebar();
    }
  }

  const currentSearchParams = new URLSearchParams(window.location.search);
  const focusId = currentSearchParams.get("focusId");

  function focusParam() {
    return focusId ? `focusId=${encodeURIComponent(focusId)}` : '';
  }

  // 笔记首页/新建/归档/回收站：全部模式不带参数，聚焦模式只带 focusId
  function notesLink() {
    const p = focusParam();
    return `/notes/${p ? '?' + p : ''}`;
  }

  function newNoteLink() {
    const p = focusParam();
    return `/notes/new${p ? '?' + p : ''}`;
  }

  function statusLink(key) {
    const p = focusParam();
    const base = `/notes/?${key}=true`;
    return p ? base + '&' + p : base;
  }

  // 模板/画布：全部模式不带参数，聚焦模式只带 focusId
  function sectionLink(base) {
    const p = focusParam();
    return base + (p ? '?' + p : '');
  }

  const archiveLink = statusLink('isArchived');
  const trashLink = statusLink('isDeleted');
  const canvasLink = sectionLink('/canvases/');
  const templatesLink = sectionLink('/templates/');

  return (
    <>
      <div className={`sidebar-backdrop-container ${isSidebarOpen ? 'is-open' : ''}`} onClick={handleBackdropClick}>&nbsp;</div>
      <div className={`sidebar-container ${isSidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-fixed">
          <div className="sidebar-topbar">
            <FocusSwitcher focusModes={focusModes} />
            <button type="button" className="sidebar-button sidebar-icon-button settings" onClick={handleSettingsClick} title={t("nav.settings")} aria-label={t("nav.settings")}>
              <SettingsIcon />
            </button>
          </div>

          <div className="sidebar-quick-actions">
            <Link className="sidebar-button new" to={newNoteLink()} shouldPreserveSearchParams>
              <NewIcon />
              {t("nav.new")}
            </Link>
            <button type="button" className="sidebar-button search" onClick={handleSearchClick}>
              <SearchIcon />
              {t("nav.search")}
            </button>
          </div>
          <Link className="sidebar-button notes" to={notesLink()}>
            <NotesIcon />
            {t("nav.notes")}
          </Link>
          {visibility.canvas && <Link className="sidebar-button canvas" activeClassName="is-active" to={canvasLink}>
            <BoardIcon />
            {t("nav.canvas")}
          </Link>}
          {visibility.templates && <Link className="sidebar-button templates" activeClassName="is-active" to={templatesLink}>
            <TemplatesIcon />
            {t("nav.templates")}
          </Link>}
          {visibility.clipboard && <div className="sidebar-button clipboard" onClick={() => navigateTo('/clipboard/')}>
            <ClipboardIcon />
            {t("nav.clipboard")}
          </div>}
          {visibility.files && <Link className="sidebar-button files" activeClassName="is-active" to="/files/">
            <AttachmentsIcon />
            {t("nav.files")}
          </Link>}
          {visibility.archives && <Link className="sidebar-button archives" activeClassName="is-active" to={archiveLink}>
            <ArchiveIcon />
            {t("nav.archives")}
          </Link>}
          {visibility.trash && <Link className="sidebar-button trash" activeClassName="is-active" to={trashLink}>
            <TrashIcon />
            {t("nav.trash")}
          </Link>}
          {visibility.shares && <Link className="sidebar-button shares" activeClassName="is-active" to="/shares/">
            <ShareIcon />
            {t("nav.shares")}
          </Link>}
        </div>

        {!window.location.pathname.includes('/clipboard/') && !window.location.pathname.includes('/files/') && (
          <div className="sidebar-scrollable">
            <div className="sidebar-section">
              <SidebarTagsList tags={tags} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
