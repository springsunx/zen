package tags

import (
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"unicode"
	"github.com/mozillazg/go-pinyin"
	"zen/commons/sqlite"
)

type Tag struct {
	TagID     int    `json:"tagId"`
	Name      string `json:"name"`
	ParentID  *int   `json:"parentId,omitempty"`
	Color     *string `json:"color,omitempty"`
	SortOrder *int   `json:"sortOrder,omitempty"`
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
			t.sort_order,
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
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.Color, &tag.ParentID, &tag.SortOrder, &tag.NoteCount)
		if err != nil {
			err = fmt.Errorf("error scanning tag: %w", err)
			slog.Error(err.Error())
			return tags, err
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

// matchesPinyin checks if a tag name matches the search query via pinyin.
// Supports full pinyin ("gongzuo" matches "工作") and initials ("gz" matches "工作").
func matchesPinyin(name, query string) bool {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return false
	}

	args := pinyin.NewArgs()
	var fullPinyin strings.Builder
	var initials strings.Builder

	for _, r := range name {
		if unicode.Is(unicode.Han, r) {
			pys := pinyin.Pinyin(string(r), args)
			if len(pys) > 0 && len(pys[0]) > 0 {
				fullPinyin.WriteString(pys[0][0])
				initials.WriteByte(pys[0][0][0])
			}
		} else {
			fullPinyin.WriteRune(unicode.ToLower(r))
			initials.WriteRune(unicode.ToLower(r))
		}
	}

	full := fullPinyin.String()
	init := initials.String()

	return strings.Contains(full, query) || strings.Contains(init, query)
}

// getAllTagsForSearch loads all tags for runtime pinyin matching.
func getAllTagsForSearch() ([]Tag, error) {
	tags := []Tag{}
	rows, err := sqlite.DB.Query("SELECT tag_id, name, color, parent_id, sort_order, 0 FROM tags")
	if err != nil {
		return tags, err
	}
	defer rows.Close()

	for rows.Next() {
		var tag Tag
		if err := rows.Scan(&tag.TagID, &tag.Name, &tag.Color, &tag.ParentID, &tag.SortOrder, &tag.NoteCount); err != nil {
			continue
		}
		tags = append(tags, tag)
	}
	return tags, nil
}

func SearchTags(term string) ([]Tag, error) {
	// Phase 1: SQL LIKE search for Chinese name match
	sqlTags := []Tag{}
	query := `
		SELECT
			t.tag_id,
			t.name,
			t.color,
			t.parent_id,
			t.sort_order,
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
		return sqlTags, err
	}
	defer rows.Close()

	for rows.Next() {
		var tag Tag
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.Color, &tag.ParentID, &tag.SortOrder, &tag.NoteCount)
		if err != nil {
			err = fmt.Errorf("error scanning tag: %w", err)
			slog.Error(err.Error())
			return sqlTags, err
		}
		sqlTags = append(sqlTags, tag)
	}

	// Phase 2: pinyin matching for Chinese tags
	seen := make(map[int]bool)
	for _, t := range sqlTags {
		seen[t.TagID] = true
	}

	allTags, err := getAllTagsForSearch()
	if err == nil {
		for _, t := range allTags {
			if seen[t.TagID] {
				continue
			}
			if matchesPinyin(t.Name, term) {
				sqlTags = append(sqlTags, t)
				seen[t.TagID] = true
			}
		}
	}

	return sqlTags, nil
}

func GetTagsByFocusModeID(focusModeID int) ([]Tag, error) {
	tags := []Tag{}
	query := `
		SELECT
			t.tag_id,
			t.name,
			t.color,
			t.parent_id,
			t.sort_order,
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
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.Color, &tag.ParentID, &tag.SortOrder, &tag.NoteCount)
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

