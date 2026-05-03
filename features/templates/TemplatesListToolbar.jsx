import { h } from "../../assets/preact.esm.js"
import { NewIcon } from '../../commons/components/Icon.jsx';
import "./TemplatesListToolbar.css";
import { t } from "../../commons/i18n/index.js";

export default function TemplatesListToolbar({ onNewTemplateClick }) {
  return (
    <div className="templates-list-toolbar">
      <div className="templates-list-toolbar-left">
        <div onClick={onNewTemplateClick} title={t('templates.newTemplate')}>
          <NewIcon />
        </div>
      </div>
    </div>
  );
}