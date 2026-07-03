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
