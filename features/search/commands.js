import { h } from "../../assets/preact.esm.js"
import {
  NewIcon,
  ArchiveIcon,
  TrashIcon,
  PinIcon,
  ListViewIcon,
  CardViewIcon,
  GalleryViewIcon,
  ThemeIcon,
  NotesIcon,
  TemplatesIcon,
  BoardIcon,
  SettingsIcon,
} from "../../commons/components/Icon.jsx";
import navigateTo from "../../commons/utils/navigateTo.js";
import ThemePreferences from "../../commons/preferences/ThemePreferences.js";
import ApiClient from "../../commons/http/ApiClient.js";
import { openModal, closeModal } from "../../commons/components/Modal.jsx";
import SettingsModal from "../settings/SettingsModal.jsx";
import FocusDetailsModal from "../focus/FocusDetailsModal.jsx";
import { AppProvider, useAppContext } from "../../commons/contexts/AppContext.jsx";
import { t, setLang, getLang } from "../../commons/i18n/index.js";

function getCurrentNoteId() {
  const match = window.location.pathname.match(/^\/notes\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function getStaticCommands() {
  return [
    // ── Actions ──
    {
      id: "new-note",
      label: () => t("command.newNote"),
      icon: NewIcon,
      keywords: ["new", "note", "create", "新建", "笔记", "创建", "xinjian", "biji", "xjbij", "xj"],
      shortcut: "Alt+N",
      category: "actions",
      action() {
        closeModal();
        navigateTo("/notes/new");
      },
    },
    {
      id: "pin-note",
      label: () => t("command.pinNote"),
      icon: PinIcon,
      keywords: ["pin", "置顶", "zhiding", "zd"],
      shortcut: "Alt+T",
      category: "actions",
      action() {
        const noteId = getCurrentNoteId();
        if (noteId) {
          ApiClient.pinNote(noteId).then(() => {
            closeModal();
            window.dispatchEvent(new CustomEvent("notes:refresh"));
          });
        }
      },
    },
    {
      id: "archive-note",
      label: () => t("command.archiveNote"),
      icon: ArchiveIcon,
      keywords: ["archive", "归档", "guidang", "gd"],
      category: "actions",
      action() {
        const noteId = getCurrentNoteId();
        if (noteId) {
          ApiClient.archiveNote(noteId).then(() => {
            closeModal();
            window.dispatchEvent(new CustomEvent("notes:refresh"));
          });
        }
      },
    },
    {
      id: "delete-note",
      label: () => t("command.deleteNote"),
      icon: TrashIcon,
      keywords: ["delete", "trash", "删除", "回收", "shanchu", "huishou", "sc"],
      category: "actions",
      action() {
        const noteId = getCurrentNoteId();
        if (noteId) {
          ApiClient.deleteNote(noteId).then(() => {
            closeModal();
            window.dispatchEvent(new CustomEvent("notes:refresh"));
          });
        }
      },
    },

    // ── Theme ──
    {
      id: "theme-system",
      label: () => t("command.theme.system"),
      icon: ThemeIcon,
      keywords: ["theme", "system", "auto", "主题", "跟随系统", "自动", "zhuti", "genxitong", "zidong", "zt", "gxt"],
      category: "theme",
      action() {
        applyThemeAndClose("system");
      },
    },
    {
      id: "theme-dark",
      label: () => t("command.theme.dark"),
      icon: ThemeIcon,
      keywords: ["theme", "dark", "主题", "深色", "暗色", "zhuti", "shense", "anse", "zt", "ss"],
      category: "theme",
      action() {
        applyThemeAndClose("dark");
      },
    },
    {
      id: "theme-light",
      label: () => t("command.theme.light"),
      icon: ThemeIcon,
      keywords: ["theme", "light", "主题", "浅色", "亮色", "zhuti", "qianse", "liangse", "zt", "qs"],
      category: "theme",
      action() {
        applyThemeAndClose("light");
      },
    },

    // ── View ──
    {
      id: "view-list",
      label: () => t("command.view.list"),
      icon: ListViewIcon,
      keywords: ["view", "list", "视图", "列表", "shitu", "liebiao", "st", "lb"],
      category: "view",
      action() {
        changeViewAndClose("list");
      },
    },
    {
      id: "view-card",
      label: () => t("command.view.card"),
      icon: CardViewIcon,
      keywords: ["view", "card", "视图", "卡片", "shitu", "kapian", "st", "kp"],
      category: "view",
      action() {
        changeViewAndClose("card");
      },
    },
    {
      id: "view-gallery",
      label: () => t("command.view.gallery"),
      icon: GalleryViewIcon,
      keywords: ["view", "gallery", "视图", "图库", "shitu", "tuku", "st", "tk"],
      category: "view",
      action() {
        changeViewAndClose("gallery");
      },
    },

    // ── Navigation ──
    {
      id: "go-notes",
      label: () => t("command.goNotes"),
      icon: NotesIcon,
      keywords: ["notes", "home", "笔记", "首页", "biji", "shouye", "bj", "sy"],
      category: "navigation",
      action() {
        closeModal();
        navigateTo("/notes/");
      },
    },
    {
      id: "go-canvas",
      label: () => t("command.goCanvas"),
      icon: BoardIcon,
      keywords: ["canvas", "board", "画布", "huabu", "hb"],
      category: "navigation",
      action() {
        closeModal();
        navigateTo("/canvases/");
      },
    },
    {
      id: "go-templates",
      label: () => t("command.goTemplates"),
      icon: TemplatesIcon,
      keywords: ["templates", "模板", "muban", "mb"],
      category: "navigation",
      action() {
        closeModal();
        navigateTo("/templates/");
      },
    },
    {
      id: "go-archives",
      label: () => t("command.goArchives"),
      icon: ArchiveIcon,
      keywords: ["archive", "archives", "归档", "guidang", "gd"],
      category: "navigation",
      action() {
        closeModal();
        navigateTo("/notes/?isArchived=true");
      },
    },
    {
      id: "go-trash",
      label: () => t("command.goTrash"),
      icon: TrashIcon,
      keywords: ["trash", "delete", "回收站", "垃圾桶", "huishouzhan", "lajitong", "hsz", "ljt"],
      category: "navigation",
      action() {
        closeModal();
        navigateTo("/notes/?isDeleted=true");
      },
    },
    {
      id: "open-settings",
      label: () => t("command.openSettings"),
      icon: SettingsIcon,
      keywords: ["settings", "preferences", "设置", "偏好", "shezhi", "pianhao", "sz", "ph"],
      category: "navigation",
      action() {
        closeModal();
        openModal(<SettingsModal />);
      },
    },

    // ── Language ──
    {
      id: "lang-auto",
      label: () => t("command.lang.auto"),
      icon: SettingsIcon,
      keywords: ["language", "auto", "语言", "自动", "yuyan", "zidong", "yy", "zd"],
      category: "settings",
      action() {
        closeModal();
        setLang("auto");
      },
    },
    {
      id: "lang-en",
      label: () => t("command.lang.en"),
      icon: SettingsIcon,
      keywords: ["language", "english", "语言", "英文", "yuyan", "yingwen", "yy", "yw"],
      category: "settings",
      action() {
        closeModal();
        setLang("en");
      },
    },
    {
      id: "lang-zh",
      label: () => t("command.lang.zh"),
      icon: SettingsIcon,
      keywords: ["language", "chinese", "中文", "语言", "yuyan", "zhongwen", "yy", "zw"],
      category: "settings",
      action() {
        closeModal();
        setLang("zh-CN");
      },
    },
  ];
}

export function getFocusModeCommands(focusModes) {
  const newFocusCmd = {
    id: "new-focus",
    label: () => t("command.newFocus"),
    icon: NotesIcon,
    keywords: ["new", "focus", "新建", "专注", "xinjian", "zhuanzhu", "xj", "zz"],
    category: "focus",
    action() {
      closeModal();
      openModal(
        <AppProvider>
          <FocusModalWrapper />
        </AppProvider>
      );
    },
  };

  const focusList = (focusModes || []).map(fm => ({
    id: `focus-${fm.focusId}`,
    label: () => fm.focusId === 0 ? t("focus.everything") : fm.name,
    icon: NotesIcon,
    keywords: [fm.name || "", "focus", "专注", "全部", "zhuanzhu", "quanbu", "zz", "qb"],
    category: "focus",
    action() {
      closeModal();
      if (fm.focusId === 0) {
        navigateTo("/notes/");
      } else {
        navigateTo(`/notes/?focusId=${fm.focusId}`);
      }
    },
  }));

  return [newFocusCmd, ...focusList];
}

export async function getTemplateCommands() {
  try {
    const templates = await ApiClient.getTemplates();
    const templateList = Array.isArray(templates) ? templates : [];
    return templateList.map(template => ({
      id: `template-${template.templateId}`,
      label: () => template.name,
      subtitle: template.title || "",
      icon: TemplatesIcon,
      keywords: [template.name, template.title || "", "template", "模板"],
      category: "templates",
      async action() {
        closeModal();
        try {
          const note = await ApiClient.createNote({
            title: template.title || template.name,
            content: template.content || "",
            tags: template.tags || [],
          });
          ApiClient.incrementTemplateUsage(template.templateId).catch(() => {});
          if (note && note.noteId) {
            navigateTo(`/notes/${note.noteId}`);
          }
        } catch (e) {
          console.error("Error creating note from template:", e);
        }
      },
    }));
  } catch (e) {
    console.error("Error loading templates for command palette:", e);
    return [];
  }
}

const CATEGORY_MAP = {
  actions:    { label: () => t("command.category.actions"),    keywords: ["caozuo", "cz", "操作"] },
  theme:      { label: () => t("command.category.theme"),      keywords: ["zhuti", "zt", "主题"] },
  view:       { label: () => t("command.category.view"),       keywords: ["shitu", "st", "视图"] },
  navigation: { label: () => t("command.category.navigation"), keywords: ["daohang", "dh", "导航"] },
  focus:      { label: () => t("command.category.focus"),      keywords: ["zhuanzhu", "moshi", "zz", "ms", "专注", "模式"] },
  settings:   { label: () => t("command.category.settings"),   keywords: ["shezhi", "sz", "设置"] },
};

export function filterCommands(commands, query) {
  if (!query || query.trim() === "") return commands;
  const lowerQuery = query.toLowerCase();
  return commands.filter(cmd => {
    const label = (typeof cmd.label === "function" ? cmd.label() : cmd.label || "").toLowerCase();
    if (label.includes(lowerQuery)) return true;
    if (cmd.subtitle && cmd.subtitle.toLowerCase().includes(lowerQuery)) return true;
    if (cmd.keywords && cmd.keywords.some(kw => kw.toLowerCase().includes(lowerQuery))) return true;
    const cat = CATEGORY_MAP[cmd.category];
    if (cat && cat.keywords.some(kw => kw.toLowerCase().includes(lowerQuery))) return true;
    return false;
  });
}

export function getCommandCategories() {
  return Object.entries(CATEGORY_MAP).map(([id, cat]) => ({ id, label: cat.label }));
}

// ── Helpers ──

function applyThemeAndClose(themeId) {
  closeModal();
  ThemePreferences.setPreference(themeId);
  if (themeId === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", themeId);
  }
  ThemePreferences.applyTheme();
}

function changeViewAndClose(view) {
  closeModal();
  window.dispatchEvent(new CustomEvent("command:changeView", { detail: { view } }));
}

function FocusModalWrapper() {
  const { refreshFocusModes, refreshTags } = useAppContext();
  return <FocusDetailsModal mode="create" refreshFocusModes={refreshFocusModes} refreshTags={refreshTags} />;
}
