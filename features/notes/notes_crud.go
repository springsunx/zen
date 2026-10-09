package notes

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"
	"zen/commons/auth"
	"zen/commons/sqlite"
	"zen/commons/utils"
	"zen/features/tags"
)

var imageRefRegex = regexp.MustCompile(`!\[.*?\]\(/images/([^)]+)\)`)
var attachmentRefRegex = regexp.MustCompile(`\[.*?\]\(/attachments/([^)]+)\)`)

// ErrNoteConflict means the note changed after a caller read its updated_at value.
// MCP uses this to avoid allowing an older AI response to overwrite newer content.
var ErrNoteConflict = errors.New("note changed since it was read")

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

func GetAllNotes(access auth.Access, filter NotesFilter) ([]Note, int, error) {
	notes := []Note{}
	total := 0
	offset := (filter.page - 1) * NOTES_LIMIT

	scopePredicate, scopeArgs := buildReadableNotesPredicate(access)
	titleMatchPredicate := ""
	titleMatchArgs := []interface{}{}
	if strings.TrimSpace(filter.titleQuery) != "" {
		matchedIDs, err := getTitleMatchIDs(access, filter)
		if err != nil {
			return notes, total, err
		}
		if len(matchedIDs) == 0 {
			return notes, total, nil
		}

		placeholders := make([]string, len(matchedIDs))
		for i, noteID := range matchedIDs {
			placeholders[i] = "?"
			titleMatchArgs = append(titleMatchArgs, noteID)
		}
		titleMatchPredicate = " AND n.note_id IN (" + strings.Join(placeholders, ",") + ")"
	}

	var query string
	var queryArgs []interface{}

	statusCond := statusCondition(filter) + " " + scopePredicate + titleMatchPredicate

	if filter.tagID != 0 {
		// Tag hierarchy is for sidebar organisation only. Selecting a tag always
		// matches notes explicitly carrying that exact tag, never its descendants.
		query = fmt.Sprintf(`
			SELECT
				n.note_id,
				n.title,
				n.content,
				SUBSTR(n.content, 0, 500) AS snippet,
				n.created_at,
				n.updated_at,
				`+fmtTagsJSON("t2")+`,
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
		queryArgs = []interface{}{filter.tagID}
		queryArgs = append(queryArgs, scopeArgs...)
		queryArgs = append(queryArgs, titleMatchArgs...)
		queryArgs = append(queryArgs, NOTES_LIMIT, offset)
	} else if filter.isUntagged {
		query = fmt.Sprintf(`
			SELECT
				n.note_id,
				n.title,
				n.content,
				SUBSTR(n.content, 0, 500) AS snippet,
				n.created_at,
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
		queryArgs = append([]interface{}{}, scopeArgs...)
		queryArgs = append(queryArgs, titleMatchArgs...)
		queryArgs = append(queryArgs, NOTES_LIMIT, offset)
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
				n.created_at,
				n.updated_at,
				`+fmtTagsJSON("t")+`,
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
		queryArgs = []interface{}{filter.focusModeID, filter.focusModeID}
		queryArgs = append(queryArgs, scopeArgs...)
		queryArgs = append(queryArgs, titleMatchArgs...)
		queryArgs = append(queryArgs, NOTES_LIMIT, offset)
	} else {
		query = fmt.Sprintf(`
			SELECT
				n.note_id,
				n.title,
				n.content,
				SUBSTR(n.content, 0, 500) AS snippet,
				n.created_at,
				n.updated_at,
				`+fmtTagsJSON("t")+`,
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
		queryArgs = append([]interface{}{}, scopeArgs...)
		queryArgs = append(queryArgs, titleMatchArgs...)
		queryArgs = append(queryArgs, NOTES_LIMIT, offset)
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

		err = rows.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.CreatedAt, &note.UpdatedAt, &tagsJSON, &archivedAt, &deletedAt, &pinnedAt, &total)
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

func GetNoteByID(access auth.Access, noteID int) (Note, error) {
	scopePredicate, scopeArgs := buildReadableNotesPredicate(access)
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
			n.created_at,
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
			n.note_id = ? ` + scopePredicate + `
		GROUP BY
			n.note_id
	`

	row := sqlite.DB.QueryRow(query, append([]interface{}{noteID}, scopeArgs...)...)
	err := row.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.CreatedAt, &note.UpdatedAt, &tagsJSON, &archivedAt, &deletedAt, &pinnedAt)
	if err == sql.ErrNoRows {
		err = fmt.Errorf("note %d: %w", noteID, utils.ErrNotFound)
		slog.Error(err.Error())
		return note, err
	}
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

func CreateNote(access auth.Access, note Note) (Note, error) {
	return createNote(access, note, false)
}

// CreateImportedNote preserves source timestamps when they are available. When
// an import has no original creation time, the import time becomes the local
// creation time instead of persisting Go's zero date.
func CreateImportedNote(access auth.Access, note Note) (Note, error) {
	if note.CreatedAt.IsZero() {
		note.CreatedAt = time.Now().UTC()
	}
	if note.UpdatedAt.IsZero() {
		note.UpdatedAt = note.CreatedAt
	}
	return createNote(access, note, true)
}

func createNote(access auth.Access, note Note, preserveTimestamps bool) (Note, error) {
	tagIDs := []int{}
	for _, tag := range note.Tags {
		if tag.TagID >= 0 {
			tagIDs = append(tagIDs, tag.TagID)
		}
	}

	// New tag names resolve to ids inside the transaction, so a scoped token is only
	// allowed to create a note when no tag name has to be invented.
	if len(tagIDs) > 0 || access.WriteTagIDs == nil {
		if !auth.CanWrite(access, tagIDs) {
			return note, auth.ErrForbidden
		}
	}

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
	args := []interface{}{note.Title, note.Content}
	if preserveTimestamps {
		query = `
			INSERT INTO
				notes (title, content, created_at, updated_at)
			VALUES
				(?, ?, ?, ?)
			RETURNING
				note_id,
				title,
				content,
				SUBSTR(content, 0, 500) AS snippet,
				created_at,
				updated_at
		`
		args = append(args, note.CreatedAt, note.UpdatedAt)
	}

	row := tx.QueryRow(query, args...)
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

func UpdateNote(access auth.Access, note Note) (Note, error) {
	return updateNote(access, note, nil)
}

// UpdateNoteIfUnchanged updates a note only when its updated_at timestamp still
// matches the value returned to the caller. Existing callers can continue using
// UpdateNote; integrations that read-then-write should use this guard.
func UpdateNoteIfUnchanged(access auth.Access, note Note, expectedUpdatedAt time.Time) (Note, error) {
	return updateNote(access, note, &expectedUpdatedAt)
}

func updateNote(access auth.Access, note Note, expectedUpdatedAt *time.Time) (Note, error) {
	if err := ensureNoteWritable(access, note.NoteID); err != nil {
		return note, err
	}

	tx, err := sqlite.DB.Begin()

	if err != nil {
		err = fmt.Errorf("error starting transaction: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	defer tx.Rollback()

	// Snapshot the text about to be replaced, but only if it actually differs and
	// no version was taken in the last VERSION_MIN_INTERVAL, so rapid saves from
	// autosave do not flood the history.
	snapshotQuery := `
		INSERT INTO
			note_versions (note_id, title, content)
		SELECT
			note_id,
			title,
			content
		FROM
			notes
		WHERE
			note_id = ? AND (title != ? OR content != ?)
			AND NOT EXISTS (
				SELECT
					1
				FROM
					note_versions
				WHERE
					note_id = ? AND created_at > datetime('now', ?)
			)
	`

	if _, err = tx.Exec(snapshotQuery, note.NoteID, note.Title, note.Content, note.NoteID, VERSION_MIN_INTERVAL); err != nil {
		err = fmt.Errorf("error snapshotting note version: %w", err)
		slog.Error(err.Error())
		return note, err
	}

	query := `
		UPDATE
			notes
		SET
			title = ?,
			content = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE
			note_id = ?`
	queryArgs := []interface{}{note.Title, note.Content, note.NoteID}
	if expectedUpdatedAt != nil {
		// SQLite's CURRENT_TIMESTAMP is stored in UTC to second precision.
		query += " AND updated_at = ?"
		queryArgs = append(queryArgs, expectedUpdatedAt.UTC().Format("2006-01-02 15:04:05"))
	}
	query += `
		RETURNING
			note_id,
			title,
			content,
			SUBSTR(content, 0, 500) AS snippet,
			updated_at
	`

	row := tx.QueryRow(query, queryArgs...)
	err = row.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) && expectedUpdatedAt != nil {
		return note, ErrNoteConflict
	}
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

// ensureNoteWritable requires a write grant on every tag the note carries. Unrestricted
// session access writes anything; a tag-scoped token is blocked by any tag it cannot write.
func ensureNoteWritable(access auth.Access, noteID int) error {
	rows, err := sqlite.DB.Query("SELECT tag_id FROM note_tags WHERE note_id = ?", noteID)
	if err != nil {
		return fmt.Errorf("error reading note tags: %w", err)
	}
	defer rows.Close()

	tagIDs := []int{}
	for rows.Next() {
		var tagID int
		if err := rows.Scan(&tagID); err != nil {
			return fmt.Errorf("error scanning note tag: %w", err)
		}
		tagIDs = append(tagIDs, tagID)
	}

	if !auth.CanWrite(access, tagIDs) {
		return auth.ErrForbidden
	}

	return nil
}
