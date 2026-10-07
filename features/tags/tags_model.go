package tags

import (
	"database/sql"
	"fmt"
	"github.com/mozillazg/go-pinyin"
	"log/slog"
	"strings"
	"unicode"
	"zen/commons/auth"
	"zen/commons/sqlite"
)

type Tag struct {
	TagID     int     `json:"tagId"`
	Name      string  `json:"name"`
	ParentID  *int    `json:"parentId,omitempty"`
	Color     *string `json:"color,omitempty"`
	SortOrder *int    `json:"sortOrder,omitempty"`
	NoteCount int     `json:"noteCount"`
	Children  []Tag   `json:"children,omitempty"`
}

const DefaultTagColor = "gray"

type TagsResponse struct {
	Tags          []Tag `json:"tags"`
	UntaggedCount int   `json:"untaggedCount"`
}

func GetAllTags(access auth.Access) ([]Tag, error) {
	tags := []Tag{}
	scopePredicate, scopeArgs := BuildReadableTagsPredicate(access, "t.tag_id")
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
			1 ` + scopePredicate + `
		GROUP BY
			t.tag_id, t.name, t.parent_id, t.sort_order
		ORDER BY
			COALESCE(t.sort_order, 2147483647) ASC,
			note_count DESC
	`

	rows, err := sqlite.DB.Query(query, scopeArgs...)
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

// getAllTagsForSearch loads readable tags for runtime pinyin matching.
func getAllTagsForSearch(access auth.Access) ([]Tag, error) {
	tags := []Tag{}
	scopePredicate, scopeArgs := BuildReadableTagsPredicate(access, "tag_id")
	rows, err := sqlite.DB.Query(`
		SELECT tag_id, name, color, parent_id, sort_order, 0
		FROM tags
		WHERE 1 `+scopePredicate, scopeArgs...)
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

func SearchTags(access auth.Access, term string) ([]Tag, error) {
	// Phase 1: SQL LIKE search for Chinese name match
	sqlTags := []Tag{}
	scopePredicate, scopeArgs := BuildReadableTagsPredicate(access, "t.tag_id")
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
			1 ` + scopePredicate + `
			AND t.name LIKE '%' || ? || '%'
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

	queryArgs := append(append([]interface{}{}, scopeArgs...), term, term)
	rows, err := sqlite.DB.Query(query, queryArgs...)
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

	allTags, err := getAllTagsForSearch(access)
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

func GetTagsByFocusModeID(access auth.Access, focusModeID int) ([]Tag, error) {
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

// parentHasNotesSubquery keeps ancestor tags visible in the sidebar when a
// descendant has matching notes. It affects display only: selecting a tag still
// matches that exact tag and never its descendants.
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
		WITH RECURSIVE descendants(id) AS (
			SELECT tag_id FROM tags WHERE parent_id = t.tag_id
			UNION ALL
			SELECT child.tag_id FROM tags child
			INNER JOIN descendants d ON child.parent_id = d.id
		)
		SELECT 1 FROM descendants d
		JOIN note_tags ntc ON d.id = ntc.tag_id
		JOIN notes nc ON ntc.note_id = nc.note_id AND %s
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
		// Templates use template_tags, no archive/trash status. Ancestors are
		// included only to preserve the display tree around matching tags.
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
					WITH RECURSIVE descendants(id) AS (
						SELECT tag_id FROM tags WHERE parent_id = t.tag_id
						UNION ALL
						SELECT child.tag_id FROM tags child
						INNER JOIN descendants d ON child.parent_id = d.id
					)
					SELECT 1 FROM descendants d
					JOIN template_tags ttc ON d.id = ttc.tag_id
				)
			ORDER BY
				COALESCE(t.sort_order, 2147483647) ASC,
				note_count DESC
		`
		args = []interface{}{}
	} else {
		// Notes section
		if focusModeID != 0 {
			// Focus mode remains an exact-tag filter. Include selected tags and
			// their ancestors here solely so the sidebar can render their tree.
			q = fmt.Sprintf(`
				WITH RECURSIVE focus_tags(id) AS (
					SELECT tag_id FROM focus_mode_tags WHERE focus_mode_id = ?
					UNION
					SELECT parent.tag_id FROM tags child
					INNER JOIN focus_tags ft ON child.tag_id = ft.id
					INNER JOIN tags parent ON parent.tag_id = child.parent_id
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

// BuildTagTree converts a flat list of tags into a display tree. The parent link
// controls placement only; it does not imply inherited note membership.
func BuildTagTree(tags []Tag) []Tag {
	byID := make(map[int]Tag, len(tags))
	childrenByParent := make(map[int][]int)
	roots := []int{}

	for _, tag := range tags {
		tag.Children = nil
		byID[tag.TagID] = tag
	}
	for _, tag := range tags {
		if tag.ParentID == nil {
			roots = append(roots, tag.TagID)
			continue
		}
		if _, exists := byID[*tag.ParentID]; exists {
			childrenByParent[*tag.ParentID] = append(childrenByParent[*tag.ParentID], tag.TagID)
		} else {
			// Keep incomplete result sets usable: a missing ancestor promotes the
			// tag to the root instead of silently losing it.
			roots = append(roots, tag.TagID)
		}
	}

	var build func(int, map[int]bool) Tag
	build = func(tagID int, ancestors map[int]bool) Tag {
		tag := byID[tagID]
		if ancestors[tagID] {
			return tag
		}
		nextAncestors := make(map[int]bool, len(ancestors)+1)
		for id := range ancestors {
			nextAncestors[id] = true
		}
		nextAncestors[tagID] = true
		for _, childID := range childrenByParent[tagID] {
			tag.Children = append(tag.Children, build(childID, nextAncestors))
		}
		return tag
	}

	tree := make([]Tag, 0, len(roots))
	for _, rootID := range roots {
		tree = append(tree, build(rootID, map[int]bool{}))
	}
	return tree
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

// ParseAndCreateTagHierarchy is retained for callers that create tags while
// saving notes. A slash is part of a tag name, not an implicit hierarchy: parent
// placement is managed explicitly from the tag manager.
func ParseAndCreateTagHierarchy(name string, q querier) (int, string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, "", fmt.Errorf("tag name cannot be empty")
	}

	var existingLeafID int
	err := q.QueryRow("SELECT tag_id FROM tags WHERE LOWER(name) = LOWER(?)", name).Scan(&existingLeafID)
	if err == nil {
		return existingLeafID, name, nil
	}

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

// BuildReadableTagsPredicate narrows a query to tags the access grant can read.
// Tag lists are nil when every tag is covered and empty when none are.
func BuildReadableTagsPredicate(access auth.Access, tagIDColumn string) (string, []interface{}) {
	if auth.CanReadAllTags(access) {
		return "", nil
	}

	if len(access.ReadTagIDs) == 0 {
		return "AND 0", nil
	}

	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(access.ReadTagIDs)), ",")
	args := []interface{}{}
	for _, tagID := range access.ReadTagIDs {
		args = append(args, tagID)
	}

	return fmt.Sprintf("AND %s IN (%s)", tagIDColumn, placeholders), args
}
