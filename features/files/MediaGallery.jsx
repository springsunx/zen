import { h, Fragment, useMemo, useState } from "../../assets/preact.esm.js";
import GalleryLightbox from "../../commons/components/GalleryLightbox.jsx";
import "./MediaGallery.css";

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|ogv|mov|avi|mkv|m4v)$/i;

export function isVideoAttachment(attachment) {
  return attachment?.contentType?.startsWith("video/") || VIDEO_EXTENSIONS.test(attachment?.originalName || attachment?.filename || "");
}

export function buildMediaItems(images = [], videos = [], thumbnailSize = 160) {
  return [
    ...images.map((image) => ({
      type: "image",
      id: `image-${image.filename}`,
      url: image.url,
      thumbnailUrl: `/images/thumb/${encodeURIComponent(image.filename)}${thumbnailSize > 160 ? `?size=${thumbnailSize}` : ""}`,
      name: image.filename,
      fileSize: image.fileSize,
      createdAt: image.createdAt,
      width: image.width,
      height: image.height,
      linkedNotes: image.linkedNotes,
      storage: image.storage,
      filename: image.filename,
    })),
    ...videos.map((video) => ({
      type: "video",
      id: `video-${video.filename}`,
      url: video.url,
      name: video.originalName || video.filename,
      fileSize: video.fileSize,
      createdAt: video.createdAt,
      linkedNotes: video.linkedNotes,
      storage: video.storage,
      filename: video.filename,
    })),
  ].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
}

export default function MediaGallery({ images = [], videos = [], thumbnailSize = 180 }) {
  const [openIndex, setOpenIndex] = useState(null);
  const media = useMemo(() => buildMediaItems(images, videos, 512), [images, videos]);

  if (media.length === 0) return null;

  return (
    <>
      <div className="media-gallery" style={{ "--media-thumbnail-size": `${thumbnailSize}px` }}>
        {media.map((item, index) => (
          <button type="button" className="media-gallery-card" key={item.id} onClick={() => setOpenIndex(index)} title={item.name}>
            {item.type === "image" ? (
              <img src={item.thumbnailUrl} loading="lazy" decoding="async" alt="" />
            ) : (
              <div className="media-video-placeholder" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
              </div>
            )}
          </button>
        ))}
      </div>
      {openIndex !== null && <GalleryLightbox images={media} startIndex={openIndex} onClose={() => setOpenIndex(null)} />}
    </>
  );
}