// parentHasNotesSubquery returns an EXISTS subquery that checks whether a tag
// has at least one child tag with notes matching the given status.
func parentHasNotesSubquery(statusCol string) string {
	var condition string
	switch statusCol {
	case "archived":
		condition = "nc.archived_at IS NOT NULL"
	case "deleted":
		condition = "nc.deleted_at IS NOT NULL"
	default:
		condition = "nc.deleted_at IS NULL AND nc.archived_at IS NULL"
	}
	return fmt.Sprintf(`EXISTS (
		SELECT 1 FROM tags child
		JOIN note_tags ntc ON child.tag_id = ntc.tag_id
		JOIN notes nc ON ntc.note_id = nc.note_id AND %s
		WHERE child.parent_id = t.tag_id
	)`, condition)
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
	havingClause := fmt.Sprintf("HAVING COUNT(n.note_id) > 0 OR %s", parentHasNotesSubquery(statusCol))

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
				t.sort_order,
				COUNT(tt.template_id) AS note_count
			FROM
				tags t
			LEFT JOIN
				template_tags tt ON t.tag_id = tt.tag_id
			GROUP BY
				t.tag_id, t.name, t.parent_id, t.sort_order
			HAVING
				COUNT(tt.template_id) > 0 OR EXISTS (
					SELECT 1 FROM tags child
					JOIN template_tags ttc ON child.tag_id = ttc.tag_id
					WHERE child.parent_id = t.tag_id
				)
			ORDER BY
				COALESCE(t.sort_order, 2147483647) ASC,
				note_count DESC
		`
		args = []interface{}{}
	} else {
		// Notes section
		if focusModeID != 0 {
			// Focus mode: include selected tags AND all their descendants
			q = fmt.Sprintf(`
				WITH RECURSIVE focus_tags(id) AS (
					SELECT tag_id FROM focus_mode_tags WHERE focus_mode_id = ?
					UNION ALL
					SELECT t.tag_id FROM tags t
					INNER JOIN focus_tags ft ON t.parent_id = ft.id
				)
				SELECT
					t.tag_id,
					t.name,
					t.color,
					t.parent_id,
					t.sort_order,
					COUNT(n.note_id) AS note_count
				FROM
					tags t
				%s
				WHERE
					t.tag_id IN (SELECT id FROM focus_tags)
				GROUP BY
					t.tag_id, t.name, t.parent_id, t.sort_order
				%s
				ORDER BY
					t.tag_id ASC
			`, joinNote, havingClause)
			args = []interface{}{focusModeID}
		} else {
			q = fmt.Sprintf(`
				SELECT
					t.tag_id,
					t.name,
					t.color,
					t.parent_id,
					t.sort_order,
					COUNT(n.note_id) AS note_count
				FROM
					tags t
				%s
				GROUP BY
					t.tag_id, t.name, t.parent_id, t.sort_order
				%s
				ORDER BY
					COALESCE(t.sort_order, 2147483647) ASC,
					note_count DESC
			`, joinNote, havingClause)
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
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.Color, &tag.ParentID, &tag.SortOrder, &tag.NoteCount)
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
	roots := []Tag{}
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
	err := q.QueryRow("SELECT tag_id FROM tags WHERE LOWER(name) = LOWER(?)", name).Scan(&tagID)
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
		// No hierarchy — find existing or create
		var existingID int
		err := q.QueryRow("SELECT tag_id FROM tags WHERE LOWER(name) = LOWER(?)", name).Scan(&existingID)
		if err == nil {
			return existingID, name, nil
		}

		// Not found, create
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

	// Check if leaf already exists (case-insensitive, regardless of parent)
	var existingLeafID int
	err := q.QueryRow("SELECT tag_id FROM tags WHERE LOWER(name) = LOWER(?)", leafName).Scan(&existingLeafID)
	if err == nil {
		return existingLeafID, leafName, nil
	}

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

// CleanupUnusedTags deletes tags that are not referenced by any note, template,
// or focus mode, and are not parent tags (have no children).
func CleanupUnusedTags() (int, error) {
	tx, err := sqlite.DB.Begin()
	if err != nil {
		return 0, fmt.Errorf("error starting transaction: %w", err)
	}
	defer tx.Rollback()

	rows, err := tx.Query(`
		SELECT t.tag_id FROM tags t
		WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = t.tag_id)
		  AND NOT EXISTS (SELECT 1 FROM template_tags tt WHERE tt.tag_id = t.tag_id)
		  AND NOT EXISTS (SELECT 1 FROM focus_mode_tags ft WHERE ft.tag_id = t.tag_id)
		  AND NOT EXISTS (SELECT 1 FROM tags child WHERE child.parent_id = t.tag_id)
	`)
	if err != nil {
		return 0, fmt.Errorf("error finding unused tags: %w", err)
	}
	defer rows.Close()

	var tagIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			slog.Error("error scanning unused tag id", "error", err)
			continue
		}
		tagIDs = append(tagIDs, id)
	}

	if len(tagIDs) == 0 {
		return 0, nil
	}

	for _, id := range tagIDs {
		if _, err := tx.Exec("DELETE FROM tags WHERE tag_id = ?", id); err != nil {
			slog.Error("error deleting unused tag", "tag_id", id, "error", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("error committing cleanup: %w", err)
	}

	slog.Info("unused tags cleaned up", "count", len(tagIDs))
	return len(tagIDs), nil
}