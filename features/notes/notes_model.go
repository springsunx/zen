package notes

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"zen/commons/auth"
	"zen/commons/sqlite"
	"zen/commons/utils"
	"zen/features/tags"
)

const NOTES_LIMIT = 100

// tagsJSONExpr returns the JSON_GROUP_ARRAY expression for tag columns with the given table alias.
// Used inline in SELECT clauses that already JOIN note_tags.
const tagsJSONExpr = `COALESCE(
					JSON_GROUP_ARRAY(JSON_OBJECT(
						'tagId', %s.tag_id,
						'name', %s.name,
						'color', %s.color
					)) FILTER (WHERE %s.tag_id IS NOT NULL), '[]'
				) as tags_json`

func fmtTagsJSON(alias string) string {
	return fmt.Sprintf(tagsJSONExpr, alias, alias, alias, alias)
}

// tagsJSONSubquery is a standalone subquery for fetching tags when not using JOINs.
func tagsJSONSubquery(noteAlias string) string {
	return fmt.Sprintf(`(
		SELECT COALESCE(
			JSON_GROUP_ARRAY(JSON_OBJECT(
				'tagId', t.tag_id,
				'name', t.name,
				'color', t.color
			)) FILTER (WHERE t.tag_id IS NOT NULL), '[]'
		)
		FROM note_tags nt
		LEFT JOIN tags t ON nt.tag_id = t.tag_id
		WHERE nt.note_id = %s.note_id
	) as tags_json`, noteAlias)
}

// fetchNoteTagsQuery returns the query to fetch tags for a specific note by ID.
// Used in CreateNote/UpdateNote transactions after tag changes.
const fetchNoteTagsQuery = `
		SELECT
			COALESCE(
				JSON_GROUP_ARRAY(JSON_OBJECT(
					'tagId', t.tag_id,
					'name', t.name,
					'color', t.color
				)), '[]'
			) as tags_json
		FROM
			note_tags nt
		LEFT JOIN
			tags t ON nt.tag_id = t.tag_id
		WHERE
			nt.note_id = ?
		GROUP BY
			nt.note_id
	`

func statusCondition(filter NotesFilter) string {
	if filter.isDeleted {
		return "n.deleted_at IS NOT NULL"
	} else if filter.isArchived {
		return "n.archived_at IS NOT NULL"
	}
	return "n.deleted_at IS NULL AND n.archived_at IS NULL"
}

// parseTagsJSON unmarshals a JSON string into a tags slice, returning empty slice on error or null.
func parseTagsJSON(tagsJSON string, noteID int) []tags.Tag {
	if tagsJSON == "" || tagsJSON == "null" {
		return []tags.Tag{}
	}
	var result []tags.Tag
	if err := json.Unmarshal([]byte(tagsJSON), &result); err != nil {
		err = fmt.Errorf("error unmarshaling tags for note %d: %w", noteID, err)
		return []tags.Tag{}
	}
	return result
}

const (
	SortRelevance = "relevance"
	SortUpdated   = "updated"
	SortCreated   = "created"
)

