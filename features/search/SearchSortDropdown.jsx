import { h, useState, useEffect, useRef } from "../../assets/preact.esm.js";
import { ArrowDownIcon } from "../../commons/components/Icon.jsx";
import { t } from "../../commons/i18n/index.js";
import "./SearchSortDropdown.css";

export const SORT_OPTIONS = [
  { value: "relevance", labelKey: "search.sort.relevance" },
  { value: "updated", labelKey: "search.sort.updated" },
  { value: "created", labelKey: "search.sort.created" },
];

export default function SearchSortDropdown({ activeSort, onSortChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current !== null && containerRef.current.contains(e.target) !== true) {
        setIsOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  function handleToggleClick() {
    setIsOpen(prevIsOpen => prevIsOpen !== true);
  }

  function handleOptionClick(value) {
    setIsOpen(false);
    onSortChange(value);
  }

  const activeOption = SORT_OPTIONS.find(option => option.value === activeSort);

  let activeLabel = t(SORT_OPTIONS[0].labelKey);
  if (activeOption !== undefined) {
    activeLabel = t(activeOption.labelKey);
  }

  const options = SORT_OPTIONS.map(option => {
    const isActive = option.value === activeSort;
    return (
      <li
        key={option.value}
        className={`search-sort-dropdown-option ${isActive === true ? "is-active" : ""}`}
        onClick={() => handleOptionClick(option.value)}
      >
        {t(option.labelKey)}
      </li>
    );
  });

  return (
    <div ref={containerRef} className={`search-sort-dropdown ${isOpen === true ? "is-open" : ""}`}>
      <button className="search-sort-dropdown-toggle" onClick={handleToggleClick}>
        {activeLabel}
        <ArrowDownIcon />
      </button>
      <ul className="search-sort-dropdown-menu">
        {options}
      </ul>
    </div>
  );
}
