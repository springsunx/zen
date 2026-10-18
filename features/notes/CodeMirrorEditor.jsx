import { h, useEffect, useRef } from "../../assets/preact.esm.js";
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, placeholder } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { SearchQuery, closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, search, selectMatches, setSearchQuery } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { Strikethrough } from "@lezer/markdown";
import { basicSetup } from "codemirror";

function clampPosition(position, length) {
  return Math.max(0, Math.min(position, length));
}

const markdownHighlightStyle = HighlightStyle.define([
  { tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: "var(--text-primary)", fontWeight: "700" },
  { tag: tags.link, color: "var(--primary-600, #2563eb)", textDecoration: "underline", textDecorationThickness: "1px", textUnderlineOffset: "3px" },
  { tag: tags.url, color: "var(--neutral-600)", textDecoration: "underline", textDecorationThickness: "1px", textUnderlineOffset: "3px" },
  { tag: tags.strong, color: "var(--text-primary)", fontWeight: "700" },
  { tag: tags.emphasis, color: "var(--text-primary)", fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.meta, tags.contentSeparator, tags.processingInstruction], color: "var(--neutral-400)" },
  { tag: tags.quote, color: "var(--neutral-600)", fontStyle: "italic" },
]);

const HEADING_NODE_LEVELS = {
  ATXHeading1: 1,
  SetextHeading1: 1,
  ATXHeading2: 2,
  SetextHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
};

function addLineDecoration(doc, lineNumber, className, decorations, lineDecorationKeys) {
  const line = doc.line(lineNumber);
  const key = `${line.from}:${className}`;
  if (lineDecorationKeys.has(key)) return;
  lineDecorationKeys.add(key);
  decorations.push(Decoration.line({ attributes: { class: className } }).range(line.from));
}

function addLineRangeDecorations(doc, from, to, className, decorations, lineDecorationKeys, lineStarts = null) {
  if (doc.lines === 0) return;
  const firstLine = doc.lineAt(Math.max(0, Math.min(from, doc.length))).number;
  const lastPosition = Math.max(from, to - 1);
  const lastLine = doc.lineAt(Math.max(0, Math.min(lastPosition, doc.length))).number;

  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
    addLineDecoration(doc, lineNumber, className, decorations, lineDecorationKeys);
    lineStarts?.add(doc.line(lineNumber).from);
  }
}

function createMarkdownDisplayDecorations(view) {
  const { doc } = view.state;
  const decorations = [];
  const lineDecorationKeys = new Set();
  const codeLineStarts = new Set();
  const tree = syntaxTree(view.state);

  for (const visibleRange of view.visibleRanges) {
    tree.iterate({
      from: visibleRange.from,
      to: visibleRange.to,
      enter(node) {
        const nodeName = node.type.name;
        const headingLevel = HEADING_NODE_LEVELS[nodeName];

        if (headingLevel) {
          addLineRangeDecorations(doc, node.from, node.to, `cm-md-heading cm-md-heading-${headingLevel}`, decorations, lineDecorationKeys);
          return;
        }

        if (nodeName === "Blockquote" || nodeName === "BlockQuote") {
          addLineRangeDecorations(doc, Math.max(node.from, visibleRange.from), Math.min(node.to, visibleRange.to), "cm-md-blockquote", decorations, lineDecorationKeys);
          return;
        }

        if (nodeName === "FencedCode" || nodeName === "CodeBlock") {
          addLineRangeDecorations(doc, Math.max(node.from, visibleRange.from), Math.min(node.to, visibleRange.to), "cm-md-code-block", decorations, lineDecorationKeys, codeLineStarts);
          return;
        }

        if (nodeName === "Link") {
          const linkMarks = node.node.getChildren("LinkMark");
          if (linkMarks.length >= 2 && linkMarks[0].to <= linkMarks[1].from) {
            decorations.push(Decoration.mark({ class: "cm-md-link-label" }).range(linkMarks[0].to, linkMarks[1].from));
            decorations.push(Decoration.mark({ class: "cm-md-link-destination" }).range(linkMarks[1].from, node.to));
          }
        }

        if (nodeName === "InlineCode") {
          const codeMarks = node.node.getChildren("CodeMark");
          if (codeMarks.length >= 2 && codeMarks[0].to <= codeMarks[1].from) {
            decorations.push(Decoration.mark({ class: "cm-md-inline-code" }).range(codeMarks[0].to, codeMarks[1].from));
          }
        }

        if (nodeName === "Strikethrough") {
          decorations.push(Decoration.mark({ class: "cm-md-strikethrough" }).range(node.from, node.to));
        }
      },
    });

    let line = doc.lineAt(visibleRange.from);
    const lastVisibleLine = doc.lineAt(Math.max(visibleRange.from, visibleRange.to - 1)).number;
    while (line.number <= lastVisibleLine) {
      if (!codeLineStarts.has(line.from)) {
        const prefix = line.text.match(/^\s*(?:>\s*)*/)?.[0] || "";
        const lineContent = line.text.slice(prefix.length);
        const listMatch = lineContent.match(/^([-+*]|\d+[.)])(?=\s)/);
        if (listMatch) {
          const markerFrom = line.from + prefix.length;
          addLineDecoration(doc, line.number, "cm-md-list-line", decorations, lineDecorationKeys);
          decorations.push(Decoration.mark({ class: "cm-md-list-marker" }).range(markerFrom, markerFrom + listMatch[1].length));
        }

        const taskMatch = lineContent.match(/^[-+*]\s+(\[[ xX]\])(?=\s)/);
        if (taskMatch) {
          const markerOffset = lineContent.indexOf(taskMatch[1]);
          const markerFrom = line.from + prefix.length + markerOffset;
          decorations.push(Decoration.mark({ class: "cm-md-task-marker" }).range(markerFrom, markerFrom + taskMatch[1].length));
        }
      }

      if (line.number === doc.lines) break;
      line = doc.line(line.number + 1);
    }
  }

  return Decoration.set(decorations, true);
}

const markdownDisplayPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = createMarkdownDisplayDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = createMarkdownDisplayDecorations(update.view);
    }
  }
}, {
  decorations: plugin => plugin.decorations,
});

const chineseEditorPhrases = EditorState.phrases.of({
  "Go to line": "跳转到行",
  go: "跳转",
  "current match": "当前匹配",
  "on line": "第",
  "replaced match on line $": "已替换第 $ 行的匹配项",
  "replaced $ matches": "已替换 $ 个匹配项",
});

function markdownPairInputHandler(view, from, to, text) {
  if (from !== to || text !== "*") return false;

  const document = view.state.doc;
  const characterBefore = from > 0 ? document.sliceString(from - 1, from) : "";
  const characterAfter = document.sliceString(from, from + 1);

  // When typing at an automatically-added closing mark, advance through it
  // instead of creating a duplicate asterisk.
  if (characterAfter === "*") {
    view.dispatch({ selection: { anchor: from + 1 }, scrollIntoView: true });
    return true;
  }

  // The second '*' turns the pair into Markdown bold delimiters: **|**.
  if (characterBefore === "*") {
    view.dispatch({
      changes: { from: from - 1, to: from, insert: "****" },
      selection: { anchor: from + 1 },
      scrollIntoView: true,
    });
    return true;
  }

  return false;
}

function createChineseSearchPanel(view) {
  let query;
  const dom = document.createElement("div");
  dom.className = "cm-search cm-search-panel";

  function createInput(name, placeholder, isMainField = false) {
    const input = document.createElement("input");
    input.className = "cm-textfield";
    input.name = name;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", placeholder);
    if (isMainField) input.setAttribute("main-field", "true");
    return input;
  }

  function createButton(name, label, onClick) {
    const button = document.createElement("button");
    button.className = "cm-button";
    button.name = name;
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function createOption(input, label) {
    const option = document.createElement("label");
    option.append(input, ` ${label}`);
    return option;
  }

  const searchField = createInput("search", "查找", true);
  const replaceField = createInput("replace", "替换为");
  const caseField = document.createElement("input");
  caseField.type = "checkbox";
  const regexpField = document.createElement("input");
  regexpField.type = "checkbox";
  const wholeWordField = document.createElement("input");
  wholeWordField.type = "checkbox";

  const searchRow = document.createElement("div");
  searchRow.className = "cm-search-row";
  searchRow.append(
    searchField,
    createButton("previous", "上一个", () => findPrevious(view)),
    createButton("next", "下一个", () => findNext(view)),
    createButton("select", "全选", () => selectMatches(view)),
    createButton("dismiss", "关闭", () => closeSearchPanel(view)),
  );

  const optionsRow = document.createElement("div");
  optionsRow.className = "cm-search-options";
  optionsRow.append(
    createOption(caseField, "区分大小写"),
    createOption(regexpField, "正则表达式"),
    createOption(wholeWordField, "全词匹配"),
  );

  const replaceRow = document.createElement("div");
  replaceRow.className = "cm-search-row cm-search-replace-row";
  replaceRow.append(
    replaceField,
    createButton("replace", "替换", () => replaceNext(view)),
    createButton("replaceAll", "全部替换", () => replaceAll(view)),
  );

  dom.append(searchRow, optionsRow, replaceRow);

  function commit() {
    const nextQuery = new SearchQuery({
      search: searchField.value,
      replace: replaceField.value,
      caseSensitive: caseField.checked,
      regexp: regexpField.checked,
      wholeWord: wholeWordField.checked,
    });
    if (!nextQuery.eq(query)) {
      query = nextQuery;
      view.dispatch({ effects: setSearchQuery.of(nextQuery) });
    }
  }

  function setQuery(nextQuery) {
    query = nextQuery;
    searchField.value = nextQuery.search;
    replaceField.value = nextQuery.replace;
    caseField.checked = nextQuery.caseSensitive;
    regexpField.checked = nextQuery.regexp;
    wholeWordField.checked = nextQuery.wholeWord;
  }

  [searchField, replaceField].forEach(field => field.addEventListener("input", commit));
  [caseField, regexpField, wholeWordField].forEach(field => field.addEventListener("change", commit));
  dom.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearchPanel(view);
    } else if (event.key === "Enter" && event.target === searchField) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(view);
    } else if (event.key === "Enter" && event.target === replaceField) {
      event.preventDefault();
      replaceNext(view);
    }
  });

  setQuery(getSearchQuery(view.state));

  return {
    dom,
    top: true,
    mount() {
      searchField.select();
    },
    update(update) {
      const nextQuery = getSearchQuery(update.state);
      if (!nextQuery.eq(query)) setQuery(nextQuery);
    },
  };
}

