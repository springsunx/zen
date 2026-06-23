import { h, Fragment, useRef, useEffect } from "../../assets/preact.esm.js";
import { t } from "../../commons/i18n/index.js";

export default function ImageDropzone({ isDraggingOver, attachments, fileInputRef, handleImageDrop, handleDragOver, handleDragLeave, handleDropzoneClick, handleFileInputChange }) {
  const objectUrls = useRef([]);

  // Revoke old URLs and create new ones when attachments change
  useEffect(() => {
    objectUrls.current.forEach(entry => { try { URL.revokeObjectURL(entry.url); } catch (_) {} });
    objectUrls.current = attachments.map(a => ({ url: URL.createObjectURL(a.file), type: a.type }));
    return () => {
      objectUrls.current.forEach(entry => { try { URL.revokeObjectURL(entry.url); } catch (_) {} });
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
        {t('notes.editor.dropzoneHint')}
        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={handleFileInputChange}
          style={{ display: "none" }}
        />
      </div>
      <div className="notes-editor-image-attachment-preview">
        {objectUrls.current.map((entry, index) => {
          if (entry.type === 'image') {
            return <img key={index} src={entry.url} alt={`Attachment ${index}`} />;
          }
          const name = attachments[index]?.file?.name || 'file';
          return (
            <div key={index} className="attachment-file-chip" title={name}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
              <span>{name}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
