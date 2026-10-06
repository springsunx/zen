import { h } from "../../assets/preact.esm.js"
import { TableIcon, TablePropertiesIcon, BoldIcon, ItalicIcon, StrikethroughIcon, HighlightIcon, CodeIcon, CodeBlocksIcon, Heading1Icon, Heading2Icon, Heading3Icon, ListIcon, ListOrderedIcon, ListTodoIcon, QuoteIcon, LinkIcon, DescriptionIcon, SeparatorIcon, NeurologyIcon } from '../../commons/components/Icon.jsx';
import { t } from "../../commons/i18n/index.js";

export default function NotesEditorFormattingToolbar({ isEditable, onFormat, onInsertInternalLink, onOpenAI }) {
  if (!isEditable) {
    return null;
  }

  return (
    <div className="formatting-toolbar">
      <div className="formatting-toolbar-group">
        <button type="button" className="formatting-button" onClick={() => onFormat("bold")} title={t('notes.toolbar.bold')}>
          <BoldIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("italic")} title={t('notes.toolbar.italic')}>
          <ItalicIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("strikethrough")} title={t('notes.toolbar.strike')}>
          <StrikethroughIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("highlight")} title={t('notes.toolbar.highlight')}>
          <HighlightIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("code")} title={t('notes.toolbar.inlineCode')}>
          <CodeIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("codeblock")} title={t('notes.toolbar.codeblock')}>
          <CodeBlocksIcon />
        </button>
      </div>

      <div className="formatting-toolbar-group">
        <button type="button" className="formatting-button" onClick={() => onFormat("h1")} title={t('notes.toolbar.h1')}>
          <Heading1Icon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("h2")} title={t('notes.toolbar.h2')}>
          <Heading2Icon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("h3")} title={t('notes.toolbar.h3')}>
          <Heading3Icon />
        </button>
      </div>

      <div className="formatting-toolbar-group">
        <button type="button" className="formatting-button" onClick={() => onFormat("ul")} title={t('notes.toolbar.ul')}>
          <ListIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("ol")} title={t('notes.toolbar.ol')}>
          <ListOrderedIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("todo")} title={t('notes.toolbar.todo')}>
          <ListTodoIcon />
        </button>
      </div>

      <div className="formatting-toolbar-group">
        <button type="button" className="formatting-button" onClick={() => onFormat("quote")} title={t('notes.toolbar.quote')}>
          <QuoteIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("link")} title={t('notes.toolbar.link')}>
          <LinkIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onInsertInternalLink()} title={t('notes.toolbar.internalLink')}>
          <DescriptionIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("hr")} title={t('notes.toolbar.hr')}>
          <SeparatorIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onOpenAI()} title={t('notes.toolbar.ai')}>
          <NeurologyIcon />
        </button>
      </div>
      <div className="formatting-toolbar-group">
        <button type="button" className="formatting-button" onClick={() => onFormat("insertTable")} data-tooltip={t('notes.toolbar.insertTable')}>
          <TableIcon />
        </button>
        <button type="button" className="formatting-button" onClick={() => onFormat("editTable")} data-tooltip={t('notes.toolbar.editTable')}>
          <TablePropertiesIcon />
        </button>
      </div>
    </div>
  );
}
