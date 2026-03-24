import { h, useState } from "../../assets/preact.esm.js";
import GalleryLightbox from "../../commons/components/GalleryLightbox.jsx";
import "./ImageGallery.css";

export default function ImageGallery({ images = [] }) {
  const [openIndex, setOpenIndex] = useState(null);
  const urls = images.map(img => `/images/${img.filename}`);

  const items = urls.map((url, index) => (
    <div className="image-gallery-tile" key={index} onClick={() => setOpenIndex(index)}>
      <img src={url} loading="lazy" alt="" />
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
