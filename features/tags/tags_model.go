package tags

import (
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"zen/commons/sqlite"
)

type Tag struct {
	TagID     int    `json:"tagId"`
	Name      string `json:"name"`
	ParentID  *int   `json:"parentId,omitempty"`
	Color     *string `json:"color,omitempty"`
	NoteCount int    `json:"noteCount"`
	Children  []Tag  `json:"children,omitempty"`
}

type TagsResponse struct {
	Tags          []Tag `json:"tags"`
	UntaggedCount int   `json:"untaggedCount"`
}

func GetAllTags() ([]Tag, error) {
	tags := []Tag{}
	query := `
		SELECT
			t.tag_id,
			t.name,
			t.color,
			t.parent_id,
			COUNT(nt.note_id) AS note_count
		FROM
			tags t
		LEFT JOIN
			note_tags nt ON t.tag_id = nt.tag_id
		GROUP BY
			t.tag_id, t.name, t.parent_id, t.sort_order
		ORDER BY
			COALESCE(t.sort_order, 2147483647) ASC,
			note_count DESC
	`

	rows, err := sqlite.DB.Query(query)
	if err != nil {
		err = fmt.Errorf("error retrieving tags: %w", err)
		slog.Error(err.Error())
		return tags, err
	}
	defer rows.Close()

	for rows.Next() {
		var tag Tag
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.Color, &tag.ParentID, &tag.NoteCount)
		if err != nil {
			err = fmt.Errorf("error scanning tag: %w", err)
			slog.Error(err.Error())
			return tags, err
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

func SearchTags(term string) ([]Tag, error) {
	tags := []Tag{}
	query := `
		SELECT
			t.tag_id,
			t.name,
			t.color,
			t.parent_id,
			COUNT(nt.note_id) AS note_count
		FROM
			tags t
		LEFT JOIN
			note_tags nt ON t.tag_id = nt.tag_id
		WHERE
			t.name LIKE '%' || ? || '%'
		GROUP BY
			t.tag_id, t.name, t.parent_id, t.sort_order
		ORDER BY 
			-- Boosting rows starting with the search term
			CASE
				WHEN t.name LIKE ? || '%' THEN 1
				ELSE 2
			END,
			-- Boosting rows with more notes
			note_count DESC
	`

	rows, err := sqlite.DB.Query(query, term, term)
	if err != nil {
		err = fmt.Errorf("error retrieving tags: %w", err)
		slog.Error(err.Error())
		return tags, err
	}
	defer rows.Close()

	for rows.Next() {
		var tag Tag
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.Color, &tag.ParentID, &tag.NoteCount)
		if err != nil {
			err = fmt.Errorf("error scanning tag: %w", err)
			slog.Error(err.Error())
			return tags, err
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

func GetTagsByFocusModeID(focusModeID int) ([]Tag, error) {
	tags := []Tag{}
	query := `
		SELECT
			t.tag_id,
			t.name,
			t.color,
			t.parent_id,
			COUNT(nt.note_id) AS note_count
		FROM
			tags t
		LEFT JOIN
			note_tags nt ON t.tag_id = nt.tag_id
		JOIN
			focus_mode_tags f ON t.tag_id = f.tag_id
		WHERE
			f.focus_mode_id = ?
		GROUP BY
			t.tag_id, t.name, t.parent_id, t.sort_order
		ORDER BY
			t.tag_id ASC
	`

	rows, err := sqlite.DB.Query(query, focusModeID)
	if err != nil {
		err = fmt.Errorf("error retrieving tags: %w", err)
		slog.Error(err.Error())
		return tags, err
	}
	defer rows.Close()

	for rows.Next() {
		var tag Tag
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.Color, &tag.ParentID, &tag.NoteCount)
		if err != nil {
			err = fmt.Errorf("error scanning tag: %w", err)
			slog.Error(err.Error())
			return tags, err
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

func statusJoin(statusCol string) string {
	if statusCol == "archived" {
		return "LEFT JOIN note_tags nt ON t.tag_id = nt.tag_id LEFT JOIN notes n ON nt.note_id = n.note_id AND n.archived_at IS NOT NULL"
	} else if statusCol == "deleted" {
		return "LEFT JOIN note_tags nt ON t.tag_id = nt.tag_id LEFT JOIN notes n ON nt.note_id = n.note_id AND n.deleted_at IS NOT NULL"
	}
	return "LEFT JOIN note_tags nt ON t.tag_id = nt.tag_id LEFT JOIN notes n ON nt.note_id = n.note_id AND n.deleted_at IS NULL AND n.archived_at IS NULL"
}

// GetFilteredTags returns tags filtered by focus mode, status, and section.
func GetFilteredTags(focusModeID int, isArchived, isDeleted bool, section string, query string) ([]Tag, error) {
	tags := []Tag{}

	var statusCol string
	if isDeleted {
		statusCol = "deleted"
	} else if isArchived {
		statusCol = "archived"
	} else {
		statusCol = "active"
	}

	joinNote := statusJoin(statusCol)

	var q string
	var args []interface{}

	if section == "templates" {
		// Templates use template_tags, no archive/trash status
		q = `
			SELECT
				t.tag_id,
				t.name,
				t.color,
				t.parent_id,
				COUNT(tt.template_id) AS note_count
			FROM
				tags t
			LEFT JOIN
				template_tags tt ON t.tag_id = tt.tag_id
			GROUP BY
				t.tag_id, t.name, t.parent_id, t.sort_order
			HAVING
				COUNT(tt.template_id) > 0
			ORDER BY
				COALESCE(t.sort_order, 2147483647) ASC,
				note_count DESC
		`
		args = []interface{}{}
	} else {
		// Notes section
		if focusModeID != 0 {
			// Focus mode: only count notes that belong to the focus mode
			q = fmt.Sprintf(`
				SELECT
					t.tag_id,
					t.name,
					t.color,
					t.parent_id,
					COUNT(n.note_id) AS note_count
				FROM
					tags t
				%s
				JOIN
					focus_mode_tags f ON t.tag_id = f.tag_id
				WHERE
					f.focus_mode_id = ?
				GROUP BY
					t.tag_id, t.name, t.parent_id, t.sort_order
				ORDER BY
					t.tag_id ASC
			`, joinNote)
			args = []interface{}{focusModeID}
		} else {
			q = fmt.Sprintf(`
				SELECT
					t.tag_id,
					t.name,
					t.color,
					t.parent_id,
					COUNT(n.note_id) AS note_count
				FROM
					tags t
				%s
				GROUP BY
					t.tag_id, t.name, t.parent_id, t.sort_order
				ORDER BY
					COALESCE(t.sort_order, 2147483647) ASC,
					note_count DESC
			`, joinNote)
			args = []interface{}{}
		}
	}

	rows, err := sqlite.DB.Query(q, args...)
	if err != nil {
		err = fmt.Errorf("error retrieving tags: %w", err)
		slog.Error(err.Error())
		return tags, err
	}
	defer rows.Close()

	for rows.Next() {
		var tag Tag
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.Color, &tag.ParentID, &tag.NoteCount)
		if err != nil {
			err = fmt.Errorf("error scanning tag: %w", err)
			slog.Error(err.Error())
			return tags, err
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

// BuildTagTree converts a flat list of tags into a tree structure.
// Root tags (parent_id == nil) are at the top level, children are nested.
func BuildTagTree(tags []Tag) []Tag {
	tagMap := make(map[int]*Tag)

	// First pass: index all tags and reset children
	for i := range tags {
		tagMap[tags[i].TagID] = &tags[i]
		tags[i].Children = nil
	}

	// Second pass: attach children to their parents (deepest first won't work,
	// so we do it in order and then sync)
	for i := range tags {
		if tags[i].ParentID != nil {
			if parent, ok := tagMap[*tags[i].ParentID]; ok {
				parent.Children = append(parent.Children, tags[i])
			}
		}
	}

	// Third pass: sync children from tagMap so nested children are included.
	// After the second pass, tagMap entries have the latest Children, but
	// the copies inside parent.Children may be stale. Re-read from tagMap.
	for i := range tags {
		if len(tagMap[tags[i].TagID].Children) > 0 {
			var synced []Tag
			for _, child := range tagMap[tags[i].TagID].Children {
				synced = append(synced, *tagMap[child.TagID])
			}
			tagMap[tags[i].TagID].Children = synced
		}
	}

	// Fourth pass: collect root tags
	var roots []Tag
	for i := range tags {
		if tags[i].ParentID == nil {
			roots = append(roots, *tagMap[tags[i].TagID])
		}
	}

	return roots
}

// GetAllTagDescendantIDs returns all descendant tag IDs for a given tag (including the tag itself).
func GetAllTagDescendantIDs(tagID int) ([]int, error) {
	query := `
		WITH RECURSIVE descendants(id) AS (
			SELECT tag_id FROM tags WHERE tag_id = ?
			UNION ALL
			SELECT t.tag_id FROM tags t
			INNER JOIN descendants d ON t.parent_id = d.id
		)
		SELECT id FROM descendants
	`
	rows, err := sqlite.DB.Query(query, tagID)
	if err != nil {
		return nil, fmt.Errorf("error fetching descendant tags: %w", err)
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("error scanning descendant id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// querier is satisfied by both *sql.Tx and *sql.DB
type querier interface {
	QueryRow(query string, args ...interface{}) *sql.Row
	Exec(query string, args ...interface{}) (sql.Result, error)
}

// GetOrCreateParentTag finds or creates a parent tag by name.
func GetOrCreateParentTag(name string, q querier) (int, error) {
	var tagID int
	err := q.QueryRow("SELECT tag_id FROM tags WHERE name = ? AND parent_id IS NULL", name).Scan(&tagID)
	if err == nil {
		return tagID, nil
	}

	result, err := q.Exec("INSERT INTO tags (name) VALUES (?)", name)
	if err != nil {
		return 0, fmt.Errorf("error creating parent tag: %w", err)
	}
	lastID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("error getting parent tag id: %w", err)
	}
	return int(lastID), nil
}

// ParseAndCreateTagHierarchy handles tag names with '/' separators.
// For input "work/meeting", it creates "work" parent and returns "meeting" with parent_id set.
func ParseAndCreateTagHierarchy(name string, q querier) (int, string, error) {
	parts := strings.Split(name, "/")
	if len(parts) <= 1 {
		// No hierarchy, just create the tag directly
		result, err := q.Exec("INSERT INTO tags (name) VALUES (?)", name)
		if err != nil {
			return 0, "", fmt.Errorf("error creating tag: %w", err)
		}
		lastID, err := result.LastInsertId()
		if err != nil {
			return 0, "", fmt.Errorf("error getting tag id: %w", err)
		}
		return int(lastID), name, nil
	}

	// Create parent chain
	currentParentID := 0
	for i := 0; i < len(parts)-1; i++ {
		parentName := strings.Join(parts[:i+1], "/")
		var err error
		currentParentID, err = GetOrCreateParentTag(parentName, q)
		if err != nil {
			return 0, "", fmt.Errorf("error creating parent tag '%s': %w", parentName, err)
		}
	}

	// Create leaf tag with parent_id
	leafName := strings.Join(parts, "/") // keep full path as name for display
	result, err := q.Exec("INSERT INTO tags (name, parent_id) VALUES (?, ?)", leafName, currentParentID)
	if err != nil {
		return 0, "", fmt.Errorf("error creating leaf tag: %w", err)
	}
	lastID, err := result.LastInsertId()
	if err != nil {
		return 0, "", fmt.Errorf("error getting leaf tag id: %w", err)
	}
	return int(lastID), leafName, nil
}

func UpdateTag(tag Tag) error {
	query := `
		UPDATE
			tags
		SET
			name = ?,
			color = ?
		WHERE
			tag_id = ?
	`

	_, err := sqlite.DB.Exec(query, tag.Name, tag.Color, tag.TagID)
	if err != nil {
		err = fmt.Errorf("error updating tag: %w", err)
		slog.Error(err.Error())
		return err
	}
	return nil
}

// MoveTag changes the parent of a tag.
// If parentName is non-empty, it finds or creates the parent by name (auto-create).
// If parentName is empty and parentID is nil, the tag becomes a root tag.
// Returns the resolved parent tag ID (0 if set to root).
func MoveTag(tagID int, parentID *int, parentName string) (int, error) {
	var targetParentID *int

	if parentName != "" {
		id, err := GetOrCreateParentTag(parentName, sqlite.DB)
		if err != nil {
			return 0, fmt.Errorf("error finding or creating parent tag: %w", err)
		}
		targetParentID = &id
	} else {
		targetParentID = parentID
	}

	if targetParentID == nil {
		_, err := sqlite.DB.Exec("UPDATE tags SET parent_id = NULL WHERE tag_id = ?", tagID)
		if err != nil {
			return 0, fmt.Errorf("error moving tag: %w", err)
		}
		return 0, nil
	}

	// Prevent circular references
	if tagID == *targetParentID {
		return 0, fmt.Errorf("cannot move tag to itself")
	}
	descendants, err := GetAllTagDescendantIDs(tagID)
	if err != nil {
		return 0, fmt.Errorf("error checking descendants: %w", err)
	}
	for _, id := range descendants {
		if id == *targetParentID {
			return 0, fmt.Errorf("cannot move tag to its own descendant")
		}
	}

	_, err = sqlite.DB.Exec("UPDATE tags SET parent_id = ? WHERE tag_id = ?", *targetParentID, tagID)
	if err != nil {
		return 0, fmt.Errorf("error moving tag: %w", err)
	}
	return *targetParentID, nil
}

func DeleteTag(tagID int) error {
	tx, err := sqlite.DB.Begin()
	if err != nil {
		err = fmt.Errorf("error starting transaction: %w", err)
		slog.Error(err.Error())
		return err
	}
	defer tx.Rollback()

	// Look up the deleted tag's parent so children inherit it
	var parentID sql.NullInt64
	err = tx.QueryRow("SELECT parent_id FROM tags WHERE tag_id = ?", tagID).Scan(&parentID)
	if err != nil {
		err = fmt.Errorf("error looking up tag parent: %w", err)
		slog.Error(err.Error())
		return err
	}

	// Move direct children to the deleted tag's parent (or root if no parent)
	if parentID.Valid {
		_, err = tx.Exec("UPDATE tags SET parent_id = ? WHERE parent_id = ?", parentID.Int64, tagID)
	} else {
		_, err = tx.Exec("UPDATE tags SET parent_id = NULL WHERE parent_id = ?", tagID)
	}
	if err != nil {
		err = fmt.Errorf("error reparenting children: %w", err)
		slog.Error(err.Error())
		return err
	}

	// Delete note_tags for the tag itself
	_, err = tx.Exec("DELETE FROM note_tags WHERE tag_id = ?", tagID)
	if err != nil {
		err = fmt.Errorf("error deleting from note_tags: %w", err)
		slog.Error(err.Error())
		return err
	}

	// Delete the tag itself
	_, err = tx.Exec("DELETE FROM tags WHERE tag_id = ?", tagID)
	if err != nil {
		err = fmt.Errorf("error deleting tag: %w", err)
		slog.Error(err.Error())
		return err
	}

	err = tx.Commit()
	if err != nil {
		err = fmt.Errorf("error committing transaction: %w", err)
		slog.Error(err.Error())
		return err
	}

	return nil
}


func UpdateTagOrder(tagIDs []int) error {
	tx, err := sqlite.DB.Begin()
	if err != nil {
		return fmt.Errorf("error starting transaction: %w", err)
	}
	defer tx.Rollback()
	for idx, id := range tagIDs {
		_, err := tx.Exec("UPDATE tags SET sort_order = ? WHERE tag_id = ?", idx, id)
		if err != nil {
			return fmt.Errorf("error updating sort order: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("error committing sort order: %w", err)
	}
	return nil
}

func GetUntaggedCount(isArchived, isDeleted bool, section string) (int, error) {
	var count int
	var query string

	if section == "templates" {
		query = `
			SELECT COUNT(*) FROM templates t
			WHERE NOT EXISTS (SELECT 1 FROM template_tags tt WHERE tt.template_id = t.template_id)
		`
	} else if isDeleted {
		query = `
			SELECT COUNT(*) FROM notes n
			WHERE n.deleted_at IS NOT NULL
			AND NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.note_id)
		`
	} else if isArchived {
		query = `
			SELECT COUNT(*) FROM notes n
			WHERE n.archived_at IS NOT NULL
			AND NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.note_id)
		`
	} else {
		query = `
			SELECT COUNT(*) FROM notes n
			WHERE n.deleted_at IS NULL AND n.archived_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.note_id)
		`
	}
	err := sqlite.DB.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("error counting untagged: %w", err)
	}
	return count, nil
}