func GetRelatedNotes(noteID int, limit int) ([]Note, error) {
	notes := []Note{}

	query := `
		SELECT
			n.note_id,
			n.title,
			n.content,
			SUBSTR(n.content, 0, 500) AS snippet,
			n.created_at,
			n.updated_at,
			(
				SELECT COALESCE(
					JSON_GROUP_ARRAY(JSON_OBJECT(
						'tagId', t2.tag_id,
						'name', t2.name,
						'color', t2.color
					)), '[]'
				)
				FROM note_tags nt2
				JOIN tags t2 ON nt2.tag_id = t2.tag_id
				WHERE nt2.note_id = n.note_id
			) as tags_json,
			n.archived_at,
			n.deleted_at,
			n.pinned_at,
			COUNT(DISTINCT shared.tag_id) AS shared_count
		FROM
			notes n
		INNER JOIN
			note_tags shared ON n.note_id = shared.note_id
		WHERE
			shared.tag_id IN (SELECT tag_id FROM note_tags WHERE note_id = ?)
			AND n.note_id != ?
			AND n.deleted_at IS NULL
			AND n.archived_at IS NULL
		GROUP BY
			n.note_id
		ORDER BY
			shared_count DESC,
			n.updated_at DESC
		LIMIT
			?
	`

	rows, err := sqlite.DB.Query(query, noteID, noteID, limit)
	if err != nil {
		err = fmt.Errorf("error retrieving related notes: %w", err)
		return notes, err
	}
	defer rows.Close()

	for rows.Next() {
		var note Note
		var tagsJSON string
		var archivedAt sql.NullTime
		var deletedAt sql.NullTime
		var pinnedAt sql.NullTime
		var sharedCount int

		err = rows.Scan(&note.NoteID, &note.Title, &note.Content, &note.Snippet, &note.CreatedAt, &note.UpdatedAt, &tagsJSON, &archivedAt, &deletedAt, &pinnedAt, &sharedCount)
		if err != nil {
			err = fmt.Errorf("error scanning related note: %w", err)
			return notes, err
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

		note.IsArchived = archivedAt.Valid
		note.IsDeleted = deletedAt.Valid
		note.IsPinned = pinnedAt.Valid
		notes = append(notes, note)
	}

	return notes, nil
}

const VERSIONS_LIMIT = 50

// Version pruning keeps the newest version per time window, widening the window as versions age.
// Notes with fewer versions than the threshold are skipped, so the scan only visits notes with enough history worth thinning.

const (
	VERSION_KEEP_ALL_AGE    = "-1 hour"
	VERSION_HOURLY_AGE      = "-7 days"
	VERSION_DAILY_AGE       = "-30 days"
	VERSION_PRUNE_THRESHOLD = 5
)

// Shortest gap between two snapshots of the same note

const VERSION_MIN_INTERVAL = "-5 minutes"

func GetNoteVersions(noteID int, page int) ([]NoteVersion, int, error) {
	versions := []NoteVersion{}
	total := 0
	offset := (page - 1) * VERSIONS_LIMIT

	query := `
		SELECT
			COUNT(*)
		FROM
			note_versions
		WHERE
			note_id = ?
	`

	row := sqlite.DB.QueryRow(query, noteID)
	err := row.Scan(&total)
	if err != nil {
		err = fmt.Errorf("error counting note versions: %w", err)
		return versions, total, err
	}

	query = `
		SELECT
			version_id,
			note_id,
			title,
			content,
			created_at
		FROM
			note_versions
		WHERE
			note_id = ?
		ORDER BY
			created_at DESC,
			version_id DESC
		LIMIT
			?
		OFFSET
			?
	`

	rows, err := sqlite.DB.Query(query, noteID, VERSIONS_LIMIT, offset)
	if err != nil {
		err = fmt.Errorf("error retrieving note versions: %w", err)
		return versions, total, err
	}
	defer rows.Close()

	for rows.Next() {
		var version NoteVersion
		err = rows.Scan(&version.VersionID, &version.NoteID, &version.Title, &version.Content, &version.CreatedAt)
		if err != nil {
			err = fmt.Errorf("error scanning note version: %w", err)
			return versions, total, err
		}
		versions = append(versions, version)
	}

	return versions, total, nil
}

func GetNoteVersionByID(noteID int, versionID int) (NoteVersion, error) {
	var version NoteVersion

	query := `
		SELECT
			version_id,
			note_id,
			title,
			content,
			created_at
		FROM
			note_versions
		WHERE
			note_id = ? AND version_id = ?
	`

	row := sqlite.DB.QueryRow(query, noteID, versionID)
	err := row.Scan(&version.VersionID, &version.NoteID, &version.Title, &version.Content, &version.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		err = fmt.Errorf("note version %d: %w", versionID, utils.ErrNotFound)
		return version, err
	}
	if err != nil {
		err = fmt.Errorf("error retrieving note version: %w", err)
		return version, err
	}

	return version, nil
}

func RestoreNoteVersion(noteID int, versionID int) (Note, error) {
	var note Note

	version, err := GetNoteVersionByID(noteID, versionID)
	if err != nil {
		return note, err
	}

	currentNote, err := GetNoteByID(auth.Unrestricted, noteID)
	if err != nil {
		return note, err
	}

	note.NoteID = noteID
	note.Title = version.Title
	note.Content = version.Content
	note.Tags = currentNote.Tags

	note, err = UpdateNote(auth.Unrestricted, note)
	if err != nil {
		return note, err
	}

	// UpdateNote's RETURNING clause doesn't populate these
	note.IsPinned = currentNote.IsPinned
	note.IsArchived = currentNote.IsArchived
	note.IsDeleted = currentNote.IsDeleted
	note.CreatedAt = currentNote.CreatedAt

	return note, nil
}

func PruneNoteVersions() error {
	query := `
		DELETE FROM note_versions WHERE version_id IN (
			SELECT version_id FROM (
				SELECT
					version_id,
					ROW_NUMBER() OVER (
						PARTITION BY note_id, CASE
							WHEN created_at > datetime('now', ?) THEN version_id
							WHEN created_at > datetime('now', ?) THEN strftime('%Y%m%d%H', created_at)
							WHEN created_at > datetime('now', ?) THEN strftime('%Y%m%d', created_at)
							ELSE strftime('%Y%W', created_at)
						END
						ORDER BY created_at DESC
					) AS rn
				FROM
					note_versions
				WHERE
					note_id IN (SELECT note_id FROM note_versions GROUP BY note_id HAVING COUNT(*) > ?)
			) WHERE rn > 1
		)
	`

	_, err := sqlite.DB.Exec(query, VERSION_KEEP_ALL_AGE, VERSION_HOURLY_AGE, VERSION_DAILY_AGE, VERSION_PRUNE_THRESHOLD)
	if err != nil {
		err = fmt.Errorf("error pruning note versions: %w", err)
		return err
	}

	return nil
}

func getTagIDsForNote(tx *sql.Tx, noteID int) ([]int, error) {
	tagIDs := []int{}

	query := `
		SELECT
			tag_id
		FROM
			note_tags
		WHERE
			note_id = ?
	`

	rows, err := tx.Query(query, noteID)
	if err != nil {
		err = fmt.Errorf("error retrieving note tags: %w", err)
		return tagIDs, err
	}
	defer rows.Close()

	for rows.Next() {
		var tagID int
		err = rows.Scan(&tagID)
		if err != nil {
			err = fmt.Errorf("error scanning note tag: %w", err)
			return tagIDs, err
		}
		tagIDs = append(tagIDs, tagID)
	}

	return tagIDs, nil
}

// Notes with no tags match only when every tag is readable.

func buildReadableNotesPredicate(access auth.Access) (string, []interface{}) {
	if auth.CanReadAllTags(access) {
		return "", nil
	}

	tagPredicate, args := tags.BuildReadableTagsPredicate(access, "scoped_nt.tag_id")
	return "AND EXISTS (SELECT 1 FROM note_tags scoped_nt WHERE scoped_nt.note_id = n.note_id " + tagPredicate + ")", args
}
