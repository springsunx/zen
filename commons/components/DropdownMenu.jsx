import { h, useState, useEffect, useRef } from "../../assets/preact.esm.js"
import Button from "./Button.jsx";
import { EllipsisIcon } from "../../commons/components/Icon.jsx";
import "./DropdownMenu.css";
import { t } from "../i18n/index.js";

export default function DropdownMenu({ actions, footer = null }) {
  if (actions.length === 0) {
    return null;
  }

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [dropdownRef]);

  function handleDropdownClick() {
    setIsDropdownOpen(prevIsDropdownOpen => !prevIsDropdownOpen);
  }

  function handleItemClick(action) {
    setIsDropdownOpen(false);
    if (typeof action?.onClick === "function") {
      action.onClick();
    }
  }

  const items = actions.map((action, index) => (
    <li key={index} className="dropdown-option" onClick={() => handleItemClick(action)}>
      {action?.content || action?.component || action}
    </li>
  ));


  return (
    <div ref={dropdownRef} className={`dropdown-container ${isDropdownOpen ? 'is-open' : ''}`}>
      <Button variant="ghost" onClick={handleDropdownClick}><EllipsisIcon /></Button>
        <ul className="dropdown-menu">
          {items}
          {footer && <li className="dropdown-footer">{footer}</li>}
        </ul>
      </div>
  );
}
