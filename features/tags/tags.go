package tags

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"zen/commons/auth"
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
		tags, err = GetFilteredTags(focusModeID, isArchived, isDeleted, section, "")
	} else if query != "" {
		// Name match plus pinyin matching live in SearchTags; GetFilteredTags only
		// narrows by focus mode and note status, so it cannot serve a text query.
		tags, err = SearchTags(auth.GetAccess(r.Context()), query)
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

	defaultColor := DefaultTagColor
	if tag.Color == nil || *tag.Color == "" {
		tag.Color = &defaultColor
	}

	if code, message, err := isValid(tag); err != nil {
		utils.SendErrorResponse(w, code, message, err, http.StatusBadRequest)
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
	var payload struct {
		Order []int `json:"order"`
	}
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

func isValid(tag Tag) (string, string, error) {
	// The set spans the upstream picker and the wider fork palette so renaming or
	// re-colouring an existing tag never fails validation.
	validTagColors := map[string]bool{
		"gray":   true,
		"red":    true,
		"orange": true,
		"amber":  true,
		"yellow": true,
		"lime":   true,
		"green":  true,
		"teal":   true,
		"cyan":   true,
		"blue":   true,
		"indigo": true,
		"purple": true,
		"pink":   true,
		"rose":   true,
	}

	if strings.TrimSpace(tag.Name) == "" {
		return "INVALID_TAG_NAME", "Tag name cannot be empty", errors.New("tag name cannot be empty")
	}

	if tag.Color == nil || !validTagColors[*tag.Color] {
		return "INVALID_TAG_COLOR", "Invalid tag color", fmt.Errorf("invalid tag color: %v", tag.Color)
	}

	return "", "", nil
}