export default function CodeMirrorEditor({ value, placeholderText, spellcheck, editorRef, onChange, onBlur, onKeyDown, onSelectionChange }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onKeyDownRef = useRef(onKeyDown);
  const onSelectionChangeRef = useRef(onSelectionChange);

  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onKeyDownRef.current = onKeyDown;
  onSelectionChangeRef.current = onSelectionChange;

  function getView() {
    return viewRef.current;
  }

  function setSelection(start, end = start) {
    const view = getView();
    if (view === null) return;
    const length = view.state.doc.length;
    view.dispatch({ selection: { anchor: clampPosition(start, length), head: clampPosition(end, length) } });
  }

  function getEditorApi() {
    return {
      get value() {
        return getView()?.state.doc.toString() || "";
      },
      get selectionStart() {
        return getView()?.state.selection.main.from || 0;
      },
      set selectionStart(position) {
        const view = getView();
        setSelection(position, view?.state.selection.main.to || position);
      },
      get selectionEnd() {
        return getView()?.state.selection.main.to || 0;
      },
      set selectionEnd(position) {
        const view = getView();
        setSelection(view?.state.selection.main.from || position, position);
      },
      focus() {
        getView()?.focus();
      },
      hasFocus() {
        return getView()?.hasFocus || false;
      },
      replaceRange(from, to, text, selectionPosition = from + text.length, options = {}) {
        const view = getView();
        if (view === null) return;
        const { scrollIntoView = true, preserveViewport = false } = options;
        const scrollTop = preserveViewport ? view.scrollDOM.scrollTop : null;
        const scrollLeft = preserveViewport ? view.scrollDOM.scrollLeft : null;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: selectionPosition },
          scrollIntoView,
        });
        if (preserveViewport) {
          requestAnimationFrame(() => {
            const currentView = getView();
            if (currentView === null) return;
            currentView.scrollDOM.scrollTop = scrollTop;
            currentView.scrollDOM.scrollLeft = scrollLeft;
          });
        }
      },
      replaceSelection(text, selectionPosition) {
        const view = getView();
        if (view === null) return;
        const range = view.state.selection.main;
        this.replaceRange(range.from, range.to, text, selectionPosition ?? range.from + text.length);
      },
      getCursorCoords(position) {
        const view = getView();
        if (view === null || hostRef.current === null) return { top: 0, left: 0, bottom: 0, width: 280 };
        const coords = view.coordsAtPos(clampPosition(position, view.state.doc.length));
        const hostRect = hostRef.current.getBoundingClientRect();
        if (coords === null) return { top: 0, left: 0, bottom: 0, width: hostRect.width };
        return {
          top: coords.top - hostRect.top,
          bottom: coords.bottom - hostRect.top,
          left: coords.left - hostRect.left,
          width: hostRect.width,
        };
      },
    };
  }

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          chineseEditorPhrases,
          markdown({ extensions: [Strikethrough] }),
          search({ top: true, createPanel: createChineseSearchPanel }),
          syntaxHighlighting(markdownHighlightStyle),
          markdownDisplayPlugin,
          EditorView.lineWrapping,
          EditorView.inputHandler.of(markdownPairInputHandler),
          placeholder(placeholderText),
          EditorView.updateListener.of(update => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
            if (update.selectionSet) onSelectionChangeRef.current?.();
          }),
          EditorView.domEventHandlers({
            keydown(event) {
              return onKeyDownRef.current?.(event) === true;
            },
            blur() {
              onBlurRef.current?.(getView()?.state.doc.toString() || "");
              return false;
            },
          }),
        ],
      }),
      parent: hostRef.current,
    });

    view.contentDOM.spellcheck = spellcheck === "true";
    viewRef.current = view;
    editorRef.current = getEditorApi();

    return () => {
      if (editorRef.current?.value === view.state.doc.toString()) editorRef.current = null;
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = getView();
    if (view === null) return;
    view.contentDOM.spellcheck = spellcheck === "true";
  }, [spellcheck]);

  useEffect(() => {
    const view = getView();
    if (view === null || value === view.state.doc.toString()) return;
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: {
        anchor: clampPosition(selection.anchor, value.length),
        head: clampPosition(selection.head, value.length),
      },
    });
  }, [value]);

  return <div className="notes-editor-code-mirror" ref={hostRef} />;
}
