import { h, Fragment, useRef, useEffect } from "../../assets/preact.esm.js";
import { t } from "../../commons/i18n/index.js";

export default function ImageDropzone({ isDraggingOver, attachments, fileInputRef, handleImageDrop, handleDragOver, handleDragLeave, handleDropzoneClick, handleFileInputChange }) {
  const objectUrls = useRef([]);

  // Revoke old URLs and create new ones when attachments change
  useEffect(() => {
    objectUrls.current.forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
    objectUrls.current = attachments.map(f => URL.createObjectURL(f));
    return () => {
      objectUrls.current.forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
      objectUrls.current = [];
    };
  }, [attachments]);

  return (
    <>
      <div
        className={`notes-editor-image-dropzone ${isDraggingOver ? "dragover" : ""}`}
        onDrop={handleImageDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleDropzoneClick}>
        {t('notes.editor.imageDropzoneHint')}
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileInputRef}
          onChange={handleFileInputChange}
          style={{ display: "none" }}
        />
      </div>
      <div className="notes-editor-image-attachment-preview">
        {objectUrls.current.map((url, index) => (
          <img src={url} alt={`Attachment ${index}`} />
        ))}
      </div>
    </>
  );
}
