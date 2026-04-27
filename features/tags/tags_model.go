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

func GetUntaggedCount() (int, error) {
	var count int
	query := `
		SELECT COUNT(*) FROM notes n
		WHERE n.deleted_at IS NULL AND n.archived_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.note_id)
	`
	err := sqlite.DB.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("error counting untagged notes: %w", err)
	}
	return count, nil
}
