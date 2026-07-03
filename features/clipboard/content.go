package clipboard

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"zen/commons/sqlite"
	"zen/commons/utils"
)

type clipboardListResponse struct {
	Messages []ClipboardMessage `json:"messages"`
	Total    int                `json:"total"`
}

// HandleListContent returns recent clipboard messages, newest first.
// Supports ?limit=N (default 20, max 50) and ?type=text|file filter.
func HandleListContent(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= CLIPBOARD_LIMIT {
			limit = parsed
		}
	}

	msgType := r.URL.Query().Get("type")

	var total int
	var rowsQuery string
	var countQuery string
	var args []interface{}

	baseQuery := "FROM clipboard_messages"
	if msgType == "text" || msgType == "file" {
		countQuery = "SELECT COUNT(*) " + baseQuery + " WHERE type = ?"
		rowsQuery = "SELECT " + messageColumns + " " + baseQuery + " WHERE type = ? ORDER BY id DESC LIMIT ?"
		args = append(args, msgType, limit)
	} else {
		countQuery = "SELECT COUNT(*) " + baseQuery
		rowsQuery = "SELECT " + messageColumns + " " + baseQuery + " ORDER BY id DESC LIMIT ?"
		args = append(args, limit)
	}

	err := sqlite.DB.QueryRow(countQuery, args[:len(args)-1]...).Scan(&total)
	if err != nil {
		total = 0
	}

	rows, err := sqlite.DB.Query(rowsQuery, args...)
	if err != nil {
		utils.SendErrorResponse(w, "QUERY_FAILED", "Error fetching messages.", err, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	messages := make([]ClipboardMessage, 0)
	for rows.Next() {
		msg, err := scanMessage(rows)
		if err != nil {
			slog.Error("error scanning clipboard message", "error", err)
			continue
		}
		messages = append(messages, msg)
	}

	resp := clipboardListResponse{
		Messages: messages,
		Total:    total,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleLatestContent returns the most recent clipboard message.
func HandleLatestContent(w http.ResponseWriter, r *http.Request) {
	row := sqlite.DB.QueryRow(
		"SELECT " + messageColumns + " FROM clipboard_messages ORDER BY id DESC LIMIT 1",
	)
	msg, err := scanMessage(row)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{}"))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}
