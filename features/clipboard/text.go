package clipboard

import (
	"encoding/json"
	"fmt"
	"net/http"
	"zen/commons/sqlite"
	"zen/commons/utils"
)

type textRequest struct {
	Content string `json:"content"`
}

// HandlePushText receives text content and stores it in the clipboard.
func HandlePushText(w http.ResponseWriter, r *http.Request) {
	var req textRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST", "Invalid JSON body.", err, http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		utils.SendErrorResponse(w, "EMPTY_CONTENT", "Content cannot be empty.", nil, http.StatusBadRequest)
		return
	}

	result, err := sqlite.DB.Exec(
		"INSERT INTO clipboard_messages (type, content) VALUES ('text', ?)",
		req.Content,
	)
	if err != nil {
		utils.SendErrorResponse(w, "INSERT_FAILED", "Error saving text.", err, http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()

	msg, err := getMessageByID(id)
	if err != nil {
		utils.SendErrorResponse(w, "FETCH_FAILED", "Error retrieving saved message.", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}

// getMessageByID fetches a single clipboard message by its ID.
func getMessageByID(id int64) (ClipboardMessage, error) {
	row := sqlite.DB.QueryRow(
		"SELECT "+messageColumns+" FROM clipboard_messages WHERE id = ?", id,
	)
	msg, err := scanMessage(row)
	if err != nil {
		return ClipboardMessage{}, fmt.Errorf("fetch message %d: %w", id, err)
	}
	return msg, nil
}
