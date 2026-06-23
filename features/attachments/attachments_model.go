package attachments

import (
	"fmt"
	"log/slog"
	"zen/commons/sqlite"
	"zen/features/storage"
)

type Attachment struct {
	Filename     string `json:"filename"`
	OriginalName string `json:"originalName"`
	ContentType  string `json:"contentType"`
	FileSize     int64  `json:"fileSize"`
	URL          string `json:"url"`
	CreatedAt    string `json:"createdAt"`
}

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
