
import { h } from "../../assets/preact.esm.js";
import { useEffect, useState, useCallback, useRef } from "../../assets/preact.esm.js";
import { CloseIcon } from "./Icon.jsx";
import "./GalleryLightbox.css";

export default function GalleryLightbox({ images = [], startIndex = 0, onClose = () => {} }) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(images.length - 1, startIndex || 0)));
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  // Reset zoom/pan when image index changes
  useEffect(() => { setScale(1); setOffset({ x: 0, y: 0 }); setPanning(false); }, [index]);

  const handlePrev = useCallback(() => { if (hasPrev) setIndex(i => i - 1); }, [hasPrev]);
  const handleNext = useCallback(() => { if (hasNext) setIndex(i => i + 1); }, [hasNext]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handlePrev, handleNext, onClose]);

  // Ensure panning stops on mouse up anywhere
  useEffect(() => {
    function onWinUp() { setPanning(false); }
    if (panning) window.addEventListener('mouseup', onWinUp);
    return () => window.removeEventListener('mouseup', onWinUp);
  }, [panning]);

  // Preload neighbors
  useEffect(() => {
    const prev = index - 1; const next = index + 1;
    if (prev >= 0) { const img = new Image(); img.src = images[prev]; }
    if (next < images.length) { const img = new Image(); img.src = images[next]; }
  }, [index, images]);

  function onImageLoad(e) {
    const img = e.target;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }

  function clampOffset(nx, ny) {
    const vw = window.innerWidth; const vh = window.innerHeight;
    if (!natural.w || !natural.h) return { x: 0, y: 0 };
    // Scaled image size relative to viewport-fit base
    const ratio = Math.min(vw / natural.w, vh / natural.h);
    const baseW = natural.w * ratio; const baseH = natural.h * ratio;
    const sw = baseW * scale; const sh = baseH * scale;
    const maxX = Math.max(0, (sw - vw) / 2);
    const maxY = Math.max(0, (sh - vh) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, nx)), y: Math.max(-maxY, Math.min(maxY, ny)) };
  }

  function onWheel(e) {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const factor = dir > 0 ? 1.1 : 0.9;
    const newScale = Math.max(1, Math.min(6, scale * factor));
    if (newScale === scale) return;
    setScale(newScale);
    // Clamp offset after scale change
    setOffset(prev => clampOffset(prev.x, prev.y));
  }

  function onImageDragStart(e) { e.preventDefault(); return false; }

  function onMouseDown(e) {
    if (e.button !== 0 || scale <= 1) return;
    e.preventDefault();
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { ...offset };
  }
  function onMouseMove(e) {
    if (!panning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    const nx = offsetStart.current.x + dx;
    const ny = offsetStart.current.y + dy;
    setOffset(clampOffset(nx, ny));
  }
  function onMouseUp() { setPanning(false); }

  if (!images || images.length === 0) return null;

  const overlayProps = {
    className: "gallery-lightbox-overlay" , role: "dialog", "aria-modal": "true",
    onWheel, onMouseMove, onMouseUp, onMouseLeave: onMouseUp
  };

  return (
    <div {...overlayProps}>
      <div className={"gallery-lightbox-content" + (panning ? ' is-panning' : '')} onMouseDown={onMouseDown}>
        <img className="gallery-lightbox-image" src={images[index]} alt="preview" onLoad={onImageLoad}
          draggable={false} onDragStart={onImageDragStart}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center', cursor: scale>1 ? (panning? 'grabbing':'grab') : 'default' }} />
      </div>
      <button className="gallery-lightbox-close" aria-label="关闭预览" onClick={onClose}>
        <CloseIcon />
      </button>
      <button className="gallery-lightbox-prev" aria-label="上一张图片" onClick={handlePrev} disabled={!hasPrev}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <button className="gallery-lightbox-next" aria-label="下一张图片" onClick={handleNext} disabled={!hasNext}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>
  );
}
