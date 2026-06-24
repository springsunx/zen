package attachments

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"zen/commons/sqlite"
	"zen/features/storage"
)

type Attachment struct {
	Filename     string     `json:"filename"`
	OriginalName string     `json:"originalName"`
	ContentType  string     `json:"contentType"`
	FileSize     int64      `json:"fileSize"`
	URL          string     `json:"url"`
	Storage      string     `json:"storage"`
	LinkedNotes  []NoteRef  `json:"linkedNotes"`
	CreatedAt    string     `json:"createdAt"`
}

type NoteRef struct {
	NoteID int        `json:"noteId"`
	Title  string     `json:"title"`
	Tags   []TagBrief `json:"tags"`
}

type TagBrief struct {
	TagID int    `json:"tagId"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

const ATTACHMENTS_LIMIT = 50

func CreateAttachment(filename, originalName, contentType string, fileSize int64) (Attachment, error) {
	query := `
		INSERT INTO attachments (filename, original_name, content_type, file_size)
		VALUES (?, ?, ?, ?)
	`
	_, err := sqlite.DB.Exec(query, filename, originalName, contentType, fileSize)
	if err != nil {
		return Attachment{}, fmt.Errorf("error inserting attachment: %w", err)
	}

	var a Attachment
	err = sqlite.DB.QueryRow(`
		SELECT filename, original_name, content_type, file_size, created_at
		FROM attachments WHERE filename = ?
	`, filename).Scan(&a.Filename, &a.OriginalName, &a.ContentType, &a.FileSize, &a.CreatedAt)
	if err != nil {
		return Attachment{}, fmt.Errorf("error retrieving created attachment: %w", err)
	}
	a.URL = storage.GetAttachmentURL(a.Filename)
	return a, nil
}

func DeleteAttachment(filename string) error {
	_, err := sqlite.DB.Exec("DELETE FROM note_attachments WHERE filename = ?", filename)
	if err != nil {
		return fmt.Errorf("error unlinking attachment: %w", err)
	}
	_, err = sqlite.DB.Exec("DELETE FROM attachments WHERE filename = ?", filename)
	if err != nil {
		return fmt.Errorf("error deleting attachment: %w", err)
	}
	return nil
}

func LinkAttachmentToNote(noteID int, filename string) error {
	_, err := sqlite.DB.Exec(`
		INSERT OR IGNORE INTO note_attachments (note_id, filename) VALUES (?, ?)
	`, noteID, filename)
	if err != nil {
		return fmt.Errorf("error linking attachment to note: %w", err)
	}
	return nil
}

func UnlinkAttachmentFromNote(noteID int, filename string) error {
	_, err := sqlite.DB.Exec("DELETE FROM note_attachments WHERE note_id = ? AND filename = ?", noteID, filename)
	if err != nil {
		return fmt.Errorf("error unlinking attachment from note: %w", err)
	}
	return nil
}

func GetAttachmentByFilename(filename string) (Attachment, error) {
	var a Attachment
	err := sqlite.DB.QueryRow(`
		SELECT filename, original_name, content_type, file_size, created_at
		FROM attachments WHERE filename = ?
	`, filename).Scan(&a.Filename, &a.OriginalName, &a.ContentType, &a.FileSize, &a.CreatedAt)
	if err != nil {
		return Attachment{}, err
	}
	return a, nil
}

func GetLinkedNotesByAttachment(filename string) ([]int, error) {
	rows, err := sqlite.DB.Query("SELECT note_id FROM note_attachments WHERE filename = ?", filename)
	if err != nil {
		return nil, fmt.Errorf("error querying note_attachments: %w", err)
	}
	defer rows.Close()

	var noteIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			slog.Error("error scanning note_id", "error", err)
			continue
		}
		noteIDs = append(noteIDs, id)
	}
	return noteIDs, nil
}

func GetAllAttachments() ([]Attachment, error) {
	rows, err := sqlite.DB.Query(`
		SELECT filename, original_name, content_type, file_size, created_at
		FROM attachments ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("error querying attachments: %w", err)
	}
	defer rows.Close()

	var attachments []Attachment
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.Filename, &a.OriginalName, &a.ContentType, &a.FileSize, &a.CreatedAt); err != nil {
			slog.Error("error scanning attachment", "error", err)
			continue
		}
		attachments = append(attachments, a)
	}
	return attachments, nil
}

