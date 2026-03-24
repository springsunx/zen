import { h, useState } from "../../assets/preact.esm.js";
import ApiClient from "../../commons/http/ApiClient.js";
import GalleryLightbox from "../../commons/components/GalleryLightbox.jsx";
import "./ImageGallery.css";
import { openModal, closeModal } from "../../commons/components/Modal.jsx";
import ImageDeleteConfirmModal from "./ImageDeleteConfirmModal.jsx";

export default function ImageGallery({ images = [] }) {
  const [itemsState, setItemsState] = useState(images);
  const [openIndex, setOpenIndex] = useState(null);
  const urls = itemsState.map(img => `/images/${img.filename}`);

  async function handleDelete(e, idx) {
    e.stopPropagation();
    const img = itemsState[idx];
    if (!img) return;
    try {
      try {
        await ApiClient.deleteImage(img.filename);
      } catch (err) {
        if (err?.code === "IMAGE_IN_USE" && Array.isArray(err?.referencedBy)) {
          /* modal confirm */(`该图片仍被以下笔记引用：${err.referencedBy.join(', ')}` + "，是否仍要删除？");
          await new Promise((resolve, reject) => {
          function handleCancel() { closeModal(); reject(new Error('cancelled')); }
          async function handleConfirm() {
            try {
              await ApiClient.forceDeleteImage(img.filename);
              closeModal();
              resolve();
            } catch (e) { reject(e); }
          }
          openModal(h(ImageDeleteConfirmModal, { filename: img.filename, noteIds: err.referencedBy, onConfirm: handleConfirm, onCancel: handleCancel }), ' .modal-root');
        });
        } else {
          throw err;
        }
      }
      setItemsState(prev => prev.filter((_, i) => i !== idx));
    } catch (err) {
      if (err && (err.message === 'cancelled' || err.code === 'CANCELLED')) return;
      console.error('Delete image failed:', err);
    }
  }

  const items = itemsState.map((img, index) => (
    <div className="image-gallery-tile" key={img.filename} onClick={() => setOpenIndex(index)}>
      <div className="tile-actions">
        <div className="tile-action" title="删除" aria-label="删除" onClick={(e) => handleDelete(e, index)}>
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 6h18" stroke="white" stroke-width="2"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" stroke="white" stroke-width="2"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" stroke="white" stroke-width="2"/><line x1="10" x2="10" y1="11" y2="17" stroke="white" stroke-width="2"/><line x1="14" x2="14" y1="11" y2="17" stroke="white" stroke-width="2"/></svg>
        </div>
      </div>
      <img src={`/images/${img.filename}`} loading="lazy" alt="" />
    </div>
  ));

  return (
    <div className="image-gallery image-gallery-uniform">
      {items}
      {openIndex !== null && (
        <GalleryLightbox images={urls} startIndex={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </div>
  );
}
