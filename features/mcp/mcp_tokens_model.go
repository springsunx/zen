package mcp

import (
	"fmt"

	"zen/commons/auth"
	"zen/commons/sqlite"
)

// GetNoteTagIDs returns the tag IDs attached to a note. Write grants are checked per tag.
func GetNoteTagIDs(noteID int) ([]int, error) {
	rows, err := sqlite.DB.Query(
		"SELECT tag_id FROM note_tags WHERE note_id = ?", noteID,
	)
	if err != nil {
		return nil, fmt.Errorf("error fetching note tags: %w", err)
	}
	defer rows.Close()

	tagIDs := []int{}
	for rows.Next() {
		var tagID int
		if err := rows.Scan(&tagID); err != nil {
			return nil, fmt.Errorf("error scanning note tag: %w", err)
		}
		tagIDs = append(tagIDs, tagID)
	}

	return tagIDs, rows.Err()
}

// CanWriteNote reports whether the access grants cover every tag on the note. A note carrying
// a read-only tag stays protected from token writers.
func CanWriteNote(access auth.Access, noteID int) (bool, error) {
	tagIDs, err := GetNoteTagIDs(noteID)
	if err != nil {
		return false, err
	}

	return auth.CanWrite(access, tagIDs), nil
}
