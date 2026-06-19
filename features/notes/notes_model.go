package notes

import (
	"encoding/json"
	"fmt"
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
