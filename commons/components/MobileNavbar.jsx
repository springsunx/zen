import { h } from "../../assets/preact.esm.js"
import Link from './Link.jsx';
import SearchMenu from "../../features/search/SearchMenu.jsx";
import { openModal } from "./Modal.jsx";
import { NotesIcon, SearchIcon, NewIcon } from "./Icon.jsx";
import "./MobileNavbar.css";
import { t } from "../../commons/i18n/index.js";

export default function MobileNavbar() {
  function handleSearchClick() {
    openModal(<SearchMenu />);
  }

  return (
    <div className="mobile-navbar-container">
      <div className="mobile-navbar">
        <Link className="mobile-navbar-button" to="/notes/" shouldPreserveSearchParams>
          <NotesIcon />{t('nav.notes')}        </Link>
        <div className="mobile-navbar-button" onClick={handleSearchClick}>
          <SearchIcon />{t('nav.search')}        </div>
        <Link className="mobile-navbar-button" to="/notes/new" shouldPreserveSearchParams>
          <NewIcon />{t('nav.new')}        </Link>
      </div>
    </div>
  );
}