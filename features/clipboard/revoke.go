package clipboard

import (
	"net/http"
	"strconv"
	"strings"
	"zen/commons/sqlite"
	"zen/commons/utils"
)

// HandleRevoke deletes a clipboard message and its associated file (if any).
func HandleRevoke(w http.ResponseWriter, r *http.Request) {
	// Extract ID from URL: /api/clipboard/revoke/{id}/
	path := strings.TrimPrefix(r.URL.Path, "/api/clipboard/revoke/")
	path = strings.TrimSuffix(path, "/")
	id, err := strconv.ParseInt(path, 10, 64)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_ID", "Invalid message ID.", err, http.StatusBadRequest)
		return
	}

	// Fetch the message first to get the filename (if file type)
	msg, err := getMessageByID(id)
	if err != nil {
		utils.SendErrorResponse(w, "NOT_FOUND", "Message not found.", err, http.StatusNotFound)
		return
	}

	// Delete the database record
	_, err = sqlite.DB.Exec("DELETE FROM clipboard_messages WHERE id = ?", id)
	if err != nil {
		utils.SendErrorResponse(w, "DELETE_FAILED", "Error deleting message.", err, http.StatusInternalServerError)
		return
	}

	// If it's a file, also delete from storage
	if msg.Type == "file" && msg.Filename != "" {
		provider := fileProvider(msg.Filename)
		if delErr := provider.Delete(msg.Filename); delErr != nil {
			// Log but don't fail — the DB record is already gone
			_ = delErr
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleDeleteBatchText deletes text-type messages in a batch and clears
// the content field from file messages (text is stored in file content when
// sending text + files together).
// DELETE /api/clipboard/batch/{batch_id}/text/
func HandleDeleteBatchText(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/clipboard/batch/")
	path = strings.TrimSuffix(path, "/")
	path = strings.TrimSuffix(path, "/text")
	batchID := path
	if batchID == "" {
		utils.SendErrorResponse(w, "INVALID_BATCH_ID", "Invalid batch ID.", nil, http.StatusBadRequest)
		return
	}

	// Delete standalone text messages
	textResult, err := sqlite.DB.Exec(
		"DELETE FROM clipboard_messages WHERE batch_id = ? AND type = 'text'",
		batchID,
	)
	if err != nil {
		utils.SendErrorResponse(w, "DELETE_FAILED", "Error deleting text messages.", err, http.StatusInternalServerError)
		return
	}
	textDeleted, _ := textResult.RowsAffected()

	// Clear content field from file messages (text+file combined messages)
	fileResult, err := sqlite.DB.Exec(
		"UPDATE clipboard_messages SET content = '' WHERE batch_id = ? AND type = 'file' AND content != ''",
		batchID,
	)
	if err != nil {
		utils.SendErrorResponse(w, "UPDATE_FAILED", "Error clearing file message content.", err, http.StatusInternalServerError)
		return
	}
	contentCleared, _ := fileResult.RowsAffected()

	if textDeleted == 0 && contentCleared == 0 {
		utils.SendErrorResponse(w, "NOT_FOUND", "No text content found in batch.", nil, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleRevokeBatch deletes all messages in a batch and their associated files.
// DELETE /api/clipboard/batch/{batch_id}/
func HandleRevokeBatch(w http.ResponseWriter, r *http.Request) {
	// Extract batch_id from URL: /api/clipboard/batch/{batch_id}/
	path := strings.TrimPrefix(r.URL.Path, "/api/clipboard/batch/")
	path = strings.TrimSuffix(path, "/")
	batchID := path
	if batchID == "" {
		utils.SendErrorResponse(w, "INVALID_BATCH_ID", "Invalid batch ID.", nil, http.StatusBadRequest)
		return
	}

	// Find all file-type messages in this batch to clean up storage
	rows, err := sqlite.DB.Query(
		"SELECT filename FROM clipboard_messages WHERE batch_id = ? AND type = 'file' AND filename != ''",
		batchID,
	)
	if err != nil {
		utils.SendErrorResponse(w, "QUERY_FAILED", "Error fetching batch messages.", err, http.StatusInternalServerError)
		return
	}

	var filenames []string
	for rows.Next() {
		var fn string
		if err := rows.Scan(&fn); err == nil {
			filenames = append(filenames, fn)
		}
	}
	rows.Close()

	// Delete all files from storage
	for _, fn := range filenames {
		provider := fileProvider(fn)
		_ = provider.Delete(fn)
	}

	// Delete all DB records in the batch
	_, err = sqlite.DB.Exec("DELETE FROM clipboard_messages WHERE batch_id = ?", batchID)
	if err != nil {
		utils.SendErrorResponse(w, "DELETE_FAILED", "Error deleting batch messages.", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
