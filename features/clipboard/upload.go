package clipboard

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"time"
	"zen/commons/sqlite"
	"zen/commons/utils"
)

const MAX_UPLOAD_SIZE = 100 << 20 // 100 MB

// HandleUploadFile receives a file upload and stores it in the clipboard.
func HandleUploadFile(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(MAX_UPLOAD_SIZE)
	if err != nil {
		utils.SendErrorResponse(w, "FILE_TOO_LARGE", "File exceeds maximum size (100MB).", err, http.StatusBadRequest)
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

	// Read optional text content
	textContent := r.FormValue("content")

	// Generate unique filename preserving extension
	ext := filepath.Ext(originalName)
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)

	// Store the file using the appropriate provider (image vs attachment)
	provider := fileProvider(originalName)
	if err := provider.Upload(filename, file, handler.Size, contentType, nil); err != nil {
		utils.SendErrorResponse(w, "UPLOAD_FAILED", "Error uploading file.", err, http.StatusInternalServerError)
		return
	}

	// Insert clipboard record (include content if provided)
	var insertQuery string
	var insertArgs []interface{}
	if textContent != "" {
		insertQuery = `INSERT INTO clipboard_messages (type, content, filename, original_name, content_type, file_size)
			 VALUES ('file', ?, ?, ?, ?, ?)`
		insertArgs = []interface{}{textContent, filename, originalName, contentType, handler.Size}
	} else {
		insertQuery = `INSERT INTO clipboard_messages (type, filename, original_name, content_type, file_size)
			 VALUES ('file', ?, ?, ?, ?)`
		insertArgs = []interface{}{filename, originalName, contentType, handler.Size}
	}

	result, err := sqlite.DB.Exec(insertQuery, insertArgs...)
	if err != nil {
		// Clean up the file on DB error
		_ = provider.Delete(filename)
		utils.SendErrorResponse(w, "INSERT_FAILED", "Error saving file record.", err, http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()

	msg, err := getMessageByID(id)
	if err != nil {
		utils.SendErrorResponse(w, "FETCH_FAILED", "Error retrieving saved message.", fmt.Errorf("getMessageByID(%d): %w", id, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}
