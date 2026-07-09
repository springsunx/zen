package clipboard

import (
	"fmt"
	"path/filepath"
	"strings"
	"zen/features/storage"
)

// ClipboardMessage represents a single clipboard entry (text or file).
type ClipboardMessage struct {
	ID           int    `json:"id"`
	Type         string `json:"type"` // "text" | "file"
	Content      string `json:"content,omitempty"`
	Filename     string `json:"filename,omitempty"`
	OriginalName string `json:"originalName,omitempty"`
	ContentType  string `json:"contentType,omitempty"`
	FileSize     int64  `json:"fileSize,omitempty"`
	URL          string `json:"url,omitempty"`
	BatchID      string `json:"batchId,omitempty"`
	CreatedAt    string `json:"createdAt"`
}

const CLIPBOARD_LIMIT = 50

// rowScanner is satisfied by both *sql.Row and *sql.Rows.
type rowScanner interface {
	Scan(dest ...interface{}) error
}

// scanMessage scans a row into a ClipboardMessage and sets the URL for file types.
func scanMessage(s rowScanner) (ClipboardMessage, error) {
	var msg ClipboardMessage
	err := s.Scan(&msg.ID, &msg.Type, &msg.Content, &msg.Filename,
		&msg.OriginalName, &msg.ContentType, &msg.FileSize, &msg.CreatedAt, &msg.BatchID)
	if err != nil {
		return ClipboardMessage{}, fmt.Errorf("scan clipboard message: %w", err)
	}
	if msg.Type == "file" && msg.Filename != "" {
		msg.URL = "/api/clipboard/file/" + msg.Filename
	}
	return msg, nil
}

// isImageFile checks whether a filename has an image extension.
func isImageFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif":
		return true
	default:
		return false
	}
}

// fileProvider returns the appropriate storage provider for a filename.
// Images use the image provider; all other files use the attachment provider.
func fileProvider(filename string) storage.Provider {
	if isImageFile(filename) {
		return storage.GetProvider()
	}
	return storage.GetAttachmentProvider()
}

// messageColumns is the common SELECT column list used in all clipboard queries.
const messageColumns = `id, type, COALESCE(content,''), COALESCE(filename,''),
	COALESCE(original_name,''), COALESCE(content_type,''), COALESCE(file_size,0), created_at, COALESCE(batch_id,'')`
