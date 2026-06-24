package notes

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"zen/commons/sqlite"
	"zen/features/tags"
)

var imageRefRegex = regexp.MustCompile(`!\[.*?\]\(/images/([^)]+)\)`)
var attachmentRefRegex = regexp.MustCompile(`\[.*?\]\(/attachments/([^)]+)\)`)

// syncNoteFileLinks updates note_images and note_attachments tables
// based on the current note content. Must be called within a transaction.
func syncNoteFileLinks(tx *sql.Tx, noteID int, content string) {
	// Sync note_images
	_, _ = tx.Exec("DELETE FROM note_images WHERE note_id = ?", noteID)
	for _, m := range imageRefRegex.FindAllStringSubmatch(content, -1) {
		if len(m) > 1 {
			_, _ = tx.Exec("INSERT OR IGNORE INTO note_images (note_id, filename) VALUES (?, ?)", noteID, m[1])
		}
	}

	// Sync note_attachments
	_, _ = tx.Exec("DELETE FROM note_attachments WHERE note_id = ?", noteID)
	for _, m := range attachmentRefRegex.FindAllStringSubmatch(content, -1) {
		if len(m) > 1 {
			_, _ = tx.Exec("INSERT OR IGNORE INTO note_attachments (note_id, filename) VALUES (?, ?)", noteID, m[1])
		}
	}
}

func GetAllNotes(filter NotesFilter) ([]Note, int, error) {
	notes := []Note{}
	total := 0
	offset := (filter.page - 1) * NOTES_LIMIT

	var query string
	var queryArgs []interface{}

	statusCond := statusCondition(filter)

	if filter.tagID != 0 {
		query = fmt.Sprintf(`
			SELECT
				n.note_id,
				n.title,
				n.content,
				SUBSTR(n.content, 0, 500) AS snippet,
				n.updated_at,
				` + fmtTagsJSON("t2") + `,
				n.archived_at,
				n.deleted_at,
				n.pinned_at,
				COUNT(*) OVER() as total_count
			FROM
				notes n
			INNER JOIN
				note_tags nt ON n.note_id = nt.note_id
			INNER JOIN
				tags t ON nt.tag_id = t.tag_id
			LEFT JOIN
				note_tags nt2 ON n.note_id = nt2.note_id
			LEFT JOIN
				tags t2 ON nt2.tag_id = t2.tag_id
			WHERE
				t.tag_id = ? AND %s
			GROUP BY
				n.note_id
			ORDER BY
				CASE 
					WHEN n.pinned_at IS NOT NULL THEN 1 
					ELSE 2 
				END,
				COALESCE(n.pinned_at, n.updated_at) DESC
			LIMIT
				?
			OFFSET
				?
		`, statusCond)
		queryArgs = []interface{}{filter.tagID, NOTES_LIMIT, offset}
	} else if filter.isUntagged {
		query = fmt.Sprintf(`
			SELECT
				n.note_id,
				n.title,
				n.content,
				SUBSTR(n.content, 0, 500) AS snippet,
				n.updated_at,
				'[]' as tags_json,
				n.archived_at,
				n.deleted_at,
				n.pinned_at,
				COUNT(*) OVER() as total_count
			FROM
				notes n
			WHERE
				%s
				AND NOT EXISTS (
					SELECT 1 FROM note_tags nt WHERE nt.note_id = n.note_id
				)
			ORDER BY
				CASE 
					WHEN n.pinned_at IS NOT NULL THEN 1 
					ELSE 2 
				END,
				COALESCE(n.pinned_at, n.updated_at) DESC
			LIMIT
				?
			OFFSET
				?
		`, statusCond)
		queryArgs = []interface{}{NOTES_LIMIT, offset}
	} else if filter.focusModeID != 0 {
		untaggedClause := ""
		if filter.isDeleted || filter.isArchived {
			untaggedClause = "OR NOT EXISTS (SELECT 1 FROM note_tags nt2 WHERE nt2.note_id = n.note_id)"
		}
		query = fmt.Sprintf(`
			SELECT
				n.note_id,
				n.title,
				n.content,
				SUBSTR(n.content, 0, 500) AS snippet,
				n.updated_at,
				` + fmtTagsJSON("t") + `,
				n.archived_at,
				n.deleted_at,
				n.pinned_at,
				COUNT(*) OVER() as total_count
			FROM
				notes n
			LEFT JOIN
				note_tags nt ON n.note_id = nt.note_id
			LEFT JOIN
				tags t ON nt.tag_id = t.tag_id
			LEFT JOIN
				focus_mode_tags fmt ON nt.tag_id = fmt.tag_id AND fmt.focus_mode_id = ?
			WHERE
				%s
				AND (fmt.focus_mode_id = ? %s)
			GROUP BY
				n.note_id
			ORDER BY
				CASE 
					WHEN n.pinned_at IS NOT NULL THEN 1 
					ELSE 2 
				END,
				COALESCE(n.pinned_at, n.updated_at) DESC
			LIMIT
				?
			OFFSET
				?
		`, statusCond, untaggedClause)
		queryArgs = []interface{}{filter.focusModeID, filter.focusModeID, NOTES_LIMIT, offset}
	} else {
		query = fmt.Sprintf(`
			SELECT
				n.note_id,
				n.title,
				n.content,
				SUBSTR(n.content, 0, 500) AS snippet,
				n.updated_at,
				` + fmtTagsJSON("t") + `,
				n.archived_at,
				n.deleted_at,
				n.pinned_at,
				COUNT(*) OVER() as total_count
			FROM
				notes n
			LEFT JOIN
				note_tags nt ON n.note_id = nt.note_id
			LEFT JOIN
				tags t ON nt.tag_id = t.tag_id
			WHERE
				%s
			GROUP BY
				n.note_id
			ORDER BY
				CASE 
					WHEN n.pinned_at IS NOT NULL THEN 1 
					ELSE 2 
				END,
				COALESCE(n.pinned_at, n.updated_at) DESC
			LIMIT
				?
			OFFSET
				?
		`, statusCond)
		queryArgs = []interface{}{NOTES_LIMIT, offset}
	}

	rows, err := sqlite.DB.Query(query, queryArgs...)
	if err != nil {
		err = fmt.Errorf("error retrieving notes: %w", err)
		slog.Error(err.Error())
		return notes, total, err
	}
	defer rows.Close()

	for rows.Next() {
		var note Note
		var archivedAt sql.NullTime
		var deletedAt sql.NullTime
		var pinnedAt sql.NullTime
		var tagsJSON string

		err = rows.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.UpdatedAt, &tagsJSON, &archivedAt, &deletedAt, &pinnedAt, &total)
		if err != nil {
			err = fmt.Errorf("error scanning note: %w", err)
			slog.Error(err.Error())
			return notes, total, err
		}

		note.IsArchived = archivedAt.Valid
		note.IsDeleted = deletedAt.Valid
		note.IsPinned = pinnedAt.Valid
		note.Tags = parseTagsJSON(tagsJSON, note.NoteID)

		notes = append(notes, note)
	}

	return notes, total, nil
}