func GetOrphanedAttachments() ([]Attachment, error) {
	rows, err := sqlite.DB.Query(`
		SELECT a.filename, a.original_name, a.content_type, a.file_size, a.created_at
		FROM attachments a
		LEFT JOIN note_attachments na ON a.filename = na.filename
		WHERE na.filename IS NULL
	`)
	if err != nil {
		return nil, fmt.Errorf("error querying orphaned attachments: %w", err)
	}
	defer rows.Close()

	var attachments []Attachment
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.Filename, &a.OriginalName, &a.ContentType, &a.FileSize, &a.CreatedAt); err != nil {
			slog.Error("error scanning orphaned attachment", "error", err)
			continue
		}
		attachments = append(attachments, a)
	}
	return attachments, nil
}

func DeleteAttachmentLinks(filename string) error {
	_, err := sqlite.DB.Exec("DELETE FROM note_attachments WHERE filename = ?", filename)
	if err != nil {
		return fmt.Errorf("error deleting attachment links: %w", err)
	}
	return nil
}

func GetAllAttachmentsPaginated(page int, tagID int, focusID int) ([]Attachment, int, error) {
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * ATTACHMENTS_LIMIT

	var total int
	var attachments []Attachment

	if tagID != 0 {
		// Filter by tag: join note_attachments + note_tags
		err := sqlite.DB.QueryRow(`
			SELECT COUNT(DISTINCT a.filename)
			FROM attachments a
			JOIN note_attachments na ON a.filename = na.filename
			JOIN note_tags nt ON na.note_id = nt.note_id
			WHERE nt.tag_id = ?
		`, tagID).Scan(&total)
		if err != nil {
			return nil, 0, fmt.Errorf("error counting attachments by tag: %w", err)
		}

		rows, err := sqlite.DB.Query(`
			SELECT DISTINCT a.filename, a.original_name, a.content_type, a.file_size, a.created_at
			FROM attachments a
			JOIN note_attachments na ON a.filename = na.filename
			JOIN note_tags nt ON na.note_id = nt.note_id
			WHERE nt.tag_id = ?
			ORDER BY a.created_at DESC
			LIMIT ? OFFSET ?
		`, tagID, ATTACHMENTS_LIMIT, offset)
		if err != nil {
			return nil, 0, fmt.Errorf("error querying attachments by tag: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var a Attachment
			if err := rows.Scan(&a.Filename, &a.OriginalName, &a.ContentType, &a.FileSize, &a.CreatedAt); err != nil {
				slog.Error("error scanning attachment", "error", err)
				continue
			}
			a.LinkedNotes = getLinkedNotes(a.Filename)
			a.URL = storage.GetAttachmentURL(a.Filename)
			a.Storage = detectStorage(a.Filename)
			attachments = append(attachments, a)
		}
	} else if focusID != 0 {
		// Filter by focus mode: join note_attachments + note_tags + focus_mode_tags
		err := sqlite.DB.QueryRow(`
			SELECT COUNT(DISTINCT a.filename)
			FROM attachments a
			JOIN note_attachments na ON a.filename = na.filename
			JOIN note_tags nt ON na.note_id = nt.note_id
			JOIN focus_mode_tags fmt ON nt.tag_id = fmt.tag_id
			WHERE fmt.focus_mode_id = ?
		`, focusID).Scan(&total)
		if err != nil {
			return nil, 0, fmt.Errorf("error counting attachments by focus: %w", err)
		}

		rows, err := sqlite.DB.Query(`
			SELECT DISTINCT a.filename, a.original_name, a.content_type, a.file_size, a.created_at
			FROM attachments a
			JOIN note_attachments na ON a.filename = na.filename
			JOIN note_tags nt ON na.note_id = nt.note_id
			JOIN focus_mode_tags fmt ON nt.tag_id = fmt.tag_id
			WHERE fmt.focus_mode_id = ?
			ORDER BY a.created_at DESC
			LIMIT ? OFFSET ?
		`, focusID, ATTACHMENTS_LIMIT, offset)
		if err != nil {
			return nil, 0, fmt.Errorf("error querying attachments by focus: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var a Attachment
			if err := rows.Scan(&a.Filename, &a.OriginalName, &a.ContentType, &a.FileSize, &a.CreatedAt); err != nil {
				slog.Error("error scanning attachment", "error", err)
				continue
			}
			a.LinkedNotes = getLinkedNotes(a.Filename)
			a.URL = storage.GetAttachmentURL(a.Filename)
			a.Storage = detectStorage(a.Filename)
			attachments = append(attachments, a)
		}
	} else {
		// No filter: all attachments
		err := sqlite.DB.QueryRow("SELECT COUNT(*) FROM attachments").Scan(&total)
		if err != nil {
			return nil, 0, fmt.Errorf("error counting attachments: %w", err)
		}

		rows, err := sqlite.DB.Query(`
			SELECT filename, original_name, content_type, file_size, created_at
			FROM attachments ORDER BY created_at DESC
			LIMIT ? OFFSET ?
		`, ATTACHMENTS_LIMIT, offset)
		if err != nil {
			return nil, 0, fmt.Errorf("error querying attachments: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var a Attachment
			if err := rows.Scan(&a.Filename, &a.OriginalName, &a.ContentType, &a.FileSize, &a.CreatedAt); err != nil {
				slog.Error("error scanning attachment", "error", err)
				continue
			}
			a.LinkedNotes = getLinkedNotes(a.Filename)
			a.URL = storage.GetAttachmentURL(a.Filename)
			a.Storage = detectStorage(a.Filename)
			attachments = append(attachments, a)
		}
	}
	return attachments, total, nil
}

func getLinkedNotes(filename string) []NoteRef {
	seen := make(map[int]bool)
	var refs []NoteRef

	// 1. From note_attachments table
	rows, err := sqlite.DB.Query(`
		SELECT n.note_id, n.title
		FROM note_attachments na
		JOIN notes n ON na.note_id = n.note_id
		WHERE na.filename = ?
		ORDER BY n.updated_at DESC
	`, filename)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ref NoteRef
			if err := rows.Scan(&ref.NoteID, &ref.Title); err != nil {
				continue
			}
			if !seen[ref.NoteID] {
				seen[ref.NoteID] = true
				ref.Tags = getNoteTags(ref.NoteID)
				refs = append(refs, ref)
			}
		}
	}

	// 2. From note content (scan for /attachments/filename references)
	pattern := "/attachments/" + filename
	contentRows, err := sqlite.DB.Query(`
		SELECT note_id, title FROM notes
		WHERE deleted_at IS NULL AND content LIKE ?
	`, "%"+pattern+"%")
	if err == nil {
		defer contentRows.Close()
		for contentRows.Next() {
			var ref NoteRef
			if err := contentRows.Scan(&ref.NoteID, &ref.Title); err != nil {
				continue
			}
			if !seen[ref.NoteID] {
				seen[ref.NoteID] = true
				ref.Tags = getNoteTags(ref.NoteID)
				refs = append(refs, ref)
			}
		}
	}

	return refs
}

func getNoteTags(noteID int) []TagBrief {
	rows, err := sqlite.DB.Query(`
		SELECT t.tag_id, t.name, COALESCE(t.color, '')
		FROM note_tags nt
		JOIN tags t ON nt.tag_id = t.tag_id
		WHERE nt.note_id = ?
	`, noteID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var tags []TagBrief
	for rows.Next() {
		var tag TagBrief
		if err := rows.Scan(&tag.TagID, &tag.Name, &tag.Color); err != nil {
			continue
		}
		tags = append(tags, tag)
	}
	return tags
}

func detectStorage(filename string) string {
	localPath := filepath.Join("attachments", filename)
	if _, err := os.Stat(localPath); err == nil {
		return "local"
	}
	if storage.IsS3Enabled() {
		return "s3"
	}
	return "local"
}
