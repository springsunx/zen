package tags

import (
	"fmt"
	"log/slog"
	"zen/commons/sqlite"
)

func GetAllTags() ([]Tag, error) {
	tags := []Tag{}
	query := `
		SELECT
			t.tag_id,
			t.name,
			COUNT(nt.note_id) AS note_count
		FROM
			tags t
		LEFT JOIN
			note_tags nt ON t.tag_id = nt.tag_id
		GROUP BY
			t.tag_id, t.name, t.sort_order
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
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.NoteCount)
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
			COUNT(nt.note_id) AS note_count
		FROM
			tags t
		LEFT JOIN
			note_tags nt ON t.tag_id = nt.tag_id
		WHERE
			t.name LIKE '%' || ? || '%'
		GROUP BY
			t.tag_id, t.name, t.sort_order
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
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.NoteCount)
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
			t.tag_id, t.name, t.sort_order
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
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.NoteCount)
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
		return "JOIN notes n ON nt.note_id = n.note_id AND n.archived_at IS NOT NULL"
	} else if statusCol == "deleted" {
		return "JOIN notes n ON nt.note_id = n.note_id AND n.deleted_at IS NOT NULL"
	}
	return "JOIN notes n ON nt.note_id = n.note_id AND n.deleted_at IS NULL AND n.archived_at IS NULL"
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
				COUNT(tt.template_id) AS note_count
			FROM
				tags t
			LEFT JOIN
				template_tags tt ON t.tag_id = tt.tag_id
			GROUP BY
				t.tag_id, t.name, t.sort_order
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
					COUNT(nt.note_id) AS note_count
				FROM
					tags t
				LEFT JOIN
					note_tags nt ON t.tag_id = nt.tag_id
				%s
				JOIN
					focus_mode_tags f ON t.tag_id = f.tag_id
				WHERE
					f.focus_mode_id = ?
				GROUP BY
					t.tag_id, t.name, t.sort_order
				ORDER BY
					t.tag_id ASC
			`, joinNote)
			args = []interface{}{focusModeID}
		} else {
			q = fmt.Sprintf(`
				SELECT
					t.tag_id,
					t.name,
					COUNT(nt.note_id) AS note_count
				FROM
					tags t
				LEFT JOIN
					note_tags nt ON t.tag_id = nt.tag_id
				%s
				GROUP BY
					t.tag_id, t.name, t.sort_order
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
		err = rows.Scan(&tag.TagID, &tag.Name, &tag.NoteCount)
		if err != nil {
			err = fmt.Errorf("error scanning tag: %w", err)
			slog.Error(err.Error())
			return tags, err
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

func UpdateTag(tag Tag) error {
	query := `
		UPDATE
			tags
		SET
			name = ?
		WHERE
			tag_id = ?
	`

	_, err := sqlite.DB.Exec(query, tag.Name, tag.TagID)
	if err != nil {
		err = fmt.Errorf("error updating tag: %w", err)
		slog.Error(err.Error())
		return err
	}
	return nil
}

func DeleteTag(tagID int) error {
	tx, err := sqlite.DB.Begin()
	if err != nil {
		err = fmt.Errorf("error starting transaction: %w", err)
		slog.Error(err.Error())
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec("DELETE FROM note_tags WHERE tag_id = ?", tagID)
	if err != nil {
		err = fmt.Errorf("error deleting from note_tags: %w", err)
		slog.Error(err.Error())
		return err
	}

	_, err = tx.Exec("DELETE FROM tags WHERE tag_id = ?", tagID)
	if err != nil {
		err = fmt.Errorf("error deleting from tags: %w", err)
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