func GetNoteByID(noteID int) (Note, error) {
	var note Note
	var archivedAt sql.NullTime
	var deletedAt sql.NullTime
	var pinnedAt sql.NullTime
	var tagsJSON string

	query := `
		SELECT
			n.note_id,
			n.title,
			n.content,
			SUBSTR(n.content, 0, 500) AS snippet,
			n.updated_at,
			` + fmtTagsJSON("t") + `,
			n.archived_at,
			n.deleted_at,
			n.pinned_at
		FROM
			notes n
		LEFT JOIN
			note_tags nt ON n.note_id = nt.note_id
		LEFT JOIN
			tags t ON nt.tag_id = t.tag_id
		WHERE
			n.note_id = ?
		GROUP BY
			n.note_id
	`

	row := sqlite.DB.QueryRow(query, noteID)
	err := row.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.UpdatedAt, &tagsJSON, &archivedAt, &deletedAt, &pinnedAt)
	if err != nil {
		err = fmt.Errorf("error retrieving note: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	note.IsArchived = archivedAt.Valid
	note.IsDeleted = deletedAt.Valid
	note.IsPinned = pinnedAt.Valid
	note.Tags = parseTagsJSON(tagsJSON, note.NoteID)

	return note, nil
}

func CreateNote(note Note) (Note, error) {
	tx, err := sqlite.DB.Begin()

	if err != nil {
		err = fmt.Errorf("error starting transaction: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	defer tx.Rollback()

	query := `
		INSERT INTO
			notes (title, content)
		VALUES
			(?, ?)
		RETURNING
			note_id,
			title,
			content,
			SUBSTR(content, 0, 500) AS snippet,
			created_at,
			updated_at
	`

	row := tx.QueryRow(query, note.Title, note.Content)
	err = row.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.CreatedAt, &note.UpdatedAt)

	if err != nil {
		err = fmt.Errorf("error creating note: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	for _, tag := range note.Tags {
		if tag.TagID == -1 {
			tagID, tagName, hErr := tags.ParseAndCreateTagHierarchy(tag.Name, tx)
			if hErr != nil {
				hErr = fmt.Errorf("error creating tag: %w", hErr)
				slog.Error(hErr.Error())
				return note, hErr
			}
			tag.TagID = tagID
			tag.Name = tagName
		}

		query := `
			INSERT INTO
				note_tags (note_id, tag_id)
			VALUES
				(?, ?)
		`
		_, err := tx.Exec(query, note.NoteID, tag.TagID)
		if err != nil {
			err = fmt.Errorf("error adding tags to note: %w", err)
			slog.Error(err.Error())
			return note, err
		}
	}

	var tagsJSON string
	row = tx.QueryRow(fetchNoteTagsQuery, note.NoteID)
	err = row.Scan(&tagsJSON)

	if err == sql.ErrNoRows {
		note.Tags = []tags.Tag{}
	} else if err != nil {
		err = fmt.Errorf("error retrieving tags for note %d: %w", note.NoteID, err)
		slog.Error(err.Error())
		note.Tags = []tags.Tag{}
	} else {
		err = json.Unmarshal([]byte(tagsJSON), &note.Tags)
		if err != nil {
			err = fmt.Errorf("error unmarshaling tags for note %d: %w", note.NoteID, err)
			slog.Error(err.Error())
			note.Tags = []tags.Tag{}
		}
	}

	// Sync image and attachment links from content
	syncNoteFileLinks(tx, note.NoteID, note.Content)

	err = tx.Commit()

	if err != nil {
		err = fmt.Errorf("error creating note: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	return note, nil
}

func UpdateNote(note Note) (Note, error) {
	tx, err := sqlite.DB.Begin()

	if err != nil {
		err = fmt.Errorf("error starting transaction: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	defer tx.Rollback()

	query := `
		UPDATE
			notes
		SET
			title = ?,
			content = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE
			note_id = ?
		RETURNING
			note_id,
			title,
			content,
			SUBSTR(content, 0, 500) AS snippet,
			updated_at
	`

	row := tx.QueryRow(query, note.Title, note.Content, note.NoteID)
	err = row.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.UpdatedAt)
	if err != nil {
		err = fmt.Errorf("error updating note: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	query = `
		DELETE FROM
			note_tags
		WHERE
			note_id = ?
	`

	_, err = tx.Exec(query, note.NoteID)
	if err != nil {
		err = fmt.Errorf("error deleting tags: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	for _, tag := range note.Tags {
		if tag.TagID == -1 {
			tagID, tagName, hErr := tags.ParseAndCreateTagHierarchy(tag.Name, tx)
			if hErr != nil {
				hErr = fmt.Errorf("error creating tag: %w", hErr)
				slog.Error(hErr.Error())
				return note, hErr
			}
			tag.TagID = tagID
			tag.Name = tagName
		}

		query := `
			INSERT INTO
				note_tags (note_id, tag_id)
			VALUES
				(?, ?)
		`
		_, err := tx.Exec(query, note.NoteID, tag.TagID)
		if err != nil {
			err = fmt.Errorf("error adding tags to note: %w", err)
			slog.Error(err.Error())
			return note, err
		}
	}

	var tagsJSON string
	row = tx.QueryRow(fetchNoteTagsQuery, note.NoteID)
	err = row.Scan(&tagsJSON)
	if err == sql.ErrNoRows {
		note.Tags = []tags.Tag{}
	} else if err != nil {
		err = fmt.Errorf("error retrieving tags for note %d: %w", note.NoteID, err)
		slog.Error(err.Error())
		note.Tags = []tags.Tag{}
	}
	if strings.TrimSpace(tagsJSON) == "" || tagsJSON == "null" {
		note.Tags = []tags.Tag{}
	} else {
		err = json.Unmarshal([]byte(tagsJSON), &note.Tags)
		if err != nil {
			err = fmt.Errorf("error unmarshaling tags for note %d: %w", note.NoteID, err)
			slog.Error(err.Error())
			note.Tags = []tags.Tag{}
		}
	}

	// Sync image and attachment links from content
	syncNoteFileLinks(tx, note.NoteID, note.Content)

	err = tx.Commit()

	if err != nil {
		err = fmt.Errorf("error updating note: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	return note, nil
}

func GetNotesCount(isDeleted, isArchived bool) (int, error) {
	var count int
	var query string

	if isDeleted {
		query = "SELECT COUNT(*) FROM notes WHERE deleted_at IS NOT NULL"
	} else if isArchived {
		query = "SELECT COUNT(*) FROM notes WHERE archived_at IS NOT NULL"
	} else {
		query = "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND archived_at IS NULL"
	}

	err := sqlite.DB.QueryRow(query).Scan(&count)
	if err != nil {
		err = fmt.Errorf("error getting notes count: %w", err)
		slog.Error(err.Error())
		return 0, err
	}

	return count, nil
}