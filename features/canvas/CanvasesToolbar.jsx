import { h } from "../../assets/preact.esm.js"
import { NewIcon } from '../../commons/components/Icon.jsx';
import { t } from "../../commons/i18n/index.js";
import "./CanvasesToolbar.css";

export default function CanvasesToolbar({ onNewCanvasClick }) {
  return (
    <div className="canvases-list-toolbar">
      <div className="canvases-list-toolbar-left">
        <button onClick={onNewCanvasClick} title={t('canvas.newCanvas')}>
          <NewIcon />
        </button>
      </div>
    </div>
  );
}
