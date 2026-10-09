package notes

import (
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"zen/commons/auth"
	"zen/commons/sqlite"
	"zen/features/tags"
)

// GetPinyinTitleMatchIDs returns readable note IDs whose titles match either
// full pinyin or pinyin initials. It is retained for backwards compatibility;
// the note list itself now filters before pagination in GetAllNotes.
func GetPinyinTitleMatchIDs(access auth.Access, term string) ([]int, error) {
	term = strings.TrimSpace(term)
	matchedIDs := []int{}
	if term == "" {
		return matchedIDs, nil
	}

	scopePredicate, scopeArgs := buildReadableNotesPredicate(access)
	rows, err := sqlite.DB.Query(`
		SELECT n.note_id, n.title
		FROM notes n
		WHERE 1 `+scopePredicate, scopeArgs...)
	if err != nil {
		return matchedIDs, fmt.Errorf("error reading note titles for pinyin search: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var noteID int
		var title string
		if err := rows.Scan(&noteID, &title); err != nil {
			return matchedIDs, fmt.Errorf("error reading note title for pinyin search: %w", err)
		}
		if tags.MatchesPinyin(title, term) {
			matchedIDs = append(matchedIDs, noteID)
		}
	}

	if err := rows.Err(); err != nil {
		return matchedIDs, fmt.Errorf("error iterating note titles for pinyin search: %w", err)
	}
	return matchedIDs, nil
}

// getTitleMatchIDs returns title matches within the current list scope before
// pagination is applied. A title query intentionally never searches content or
// tag names.
func getTitleMatchIDs(access auth.Access, filter NotesFilter) ([]int, error) {
	term := strings.TrimSpace(filter.titleQuery)
	matchedIDs := []int{}
	if term == "" {
		return matchedIDs, nil
	}

	scopePredicate, scopeArgs := buildReadableNotesPredicate(access)
	statusCond := statusCondition(filter) + " " + scopePredicate
	var query string
	queryArgs := append([]interface{}{}, scopeArgs...)

	switch {
	case filter.tagID != 0:
		query = `
			SELECT n.note_id, n.title
			FROM notes n
			INNER JOIN note_tags nt ON n.note_id = nt.note_id
			WHERE nt.tag_id = ? AND ` + statusCond + `
			GROUP BY n.note_id`
		queryArgs = append([]interface{}{filter.tagID}, queryArgs...)
	case filter.isUntagged:
		query = `
			SELECT n.note_id, n.title
			FROM notes n
			WHERE ` + statusCond + `
			AND NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.note_id)`
	case filter.focusModeID != 0:
		untaggedClause := ""
		if filter.isDeleted || filter.isArchived {
			untaggedClause = "OR NOT EXISTS (SELECT 1 FROM note_tags nt2 WHERE nt2.note_id = n.note_id)"
		}
		query = `
			SELECT n.note_id, n.title
			FROM notes n
			LEFT JOIN note_tags nt ON n.note_id = nt.note_id
			LEFT JOIN focus_mode_tags fmt ON nt.tag_id = fmt.tag_id AND fmt.focus_mode_id = ?
			WHERE ` + statusCond + `
			AND (fmt.focus_mode_id = ? ` + untaggedClause + `)
			GROUP BY n.note_id`
		queryArgs = append([]interface{}{filter.focusModeID, filter.focusModeID}, queryArgs...)
	default:
		query = `SELECT n.note_id, n.title FROM notes n WHERE ` + statusCond
	}

	rows, err := sqlite.DB.Query(query, queryArgs...)
	if err != nil {
		return matchedIDs, fmt.Errorf("error reading note titles for list filter: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var noteID int
		var title string
		if err := rows.Scan(&noteID, &title); err != nil {
			return matchedIDs, fmt.Errorf("error scanning note title for list filter: %w", err)
		}
		if tags.MatchesPinyin(title, term) {
			matchedIDs = append(matchedIDs, noteID)
		}
	}
	if err := rows.Err(); err != nil {
		return matchedIDs, fmt.Errorf("error iterating note titles for list filter: %w", err)
	}

	return matchedIDs, nil
}

func SearchNotes(access auth.Access, term string, limit int, sort string) ([]Note, error) {
	notes := []Note{}

	scopePredicate, scopeArgs := buildReadableNotesPredicate(access)

	// Relevance keeps the title-match boost; the other sorts are plain column orders
	// and drop those placeholders, so the arguments have to be built alongside.
	orderClause := `
			CASE
				WHEN n.title LIKE ? || '%' THEN 1
				WHEN n.title LIKE '%' || ? || '%' THEN 2
				ELSE 3
			END,`
	orderArgs := []interface{}{term, term}

	if sort == SortUpdated {
		orderClause = `
			n.updated_at DESC,`
		orderArgs = []interface{}{}
	} else if sort == SortCreated {
		orderClause = `
			n.created_at DESC,`
		orderArgs = []interface{}{}
	}

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
			n.deleted_at IS NULL
			AND (n.title LIKE '%' || ? || '%' OR n.content LIKE '%' || ? || '%') ` + scopePredicate + `
		GROUP BY
			n.note_id
		ORDER BY` + orderClause + `
			CASE 
				WHEN n.pinned_at IS NOT NULL THEN 1 
				ELSE 2 
			END,
			COALESCE(n.pinned_at, n.updated_at) DESC
		LIMIT
			?
	`

	queryArgs := []interface{}{term, term}
	queryArgs = append(queryArgs, scopeArgs...)
	queryArgs = append(queryArgs, orderArgs...)
	queryArgs = append(queryArgs, limit)

	rows, err := sqlite.DB.Query(query, queryArgs...)
	if err != nil {
		err = fmt.Errorf("error searching notes: %w", err)
		slog.Error(err.Error())
		return notes, err
	}
	defer rows.Close()

	for rows.Next() {
		var note Note
		var archivedAt sql.NullTime
		var deletedAt sql.NullTime
		var pinnedAt sql.NullTime
		var tagsJSON string

		err = rows.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.UpdatedAt, &tagsJSON, &archivedAt, &deletedAt, &pinnedAt)
		if err != nil {
			err = fmt.Errorf("error scanning note: %w", err)
			slog.Error(err.Error())
			return notes, err
		}

		note.IsArchived = archivedAt.Valid
		note.IsDeleted = deletedAt.Valid
		note.IsPinned = pinnedAt.Valid
		note.Tags = parseTagsJSON(tagsJSON, note.NoteID)

		notes = append(notes, note)
	}

	return notes, nil
}

func GetNotesWithImages() ([]Note, error) {
	var notes []Note
	query := `
		SELECT
			note_id,
			title,
			content,
			SUBSTR(content, 0, 500) AS snippet,
			updated_at,
			archived_at,
			deleted_at,
			pinned_at
		FROM
			notes
		WHERE
			deleted_at IS NULL
			AND content LIKE '%![%](/images/%'
	`

	rows, err := sqlite.DB.Query(query)
	if err != nil {
		err = fmt.Errorf("error querying notes: %w", err)
		slog.Error(err.Error())
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var note Note
		var archivedAt sql.NullTime
		var deletedAt sql.NullTime
		var pinnedAt sql.NullTime

		err = rows.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.UpdatedAt, &archivedAt, &deletedAt, &pinnedAt)
		if err != nil {
			err = fmt.Errorf("error scanning note: %w", err)
			slog.Error(err.Error())
			return nil, err
		}

		note.IsArchived = archivedAt.Valid
		note.IsDeleted = deletedAt.Valid
		note.IsPinned = pinnedAt.Valid
		note.Tags = []tags.Tag{}

		notes = append(notes, note)
	}

	return notes, nil
}

// GetBacklinks returns notes whose content contains a link to the given noteID.
// Internal link format: [title](/notes/{noteId})
func GetBacklinks(noteID int) ([]Note, error) {
	notes := []Note{}
	linkPattern := fmt.Sprintf("%%/notes/%d)%%", noteID)

	query := `
		SELECT
			n.note_id,
			n.title,
			SUBSTR(n.content, 0, 200) AS snippet,
			n.updated_at
		FROM
			notes n
		WHERE
			n.content LIKE ?
			AND n.deleted_at IS NULL
			AND n.note_id != ?
		ORDER BY
			n.updated_at DESC
	`

	rows, err := sqlite.DB.Query(query, linkPattern, noteID)
	if err != nil {
		err = fmt.Errorf("error querying backlinks: %w", err)
		slog.Error(err.Error())
		return notes, err
	}
	defer rows.Close()

	for rows.Next() {
		var note Note
		err = rows.Scan(&note.NoteID, &note.Title, &note.Snippet, &note.UpdatedAt)
		if err != nil {
			err = fmt.Errorf("error scanning backlink note: %w", err)
			slog.Error(err.Error())
			return notes, err
		}
		note.Tags = []tags.Tag{}
		notes = append(notes, note)
	}

	return notes, nil
}
