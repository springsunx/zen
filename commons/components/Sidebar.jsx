import { h, Fragment } from "../../assets/preact.esm.js"
import Link from './Link.jsx';
import SidebarTagsList from "../../features/tags/SidebarTagsList.jsx";
import FocusSwitcher from "../../features/focus/FocusSwitcher.jsx";
import SearchMenu from "../../features/search/SearchMenu.jsx";
import SettingsModal from "../../features/settings/SettingsModal.jsx";
import { openModal } from "./Modal.jsx";
import { NotesIcon, SearchIcon, NewIcon, ArchiveIcon, TrashIcon, BoardIcon, SettingsIcon, TemplatesIcon } from "./Icon.jsx";
import { useAppContext } from "../../commons/contexts/AppContext.jsx";
import { useLayout } from "../../commons/contexts/LayoutContext.jsx";
import { t } from "../../commons/i18n/index.js";
import "./Sidebar.css";

export default function Sidebar() {
  const { isSidebarOpen, closeSidebar } = useLayout();
  const { focusModes, tags } = useAppContext();

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
          <FocusSwitcher focusModes={focusModes} />

          <Link className="sidebar-button new" to={newNoteLink()} shouldPreserveSearchParams>
            <NewIcon />
            {t("nav.new")}
          </Link>
          <div className="sidebar-button search" onClick={handleSearchClick}>
            <SearchIcon />
            {t("nav.search")}
          </div>
          <Link className="sidebar-button notes" to={notesLink()}>
            <NotesIcon />
            {t("nav.notes")}
          </Link>
          <Link className="sidebar-button canvas" activeClassName="is-active" to={canvasLink}>
            <BoardIcon />
            {t("nav.canvas")}
          </Link>
          <Link className="sidebar-button templates" activeClassName="is-active" to={templatesLink}>
            <TemplatesIcon />
            {t("nav.templates")}
          </Link>
          <Link className="sidebar-button archives" activeClassName="is-active" to={archiveLink}>
            <ArchiveIcon />
            {t("nav.archives")}
          </Link>
          <Link className="sidebar-button trash" activeClassName="is-active" to={trashLink}>
            <TrashIcon />
            {t("nav.trash")}
          </Link>
          <div className="sidebar-button settings" onClick={handleSettingsClick}>
            <SettingsIcon />
            {t("nav.settings")}
          </div>
        </div>

        <div className="sidebar-scrollable">
          <div className="sidebar-section">
            <SidebarTagsList tags={tags} />
          </div>
        </div>
      </div>
    </>
  );
}