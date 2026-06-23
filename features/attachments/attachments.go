package attachments

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"zen/commons/utils"
	"zen/features/storage"
)

func HandleUploadAttachment(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(50 << 20) // Max 50MB
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_FILE", "Invalid file.", err, http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_FILE", "Invalid file.", err, http.StatusBadRequest)
		return
	}
	defer file.Close()

	originalName := handler.Filename
	contentType := handler.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Generate unique filename preserving extension
	ext := filepath.Ext(originalName)
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)

	provider := storage.GetAttachmentProvider()
	if err := provider.Upload(filename, file, handler.Size, contentType); err != nil {
		utils.SendErrorResponse(w, "ATTACHMENT_UPLOAD_FAILED", "Error uploading attachment.", err, http.StatusInternalServerError)
		return
	}

	// For S3 mode, also save a local copy
	if storage.IsS3Enabled() {
		localPath := filepath.Join("attachments", filename)
		if _, seekErr := file.Seek(0, 0); seekErr == nil {
			if dst, createErr := os.Create(localPath); createErr == nil {
				_, _ = fmt.Fprint(dst, "")
				dst.Close()
			}
		}
	}

	// If noteId is provided, link attachment to note
	if noteIDStr := r.FormValue("noteId"); noteIDStr != "" {
		var noteID int
		if _, scanErr := fmt.Sscanf(noteIDStr, "%d", &noteID); scanErr == nil {
			_ = LinkAttachmentToNote(noteID, filename)
		}
	}

	attachment, err := CreateAttachment(filename, originalName, contentType, handler.Size)
	if err != nil {
		utils.SendErrorResponse(w, "ATTACHMENT_CREATE_FAILED", "Error saving attachment record.", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(attachment)
}

func HandleDeleteAttachment(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	idx := strings.Index(path, "/api/attachments/")
	if idx == -1 {
		utils.SendErrorResponse(w, "INVALID_PATH", "Invalid attachment path.", fmt.Errorf("invalid path"), http.StatusBadRequest)
		return
	}

	remainder := path[idx+len("/api/attachments/"):]
	filename := strings.TrimSuffix(remainder, "/")
	if filename == "" {
		utils.SendErrorResponse(w, "INVALID_FILENAME", "Filename is required.", fmt.Errorf("empty filename"), http.StatusBadRequest)
		return
	}

	provider := storage.GetAttachmentProvider()
	if err := provider.Delete(filename); err != nil {
		utils.SendErrorResponse(w, "ATTACHMENT_DELETE_FAILED", "Error deleting attachment file.", err, http.StatusInternalServerError)
		return
	}

	if err := DeleteAttachment(filename); err != nil {
		utils.SendErrorResponse(w, "ATTACHMENT_DELETE_FAILED", "Error deleting attachment record.", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
