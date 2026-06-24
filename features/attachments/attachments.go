package attachments

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"zen/commons/sqlite"
	"zen/commons/utils"
	"zen/features/storage"
)

func HandleUploadAttachment(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(50 << 20) // Max 50MB
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_FILE", "Invalid file.", err, http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_FILE", "Invalid file.", err, http.StatusBadRequest)
		return
	}
	defer file.Close()

	originalName := handler.Filename
	contentType := handler.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Generate unique filename preserving extension
	ext := filepath.Ext(originalName)
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)

	provider := storage.GetAttachmentProvider()
	if err := provider.Upload(filename, file, handler.Size, contentType, nil); err != nil {
		utils.SendErrorResponse(w, "ATTACHMENT_UPLOAD_FAILED", "Error uploading attachment.", err, http.StatusInternalServerError)
		return
	}

	// If noteId is provided, link attachment to note
	if noteIDStr := r.FormValue("noteId"); noteIDStr != "" {
		var noteID int
		if _, scanErr := fmt.Sscanf(noteIDStr, "%d", &noteID); scanErr == nil {
			_ = LinkAttachmentToNote(noteID, filename)
		}
	}

	attachment, err := CreateAttachment(filename, originalName, contentType, handler.Size)
	if err != nil {
		utils.SendErrorResponse(w, "ATTACHMENT_CREATE_FAILED", "Error saving attachment record.", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(attachment)
}

func HandleDeleteAttachment(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	idx := strings.Index(path, "/api/attachments/")
	if idx == -1 {
		utils.SendErrorResponse(w, "INVALID_PATH", "Invalid attachment path.", fmt.Errorf("invalid path"), http.StatusBadRequest)
		return
	}

	remainder := path[idx+len("/api/attachments/"):]
	filename := strings.TrimSuffix(remainder, "/")
	if filename == "" {
		utils.SendErrorResponse(w, "INVALID_FILENAME", "Filename is required.", fmt.Errorf("empty filename"), http.StatusBadRequest)
		return
	}

	provider := storage.GetAttachmentProvider()
	if err := provider.Delete(filename); err != nil {
		utils.SendErrorResponse(w, "ATTACHMENT_DELETE_FAILED", "Error deleting attachment file.", err, http.StatusInternalServerError)
		return
	}

	if err := DeleteAttachment(filename); err != nil {
		utils.SendErrorResponse(w, "ATTACHMENT_DELETE_FAILED", "Error deleting attachment record.", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type AttachmentsResponse struct {
	Attachments []Attachment `json:"attachments"`
	Total       int          `json:"total"`
}

func HandleGetAttachments(w http.ResponseWriter, r *http.Request) {
	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if parsed, err := fmt.Sscanf(p, "%d", &page); parsed != 1 || err != nil || page < 1 {
			page = 1
		}
	}

	tagID := 0
	if t := r.URL.Query().Get("tagId"); t != "" {
		fmt.Sscanf(t, "%d", &tagID)
	}
	focusID := 0
	if f := r.URL.Query().Get("focusId"); f != "" {
		fmt.Sscanf(f, "%d", &focusID)
	}

	attachments, total, err := GetAllAttachmentsPaginated(page, tagID, focusID)
	if err != nil {
		utils.SendErrorResponse(w, "ATTACHMENTS_FETCH_FAILED", "Error fetching attachments.", err, http.StatusInternalServerError)
		return
	}
	if attachments == nil {
		attachments = []Attachment{}
	}

	resp := AttachmentsResponse{
		Attachments: attachments,
		Total:       total,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

type CleanupResult struct {
	LinksRebuilt   int      `json:"linksRebuilt"`
	RemovedOrphans int      `json:"removedOrphans"`
	OrphanFiles    []string `json:"orphanFiles"`
}

func HandleCleanupAttachments(w http.ResponseWriter, r *http.Request) {
	var res CleanupResult
	attachmentRegex := regexp.MustCompile(`\[.*?\]\(/attachments/([^)]+)\)`)

	// Get all note contents
	type noteContent struct {
		NoteID  int
		Content string
	}
	var allNotes []noteContent
	rows, err := sqlite.DB.Query("SELECT note_id, content FROM notes WHERE deleted_at IS NULL")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var nc noteContent
			if err := rows.Scan(&nc.NoteID, &nc.Content); err != nil {
				continue
			}
			allNotes = append(allNotes, nc)
		}
	}

	// Clear all existing note_attachments links, then rebuild from content
	_, _ = sqlite.DB.Exec("DELETE FROM note_attachments")

	for _, note := range allNotes {
		matches := attachmentRegex.FindAllStringSubmatch(note.Content, -1)
		for _, m := range matches {
			if len(m) > 1 {
				filename := m[1]
				if LinkAttachmentToNote(note.NoteID, filename) == nil {
					res.LinksRebuilt++
				}
			}
		}
	}

	// Remove orphaned attachments (no links in note_attachments after rebuild)
	orphans, err := GetOrphanedAttachments()
	if err == nil {
		provider := storage.GetAttachmentProvider()
		for _, att := range orphans {
			_ = provider.Delete(att.Filename)
			_ = DeleteAttachment(att.Filename)
			res.RemovedOrphans++
			res.OrphanFiles = append(res.OrphanFiles, att.Filename)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}
