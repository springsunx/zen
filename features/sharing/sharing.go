package sharing

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"zen/commons/utils"
	"zen/features/notes"
)

func HandleCreateShare(w http.ResponseWriter, r *http.Request) {
	noteIDStr := r.PathValue("noteId")
	noteID, err := strconv.Atoi(noteIDStr)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_NOTE_ID", "Invalid note ID", err, http.StatusBadRequest)
		return
	}

	var req ShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req = ShareRequest{}
	}

	share, err := CreateShare(noteID, req.ExpiresInHours)
	if err != nil {
		utils.SendErrorResponse(w, "SHARE_CREATE_FAILED", "Failed to create share", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(share)
}

func HandleGetShares(w http.ResponseWriter, r *http.Request) {
	noteIDStr := r.PathValue("noteId")
	noteID, err := strconv.Atoi(noteIDStr)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_NOTE_ID", "Invalid note ID", err, http.StatusBadRequest)
		return
	}

	shares, err := GetSharesByNoteID(noteID)
	if err != nil {
		utils.SendErrorResponse(w, "SHARES_READ_FAILED", "Failed to fetch shares", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(shares)
}

func HandleDeleteShare(w http.ResponseWriter, r *http.Request) {
	shareIDStr := r.PathValue("shareId")
	shareID, err := strconv.Atoi(shareIDStr)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_SHARE_ID", "Invalid share ID", err, http.StatusBadRequest)
		return
	}

	if err := DeleteShare(shareID); err != nil {
		utils.SendErrorResponse(w, "SHARE_DELETE_FAILED", "Failed to delete share", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func HandleGetSharedNote(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		utils.SendErrorResponse(w, "MISSING_TOKEN", "Missing share token", nil, http.StatusBadRequest)
		return
	}

	share, err := GetShareByToken(token)
	if err != nil {
		utils.SendErrorResponse(w, "SHARE_READ_FAILED", "Failed to read share", err, http.StatusInternalServerError)
		return
	}
	if share == nil {
		utils.SendErrorResponse(w, "SHARE_NOT_FOUND", "Share not found or expired", nil, http.StatusNotFound)
		return
	}

	note, err := notes.GetNoteByID(share.NoteID)
	if err != nil {
		utils.SendErrorResponse(w, "NOTE_READ_FAILED", "Failed to read note", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(note)
}

func HandleSharedNotePage(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		http.NotFound(w, r)
		return
	}

	share, err := GetShareByToken(token)
	if err != nil || share == nil {
		slog.Error("share not found for page", "token", token, "error", err)
		http.NotFound(w, r)
		return
	}

	renderSharedNotePage(w)
}
