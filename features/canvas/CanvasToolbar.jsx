import { h, useState, useRef, useEffect } from '../../assets/preact.esm.js';
import { BackIcon, TrashIcon, CopyIcon, ZoomInIcon, ZoomOutIcon, SidebarOpenIcon, SidebarCloseIcon, AlignStartHorizontalIcon, AlignStartVerticalIcon, AlignCenterHorizontalIcon, AlignCenterVerticalIcon, AlignEndHorizontalIcon, AlignEndVerticalIcon, HandIcon, MousePointerIcon, StickyNoteIcon } from '../../commons/components/Icon.jsx';
import { t } from "../../commons/i18n/index.js";
import './CanvasToolbar.css';

export default function CanvasToolbar({ onBack, title, onTitleChange, onDelete, onDuplicate, onZoom, zoomLevel, onToggleSidebar, isSidebarOpen, onTogglePanMode, isPanMode, onAlign, hasMultiSelection, onAddStickyNote }) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (isEditingTitle === true && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  function handleTitleClick() {
    setEditTitle(title || '');
    setIsEditingTitle(true);
  }

  function handleTitleBlur() {
    setIsEditingTitle(false);
    const trimmed = editTitle.trim();
    if (trimmed !== '' && trimmed !== title) {
      onTitleChange(trimmed);
    }
  }

  function handleTitleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleInputRef.current.blur();
    } else if (e.key === 'Escape') {
      setEditTitle(title || '');
      setIsEditingTitle(false);
    }
  }

  let titleElement;
  if (isEditingTitle === true) {
    titleElement = (
      <input
        ref={titleInputRef}
        className="canvas-toolbar-title-input"
        value={editTitle}
        onInput={(e) => setEditTitle(e.target.value)}
        onBlur={handleTitleBlur}
        onKeyDown={handleTitleKeyDown}
      />
    );
  } else {
    titleElement = (
      <h1 className="canvas-toolbar-title" onClick={handleTitleClick}>
        {title || t('canvas.untitled')}
      </h1>
    );
  }

  return (
    <div className="canvas-toolbar">
      <div className="canvas-toolbar-left">
        <button className="canvas-toolbar-button" onClick={onBack}>
          <BackIcon />
        </button>
        {titleElement}
      </div>
      <div className="canvas-toolbar-right">
        <button className="canvas-toolbar-button" onClick={onDelete} title={t('common.delete')}>
          <TrashIcon />
        </button>
        <button className="canvas-toolbar-button" onClick={onDuplicate} title={t('canvas.duplicate')}>
          <CopyIcon />
        </button>
        <div className="canvas-toolbar-divider"></div>
        <button className="canvas-toolbar-button" onClick={onAddStickyNote} title={t('canvas.addStickyNote')}>
          <StickyNoteIcon />
        </button>
        <div className="canvas-toolbar-divider"></div>
        <button className={`canvas-toolbar-button ${isPanMode ? 'active' : ''}`} onClick={onTogglePanMode}>
          {isPanMode ? <HandIcon /> : <MousePointerIcon />}
        </button>
        <div className="canvas-toolbar-divider"></div>
        <div className="canvas-toolbar-alignment-group">
          <button className="canvas-toolbar-button" onClick={() => onAlign('left')} disabled={hasMultiSelection !== true} title={t('canvas.alignLeft')}>
            <AlignStartVerticalIcon />
          </button>
          <button className="canvas-toolbar-button" onClick={() => onAlign('top')} disabled={hasMultiSelection !== true} title={t('canvas.alignTop')}>
            <AlignStartHorizontalIcon />
          </button>
          <button className="canvas-toolbar-button" onClick={() => onAlign('bottom')} disabled={hasMultiSelection !== true} title={t('canvas.alignBottom')}>
            <AlignEndHorizontalIcon />
          </button>
          <button className="canvas-toolbar-button" onClick={() => onAlign('right')} disabled={hasMultiSelection !== true} title={t('canvas.alignRight')}>
            <AlignEndVerticalIcon />
          </button>
          <button className="canvas-toolbar-button" onClick={() => onAlign('center-horizontal')} disabled={hasMultiSelection !== true} title={t('canvas.alignCenterH')}>
            <AlignCenterHorizontalIcon />
          </button>
          <button className="canvas-toolbar-button" onClick={() => onAlign('center-vertical')} disabled={hasMultiSelection !== true} title={t('canvas.alignCenterV')}>
            <AlignCenterVerticalIcon />
          </button>
        </div>
        <div className="canvas-toolbar-divider"></div>
        <button className="canvas-toolbar-button" onClick={() => onZoom('in')} title={t('canvas.zoomIn')}>
          <ZoomInIcon />
        </button>
        <button className="canvas-toolbar-button canvas-toolbar-zoom-level" onClick={() => onZoom('reset')} title={t('canvas.zoomReset')}>
          {Math.round(zoomLevel * 100)}%
        </button>
        <button className="canvas-toolbar-button" onClick={() => onZoom('out')} title={t('canvas.zoomOut')}>
          <ZoomOutIcon />
        </button>

        <div className="canvas-toolbar-divider"></div>
        <button className={`canvas-toolbar-button ${isSidebarOpen ? 'active' : ''}`} onClick={onToggleSidebar} title={t('notes.sidebar.toggle')}>
          {isSidebarOpen ? <SidebarCloseIcon /> : <SidebarOpenIcon />}
        </button>
      </div>
    </div>
  );
}