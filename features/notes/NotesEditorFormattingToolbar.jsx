import { h } from "../../assets/preact.esm.js"
import { BoldIcon, ItalicIcon, StrikethroughIcon, HighlightIcon, CodeIcon, CodeBlockIcon, Heading1Icon, Heading2Icon, Heading3Icon, ListIcon, ListOrderedIcon, ListTodoIcon, QuoteIcon, LinkIcon, SeparatorIcon } from '../../commons/components/Icon.jsx';
import { t } from "../../commons/i18n/index.js";

export default function NotesEditorFormattingToolbar({ isEditable, onFormat }) {
  if (!isEditable) {
    return null;
  }

  return (
    <div className="formatting-toolbar">
      <div className="formatting-toolbar-group">
        <button type="button" className="formatting-button" onClick={() => onFormat("bold", "bold text")} title={t('notes.toolbar.bold')}>
          <BoldIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("italic", "italic text")} title={t('notes.toolbar.italic')}>
          <ItalicIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("strikethrough", "strikethrough text")} title={t('notes.toolbar.strike')}>
          <StrikethroughIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("highlight", "highlight text")} title={t('notes.toolbar.highlight')}>
          <HighlightIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("code", "code")} title={t('notes.toolbar.inlineCode')}>
          <CodeIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("codeblock")} title={t('notes.toolbar.codeblock')}>
          <CodeBlockIcon />
        </button>
      </div>

      <div className="formatting-toolbar-group">
        <button type="button" className="formatting-button" onClick={() => onFormat("h1", "Heading 1")} title={t('notes.toolbar.h1')}>
          <Heading1Icon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("h2", "Heading 2")} title={t('notes.toolbar.h2')}>
          <Heading2Icon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("h3", "Heading 3")} title={t('notes.toolbar.h3')}>
          <Heading3Icon />
        </button>
      </div>

      <div className="formatting-toolbar-group">
        <button type="button" className="formatting-button" onClick={() => onFormat("ul", "list item")} title={t('notes.toolbar.ul')}>
          <ListIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("ol", "list item")} title={t('notes.toolbar.ol')}>
          <ListOrderedIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("todo", "todo item")} title={t('notes.toolbar.todo')}>
          <ListTodoIcon />
        </button>
      </div>

      <div className="formatting-toolbar-group">
        <button type="button" className="formatting-button" onClick={() => onFormat("quote", "quote text")} title={t('notes.toolbar.quote')}>
          <QuoteIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("link", "link text")} title={t('notes.toolbar.link')}>
          <LinkIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("hr")} title={t('notes.toolbar.hr')}>
          <SeparatorIcon />
        </button>
      </div>
    </div>
  );
}