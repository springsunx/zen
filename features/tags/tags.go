package tags

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"zen/commons/utils"
)

type Tag struct {
	TagID     int    `json:"tagId"`
	Name      string `json:"name"`
	NoteCount int    `json:"noteCount"`
}

type TagsResponse struct {
	Tags          []Tag `json:"tags"`
	UntaggedCount int   `json:"untaggedCount"`
}

func HandleGetTags(w http.ResponseWriter, r *http.Request) {
	var tags []Tag
	var err error

	query := r.URL.Query().Get("query")
	focusModeIDStr := r.URL.Query().Get("focusId")

	focusModeID := 0
	if focusModeIDStr != "" {
		focusModeID, err = strconv.Atoi(focusModeIDStr)
		if err != nil {
			utils.SendErrorResponse(w, "INVALID_FOCUS_ID", "Invalid focus mode ID", err, http.StatusBadRequest)
			return
		}
	}

	if focusModeID != 0 {
		tags, err = GetTagsByFocusModeID(focusModeID)
	} else if query != "" {
		tags, err = SearchTags(query)
	} else {
		tags, err = GetAllTags()
	}

	if err != nil {
		utils.SendErrorResponse(w, "TAGS_FETCH_FAILED", "Error fetching tags.", err, http.StatusInternalServerError)
		return
	}

	untaggedCount, err := GetUntaggedCount()
	if err != nil {
		slog.Error("error fetching untagged count", "error", err)
	}

	response := TagsResponse{
		Tags:          tags,
		UntaggedCount: untaggedCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func HandleUpdateTag(w http.ResponseWriter, r *http.Request) {
	var tag Tag
	if err := json.NewDecoder(r.Body).Decode(&tag); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data", err, http.StatusBadRequest)
		return
	}

	if err := UpdateTag(tag); err != nil {
		utils.SendErrorResponse(w, "TAG_UPDATE_FAILED", "Error updating tag.", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func HandleDeleteTag(w http.ResponseWriter, r *http.Request) {
	tagIDStr := r.PathValue("tagId")
	tagID, err := strconv.Atoi(tagIDStr)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_TAG_ID", "Invalid tag ID", err, http.StatusBadRequest)
		return
	}

	if err := DeleteTag(tagID); err != nil {
		utils.SendErrorResponse(w, "TAG_DELETE_FAILED", "Error deleting tag.", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}


func HandleReorderTags(w http.ResponseWriter, r *http.Request) {
    var payload struct{ Order []int `json:"order"` }
    if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
        utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data", err, http.StatusBadRequest)
        return
    }
    if err := UpdateTagOrder(payload.Order); err != nil {
        utils.SendErrorResponse(w, "TAG_REORDER_FAILED", "Error reordering tags.", err, http.StatusInternalServerError)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}
