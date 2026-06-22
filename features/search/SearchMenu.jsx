import { h, useEffect, useState, useRef } from "../../assets/preact.esm.js"
import ApiClient from "../../commons/http/ApiClient.js";
import navigateTo from "../../commons/utils/navigateTo.js";
import { SearchIcon, NoteIcon, ArchiveIcon, TrashIcon, TagIcon } from "../../commons/components/Icon.jsx";
import { ModalBackdrop, ModalContainer, closeModal, openModal } from "../../commons/components/Modal.jsx";
import Lightbox from "../../commons/components/Lightbox.jsx";
import SearchHistory from "../../commons/preferences/SearchHistory.js";
import Tabs from "../../commons/components/Tabs.jsx";
import { getStaticCommands, getFocusModeCommands, getTemplateCommands, filterCommands, getCommandCategories } from "./commands.js";
import "./SearchMenu.css";
import { t } from "../../commons/i18n/index.js";

export default function SearchMenu({ initialMode }) {
  const isCommandMode = initialMode === "commands";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ lexical_notes: [], semantic_notes: [], semantic_images: [], tags: [] });
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [activeTab, setActiveTab] = useState(isCommandMode ? "commands" : "all");
  const [allCommands, setAllCommands] = useState([]);
  const [isCommandsLoading, setIsCommandsLoading] = useState(true);

  const inputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  function handleCloseModal() {
    closeModal();
  }

  // Load commands on mount
  useEffect(() => {
    const staticCmds = getStaticCommands();

    // Load focus modes from AppContext data via API
    ApiClient.getFocusModes()
      .then(focusModes => {
        const focusCmds = getFocusModeCommands(focusModes);
        setAllCommands([...staticCmds, ...focusCmds]);
      })
      .catch(() => {
        setAllCommands(staticCmds);
      })
      .finally(() => {
        setIsCommandsLoading(false);
      });

    // Load templates asynchronously and append
    getTemplateCommands()
      .then(templateCmds => {
        if (templateCmds.length > 0) {
          setAllCommands(prev => [...prev, ...templateCmds]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    setSearchHistory(SearchHistory.getItems());
  }, []);

  // Auto-scroll to keep selected item visible during keyboard navigation
  useEffect(() => {
    const el = document.querySelector('.search-results-container .is-selected');
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedItem]);

  // Filtered commands based on query
  const filteredCmds = filterCommands(allCommands, query);
  const visibleCmds = filteredCmds.filter(cmd => cmd.isAvailable !== undefined ? cmd.isAvailable() : true);

  // Wrap commands as items for keyboard navigation
  function wrapCommandsAsItems(cmds) {
    return cmds.map(cmd => ({ ...cmd, _isCommand: true }));
  }

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (value.trim() === "") {
      setResults({ lexical_notes: [], semantic_notes: [], semantic_images: [], tags: [] });
      const cmdItems = wrapCommandsAsItems(visibleCmds);
      setSelectedItem(searchHistory.length > 0 ? searchHistory[0] : (cmdItems.length > 0 ? cmdItems[0] : null));
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      ApiClient.search(value)
        .then(searchResults => {
          setResults(searchResults);
          updateSelectedForQuery(value, searchResults);
        });
    }, 200);
  }

  function updateSelectedForQuery(value, searchResults) {
    const cmdItems = wrapCommandsAsItems(filterCommands(allCommands, value).filter(cmd => cmd.isAvailable !== undefined ? cmd.isAvailable() : true));
    let allItems;

    if (activeTab === "commands") {
      allItems = cmdItems;
    } else if (activeTab === "notes") {
      allItems = [...(searchResults?.lexical_notes || []), ...(searchResults?.semantic_notes || []), ...(searchResults?.semantic_images || [])];
    } else if (activeTab === "tags") {
      allItems = searchResults?.tags || [];
    } else {
      allItems = [...(searchResults?.lexical_notes || []), ...(searchResults?.semantic_notes || []), ...(searchResults?.semantic_images || []), ...(searchResults?.tags || []), ...cmdItems];
    }

    if (allItems.length > 0) {
      setSelectedItem(allItems[0]);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      setActiveTab(prev => {
        if (prev === "all") return "notes";
        if (prev === "notes") return "tags";
        if (prev === "tags") return "commands";
        return "all";
      });
    }
  }

  function handleKeyUp(e) {
    if (e.key === "Tab") {
      return;
    }

    const allItems = computeAllItems();

    if (e.key === "ArrowDown") {
      const currentIndex = findItemIndex(allItems, selectedItem);
      const nextIndex = currentIndex + 1;
      if (nextIndex < allItems.length) {
        setSelectedItem(allItems[nextIndex]);
      } else {
        setSelectedItem(allItems[0]);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      const currentIndex = findItemIndex(allItems, selectedItem);
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        setSelectedItem(allItems[prevIndex]);
      } else {
        setSelectedItem(allItems[allItems.length - 1]);
      }
      return;
    }

    if (e.key === 'Enter' && selectedItem) {
      handleResultClick(selectedItem);
      return;
    }
  }

  function computeAllItems() {
    const sortedCmds = sortByCategory(visibleCmds);
    const cmdItems = wrapCommandsAsItems(sortedCmds);
    const filteredCmdItems = query.trim() !== ""
      ? wrapCommandsAsItems(sortByCategory(filterCommands(allCommands, query).filter(cmd => cmd.isAvailable !== undefined ? cmd.isAvailable() : true)))
      : cmdItems;

    if (query.trim() === "") {
      return [...searchHistory, ...cmdItems];
    }

    if (activeTab === "commands") {
      return filteredCmdItems;
    }

    if (activeTab === "notes") {
      return [...results.lexical_notes, ...results.semantic_notes, ...results.semantic_images];
    }

    if (activeTab === "tags") {
      return results.tags;
    }

    // "all" tab
    return [...results.lexical_notes, ...results.semantic_notes, ...results.semantic_images, ...results.tags, ...filteredCmdItems];
  }


  function handleResultClick(item) {
    if (item._isCommand && item.action) {
      item.action();
      return;
    }

    if (item.noteId) {
      SearchHistory.saveItem(item);
      navigateTo(`/notes/${item.noteId}`);
      closeModal();
    } else if (item.tagId) {
      SearchHistory.saveItem(item);
      navigateTo(`/?tagId=${item.tagId}`);
      closeModal();
    } else if (item.filename) {
      const imageDetails = results.semantic_images.map(image => ({
        url: `/images/${image.filename}`,
        width: image.width,
        height: image.height,
        aspectRatio: image.aspectRatio,
        filename: image.filename,
      }));

      const selectedImage = imageDetails.find(img => img.filename === item.filename);

      openModal(<Lightbox selectedImage={selectedImage} imageDetails={imageDetails} onClose={closeModal} />);
    }
  }

  // ── Build sections ──

  let historySection = null;
  let quickActionsSection = null;
  let lexicalNotesSection = null;
  let semanticNotesSection = null;
  let semanticImagesSection = null;
  let tagsSection = null;
  let commandsSection = null;

  const hasQuery = query.trim() !== "";

  if (!hasQuery) {
    // Empty query: show history + all commands
    if (searchHistory.length > 0) {
      const historyItems = searchHistory.map((item, index) => {
        const isSelected = (item.noteId && item.noteId === selectedItem?.noteId) || (item.tagId && item.tagId === selectedItem?.tagId);
        return (
          <div className="search-history-item" key={`history-${index}`}>
            <SearchResultItem item={item} isSelected={isSelected} onClick={() => handleResultClick(item)} />
            <div className="search-history-delete" onClick={(e) => { e.stopPropagation(); const updated = SearchHistory.removeItem(item); setSearchHistory(updated); }} title={t('common.delete') || '删除'}>&#x2715;</div>
          </div>
        )
      });

      historySection = (
        <div className="search-section">
          <h4 className="search-section-title">{t('search.recent')}</h4>
          {historyItems}
        </div>
      );
    }

    // Show all commands grouped by category
    quickActionsSection = renderCommandsByCategory(visibleCmds, selectedItem, handleResultClick);
  } else {
    // Has query: show search results + filtered commands
    const showNotes = activeTab === "all" || activeTab === "notes";
    const showTags = activeTab === "all" || activeTab === "tags";
    const showCommands = activeTab === "all" || activeTab === "commands";

    if (showNotes === true) {
      if (results.lexical_notes.length > 0) {
        const noteItems = results.lexical_notes.map((item, index) => {
          const isSelected = item.noteId === selectedItem?.noteId;
          return (
            <SearchResultItem key={`lexical-note-${index}`} item={item} isSelected={isSelected} onClick={() => handleResultClick(item)} />
          )
        });

        lexicalNotesSection = (
          <div className="search-section">
            <h4 className="search-section-title">{t('search.notes')}</h4>
            {noteItems}
          </div>
        );
      }

      if (results.semantic_notes.length > 0) {
        const noteItems = results.semantic_notes.map((item, index) => {
          const isSelected = item.noteId === selectedItem?.noteId;
          return (
            <SearchResultItem key={`semantic-note-${index}`} item={item} isSelected={isSelected} onClick={() => handleResultClick(item)} />
          )
        });

        semanticNotesSection = (
          <div className="search-section">
            <h4 className="search-section-title">{t('search.similar')}</h4>
            {noteItems}
          </div>
        );
      }

      if (results.semantic_images.length > 0) {
        semanticImagesSection = (
          <div className="search-section">
            <h4 className="search-section-title">{t('search.similarImages')}</h4>
            <SearchResultImages items={results.semantic_images} onClick={handleResultClick} />
          </div>
        );
      }
    }

    if (showTags === true) {
      if (results.tags.length > 0) {
        const tagItems = results.tags.map((item, index) => {
          const isSelected = item.tagId === selectedItem?.tagId;
          return (
            <SearchResultItem key={`tag-${index}`} item={item} isSelected={isSelected} onClick={() => handleResultClick(item)} />
          )
        });

        tagsSection = (
          <div className="search-section">
            <h4 className="search-section-title">{t('search.tags')}</h4>
            {tagItems}
          </div>
        );
      }
    }

    if (showCommands === true) {
      const matchedCmds = filterCommands(allCommands, query).filter(cmd => cmd.isAvailable !== undefined ? cmd.isAvailable() : true);
      if (matchedCmds.length > 0) {
        commandsSection = (
          <div className="search-section">
            <h4 className="search-section-title">{t('search.commands')}</h4>
            {renderCommandItems(matchedCmds, selectedItem, handleResultClick)}
          </div>
        );
      }
    }
  }

  const showTabs = hasQuery;

  let tabsSection = null;
  if (showTabs === true) {
    tabsSection = (
      <div className="search-tabs">
        <Tabs
          tabs={[
            { value: "all", label: t('search.all') },
            { value: "notes", label: t('search.notes') },
            { value: "tags", label: t('search.tags') },
            { value: "commands", label: t('search.commands') },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    );
  }

  const placeholder = isCommandMode ? t('command.palette.placeholder') : t('search.placeholder');

  return (
    <ModalBackdrop onClose={handleCloseModal} isCentered={false}>
      <ModalContainer className="search-modal">
        <div className="search-input-container">
          <SearchIcon />
          <input
            type="text"
            placeholder={placeholder}
            ref={inputRef}
            value={query}
            onInput={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
          />
        </div>
        {tabsSection}
        <div className="search-results-container">
          {historySection}
          {quickActionsSection}
          {lexicalNotesSection}
          {semanticNotesSection}
          {semanticImagesSection}
          {tagsSection}
          {commandsSection}
        </div>
      </ModalContainer>
    </ModalBackdrop>
  );
}

// ── Command rendering helpers ──

function renderCommandsByCategory(cmds, selected, onClick) {
  const categories = getCommandCategories();
  const sections = [];

  for (const cat of categories) {
    const catCmds = cmds.filter(c => c.category === cat.id);
    if (catCmds.length === 0) continue;

    sections.push(
      <div className="search-section" key={`cat-${cat.id}`}>
        <h4 className="search-section-title">{cat.label()}</h4>
        {renderCommandItems(catCmds, selected, onClick)}
      </div>
    );
  }

  return sections.length > 0 ? <div>{sections}</div> : null;
}

function renderCommandItems(cmds, selected, onClick) {
  return cmds.map((cmd) => {
    const isSelected = selected?._isCommand === true && selected?.id === cmd.id;
    const item = { ...cmd, _isCommand: true };
    return (
      <CommandResultItem
        key={cmd.id}
        item={item}
        isSelected={isSelected}
        onClick={() => onClick(item)}
      />
    );
  });
}

// ── Category ordering ──

const CATEGORY_ORDER = getCommandCategories().map(c => c.id);

function sortByCategory(cmds) {
  return cmds.slice().sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.category);
    const ib = CATEGORY_ORDER.indexOf(b.category);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

// ── Item identity comparison ──

function findItemIndex(items, target) {
  if (!target) return -1;
  return items.findIndex(item => isSameItem(item, target));
}

function isSameItem(a, b) {
  if (!a || !b) return false;
  if (a._isCommand && b._isCommand) return a.id === b.id;
  if (a.noteId != null && b.noteId != null) return a.noteId === b.noteId;
  if (a.tagId != null && b.tagId != null) return a.tagId === b.tagId;
  if (a.filename && b.filename) return a.filename === b.filename;
  return false;
}

// ── Sub-components ──

function CommandResultItem({ item, isSelected, onClick }) {
  const IconComponent = item.icon;
  const label = typeof item.label === "function" ? item.label() : (item.label || "");

  return (
    <div className={`search-result-item search-command-item ${isSelected ? "is-selected" : ""}`} onClick={onClick}>
      {IconComponent ? <IconComponent /> : <SearchIcon />}
      <div className="search-result-item-content">
        <p className="title">{label}</p>
        {item.subtitle && <p className="subtitle">{item.subtitle}</p>}
      </div>
      {item.shortcut && <span className="command-shortcut">{item.shortcut}</span>}
    </div>
  );
}

function SearchResultItem({ item, isSelected, onClick }) {
  let icon = <NoteIcon />
  let title = item.title || item.name
  let subtitle = ""

  if (item.tagId) {
    icon = <TagIcon />
    subtitle = "Tag"
  } else if (item.isArchived) {
    icon = <ArchiveIcon />
  } else if (item.isDeleted) {
    icon = <TrashIcon />
  }

  const displayTitle = item.highlightedTitle || title || ""

  let displaySubtitle = subtitle
  if (item.highlightedContent) {
    displaySubtitle = getHighlightedSnippet(item.highlightedContent)
  } else if (item.content) {
    displaySubtitle = item.content
  } else if (item.matchText) {
    // For semantic note results
    displaySubtitle = item.matchText
  }

  return (
    <div className={`search-result-item ${isSelected ? "is-selected" : ""}`} onClick={onClick}>
      {icon}
      <div className="search-result-item-content">
        <p className="title" dangerouslySetInnerHTML={{ __html: displayTitle }}></p>
        <p className="subtitle" dangerouslySetInnerHTML={{ __html: displaySubtitle }}></p>
      </div>
    </div>
  );
}

function SearchResultImages({ items, onClick }) {
  const images = items.map(item => <img src={`/images/${item.filename}`} key={item.filename} alt={item.description} onClick={() => onClick(item)} />)

  return (
    <div className="search-result-images">
      {images}
    </div>
  );
}

function getHighlightedSnippet(highlightedContent) {
  if (!highlightedContent || !highlightedContent.includes('<mark>')) {
    return highlightedContent;
  }

  const maxLength = 100;
  const leftOffset = 10;
  const markStart = highlightedContent.indexOf('<mark>');
  const startPos = Math.max(0, markStart - leftOffset);

  let snippet = highlightedContent.substring(startPos, startPos + maxLength);

  const lastMarkStart = snippet.lastIndexOf('<mark>');
  const lastMarkEnd = snippet.lastIndexOf('</mark>');

  if (lastMarkStart > lastMarkEnd) {
    const remainingContent = highlightedContent.substring(startPos + maxLength);
    const nextMarkEnd = remainingContent.indexOf('</mark>');
    if (nextMarkEnd !== -1) {
      snippet += remainingContent.substring(0, nextMarkEnd + 7);
    }
  }

  if (startPos > 0) {
    snippet = '...' + snippet;
  }
  if (startPos + snippet.length < highlightedContent.length) {
    snippet += '...';
  }

  return snippet;
}
