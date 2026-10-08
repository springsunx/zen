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
import SidebarPreferences, { SIDEBAR_POSITIONS } from "../preferences/SidebarPreferences.js";
import "./Sidebar.css";

export default function Sidebar() {
  const { isSidebarOpen, closeSidebar } = useLayout();
  const { focusModes, tags } = useAppContext();
  const [sidebarPreferences, setSidebarPreferences] = useState(() => SidebarPreferences.getPreferences());
  const { visibility, positions } = sidebarPreferences;

  useEffect(() => {
    const handleChange = (event) => setSidebarPreferences(event.detail || SidebarPreferences.getPreferences());
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

  const navigationItems = [
    { id: "canvas", icon: BoardIcon, label: t("nav.canvas"), to: canvasLink },
    { id: "templates", icon: TemplatesIcon, label: t("nav.templates"), to: templatesLink },
    { id: "clipboard", icon: ClipboardIcon, label: t("nav.clipboard"), onClick: () => navigateTo('/clipboard/') },
    { id: "files", icon: AttachmentsIcon, label: t("nav.files"), to: "/files/" },
    { id: "archives", icon: ArchiveIcon, label: t("nav.archives"), to: archiveLink },
    { id: "trash", icon: TrashIcon, label: t("nav.trash"), to: trashLink },
    { id: "shares", icon: ShareIcon, label: t("nav.shares"), to: "/shares/" },
  ];

  const labelledItems = navigationItems.filter(item => visibility[item.id] && positions[item.id] !== SIDEBAR_POSITIONS.RAIL);
  const railItems = navigationItems.filter(item => visibility[item.id] && positions[item.id] === SIDEBAR_POSITIONS.RAIL);

  function renderNavigationItem(item, iconOnly = false) {
    const Icon = item.icon;
    const className = `sidebar-button ${item.id}${iconOnly ? ' sidebar-rail-button' : ''}`;
    const content = <><Icon />{iconOnly ? null : item.label}</>;

    if (item.to) {
      return <Link key={item.id} className={className} activeClassName="is-active" to={item.to} title={item.label} aria-label={item.label}>{content}</Link>;
    }
    return <button key={item.id} type="button" className={className} onClick={item.onClick} title={item.label} aria-label={item.label}>{content}</button>;
  }

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
          <div className="sidebar-navigation">
            <div className="sidebar-navigation-main">
              <Link className="sidebar-button notes" to={notesLink()}>
                <NotesIcon />
                {t("nav.notes")}
              </Link>
              {labelledItems.map(item => renderNavigationItem(item))}
            </div>
            {railItems.length > 0 && (
              <div className="sidebar-icon-rail">
                {railItems.map(item => renderNavigationItem(item, true))}
              </div>
            )}
          </div>
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
