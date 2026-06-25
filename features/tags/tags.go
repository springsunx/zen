package tags

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"zen/commons/utils"
)

func HandleGetTags(w http.ResponseWriter, r *http.Request) {
	var tags []Tag
	var err error

	query := r.URL.Query().Get("query")
	focusModeIDStr := r.URL.Query().Get("focusId")
	isArchived := r.URL.Query().Get("isArchived") == "true"
	isDeleted := r.URL.Query().Get("isDeleted") == "true"
	section := r.URL.Query().Get("section")
	if section != "templates" {
		section = "notes"
	}

	focusModeID := 0
	if focusModeIDStr != "" {
		focusModeID, err = strconv.Atoi(focusModeIDStr)
		if err != nil {
			utils.SendErrorResponse(w, "INVALID_FOCUS_ID", "Invalid focus mode ID", err, http.StatusBadRequest)
			return
		}
	}

	if section == "templates" {
		tags, err = GetFilteredTags(focusModeID, isArchived, isDeleted, section, query)
	} else if query != "" {
		tags, err = SearchTags(query)
	} else {
		tags, err = GetFilteredTags(focusModeID, isArchived, isDeleted, "notes", "")
	}

	if err != nil {
		utils.SendErrorResponse(w, "TAGS_FETCH_FAILED", "Error fetching tags.", err, http.StatusInternalServerError)
		return
	}

	untaggedCount, err := GetUntaggedCount(isArchived, isDeleted, section)
	if err != nil {
		slog.Error("error fetching untagged count", "error", err)
	}

	// Build tree structure for non-search queries
	var responseTags []Tag
	if query == "" {
		// Promote orphaned child tags to root when their parent is not in the result set
		tagIDs := make(map[int]bool)
		for _, t := range tags {
			tagIDs[t.TagID] = true
		}
		for i := range tags {
			if tags[i].ParentID != nil && !tagIDs[*tags[i].ParentID] {
				tags[i].ParentID = nil
			}
		}
		responseTags = BuildTagTree(tags)
	} else {
		responseTags = tags
	}

	response := TagsResponse{
		Tags:          responseTags,
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

func HandleMoveTag(w http.ResponseWriter, r *http.Request) {
	tagIDStr := r.PathValue("tagId")
	tagID, err := strconv.Atoi(tagIDStr)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_TAG_ID", "Invalid tag ID", err, http.StatusBadRequest)
		return
	}

	var payload struct {
		ParentID   *int   `json:"parentId"`
		ParentName string `json:"parentName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data", err, http.StatusBadRequest)
		return
	}

	parentID, err := MoveTag(tagID, payload.ParentID, payload.ParentName)
	if err != nil {
		utils.SendErrorResponse(w, "TAG_MOVE_FAILED", "Error moving tag.", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		ParentID int `json:"parentId"`
	}{ParentID: parentID})
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