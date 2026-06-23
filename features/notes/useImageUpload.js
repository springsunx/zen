import { useState, useRef } from "../../assets/preact.esm.js";
import ApiClient from "../../commons/http/ApiClient.js";

function useImageUpload({ insertAtCursor }) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  function uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    ApiClient.uploadImage(formData)
      .then(result => {
        const imageUrl = `![](/images/${result.filename})`;
        insertAtCursor(imageUrl);
      });
  }

  function uploadAttachment(file) {
    const formData = new FormData();
    formData.append('file', file);
    ApiClient.uploadAttachment(formData)
      .then(result => {
        const link = `[${result.originalName}](/attachments/${result.filename})`;
        insertAtCursor(link);
      });
  }

  function processFiles(files) {
    for (let file of files) {
      if (file.type.startsWith('image/')) {
        setAttachments((prev) => [...prev, { file, type: 'image' }]);
        uploadImage(file);
      } else {
        setAttachments((prev) => [...prev, { file, type: 'attachment' }]);
        uploadAttachment(file);
      }
    }
  }

  function handlePaste(e) {
    const items = e.clipboardData.items;

    // Check if there are any files (images or other)
    const hasFiles = Array.from(items).some(item => item.kind === 'file');
    if (!hasFiles) return;

    e.preventDefault();
    for (let item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          if (file.type.startsWith('image/')) {
            setAttachments((prev) => [...prev, { file, type: 'image' }]);
            uploadImage(file);
          } else {
            setAttachments((prev) => [...prev, { file, type: 'attachment' }]);
            uploadAttachment(file);
          }
        }
      }
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDraggingOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setIsDraggingOver(false);
  }

  function handleImageDrop(e) {
    e.preventDefault();
    setIsDraggingOver(false);

    const files = e.dataTransfer.files;
    processFiles(files);
  }

  function handleDropzoneClick() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e) {
    const files = e.target.files;
    if (files) {
      processFiles(files);
      e.target.value = '';
    }
  }

  function resetAttachments() {
    setAttachments([]);
  }

  return {
    isDraggingOver,
    attachments,
    fileInputRef,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleImageDrop,
    handleDropzoneClick,
    handleFileInputChange,
    resetAttachments
  };
}

export default useImageUpload;
