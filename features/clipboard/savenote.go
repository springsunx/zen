package clipboard

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"zen/commons/utils"
	"zen/features/attachments"
	"zen/features/images"
	"zen/features/notes"
	"zen/features/storage"
)

// HandleSaveAsNote creates a Zen note from a clipboard message.
// For files, the file is copied to permanent storage (images or attachments)
// so the note link remains valid even after the clipboard record is deleted.
// POST /api/clipboard/{id}/note/
func HandleSaveAsNote(w http.ResponseWriter, r *http.Request) {
	// Extract ID from URL: /api/clipboard/{id}/note/
	path := strings.TrimPrefix(r.URL.Path, "/api/clipboard/")
	path = strings.TrimSuffix(path, "/")
	path = strings.TrimSuffix(path, "/note")
	id, err := strconv.ParseInt(path, 10, 64)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_ID", "Invalid message ID.", err, http.StatusBadRequest)
		return
	}

	// Fetch clipboard message
	msg, err := getMessageByID(id)
	if err != nil {
		utils.SendErrorResponse(w, "NOT_FOUND", "Clipboard message not found.", err, http.StatusNotFound)
		return
	}

	// Build note title and content
	title, content, err := buildNoteContent(msg)
	if err != nil {
		utils.SendErrorResponse(w, "NOTE_BUILD_FAILED", "Error building note content.", err, http.StatusInternalServerError)
		return
	}

	noteInput := notes.Note{
		Title:   title,
		Content: content,
	}

	createdNote, err := notes.CreateNote(noteInput)
	if err != nil {
		utils.SendErrorResponse(w, "NOTE_CREATE_FAILED", "Error creating note.", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdNote)
}

// buildNoteContent generates the note title and content from a clipboard message.
// For file types, the file is copied to permanent storage (images or attachments)
// and the note uses the permanent URL.
func buildNoteContent(msg ClipboardMessage) (string, string, error) {
	if msg.Type == "text" {
		title := msg.Content
		runes := []rune(title)
		if len(runes) > 15 {
			title = string(runes[:15]) + "..."
		}
		return title, msg.Content, nil
	}

	// ── File type: copy to permanent storage ──
	permURL, _, err := copyToPermanentStorage(msg)
	if err != nil {
		return "", "", fmt.Errorf("copy to permanent storage: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(msg.OriginalName))
	isImg := ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif"

	var fileLink string
	if isImg {
		fileLink = fmt.Sprintf("![](%s)", permURL)
	} else {
		fileLink = fmt.Sprintf("[%s](%s)", msg.OriginalName, permURL)
	}

	// Title
	var title string
	if msg.Content != "" {
		runes := []rune(msg.Content)
		if len(runes) > 15 {
			title = string(runes[:15]) + "..."
		} else {
			title = msg.Content
		}
	} else {
		title = msg.OriginalName
		if title == "" {
			title = msg.Filename
		}
	}

	// Content
	var content string
	if msg.Content != "" {
		content = msg.Content + "\n\n" + fileLink
	} else {
		content = fileLink
	}

	// Update clipboard message with the permanent URL for reference
	_ = updateClipboardURL(int64(msg.ID), permURL)

	return title, content, nil
}

// copyToPermanentStorage reads a clipboard file and copies it to the permanent
// images or attachments storage, returning the permanent URL and file size.
func copyToPermanentStorage(msg ClipboardMessage) (string, int64, error) {
	ext := strings.ToLower(filepath.Ext(msg.OriginalName))
	isImg := ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif"

	// Read the clipboard file into memory
	data, err := readClipboardFile(msg.Filename)
	if err != nil {
		return "", 0, fmt.Errorf("read clipboard file: %w", err)
	}
	fileSize := int64(len(data))
	reader := bytes.NewReader(data)

	// Generate new unique filename
	newFilename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)

	if isImg {
		// ── Image: store via image provider and register in images table ──
		// Decode image to get dimensions
		_, _ = reader.Seek(0, io.SeekStart)
		imgConfig, format, decodeErr := image.DecodeConfig(reader)
		if decodeErr != nil {
			return "", 0, fmt.Errorf("decode image config: %w", decodeErr)
		}
		_, _ = reader.Seek(0, io.SeekStart)

		width := imgConfig.Width
		height := imgConfig.Height
		aspectRatio := float64(width) / float64(height)
		if height == 0 {
			aspectRatio = 1
		}

		provider := storage.GetProvider()
		if uploadErr := provider.Upload(newFilename, reader, fileSize, "image/"+format, nil); uploadErr != nil {
			return "", 0, fmt.Errorf("upload image: %w", uploadErr)
		}

		imgRecord := images.ImageRecord{
			Filename:    newFilename,
			Width:       width,
			Height:      height,
			Format:      format,
			AspectRatio: aspectRatio,
			FileSize:    fileSize,
		}

		if _, createErr := images.CreateImage(imgRecord); createErr != nil {
			// Clean up the uploaded file on DB error
			_ = provider.Delete(newFilename)
			return "", 0, fmt.Errorf("create image record: %w", createErr)
		}

		return storage.GetImageURL(newFilename), fileSize, nil
	}

	// ── Non-image file: store via attachment provider and register ──
	_, _ = reader.Seek(0, io.SeekStart)
	contentType := msg.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	provider := storage.GetAttachmentProvider()
	if uploadErr := provider.Upload(newFilename, reader, fileSize, contentType, nil); uploadErr != nil {
		return "", 0, fmt.Errorf("upload attachment: %w", uploadErr)
	}

	if _, createErr := attachments.CreateAttachment(newFilename, msg.OriginalName, contentType, fileSize); createErr != nil {
		_ = provider.Delete(newFilename)
		return "", 0, fmt.Errorf("create attachment record: %w", createErr)
	}

	return storage.GetAttachmentURL(newFilename), fileSize, nil
}

// readClipboardFile reads a clipboard file from storage into memory.
func readClipboardFile(filename string) ([]byte, error) {
	// Try local disks: images folder first, then attachments folder
	imagesDir := os.Getenv("IMAGES_FOLDER")
	if imagesDir == "" {
		imagesDir = "./images"
	}
	attachmentsDir := os.Getenv("ATTACHMENTS_FOLDER")
	if attachmentsDir == "" {
		attachmentsDir = "./attachments"
	}

	var data []byte
	var readErr error

	// Try images folder
	localPath := filepath.Join(imagesDir, filename)
	if data, readErr = os.ReadFile(localPath); readErr == nil {
		return data, nil
	}

	// Try attachments folder
	localPath = filepath.Join(attachmentsDir, filename)
	if data, readErr = os.ReadFile(localPath); readErr == nil {
		return data, nil
	}

	// Not found locally — try S3 if enabled
	if storage.IsS3Enabled() {
		// Try image provider first
		provider := storage.GetProvider()
		if s3p, ok := provider.(*storage.S3Provider); ok {
			if reader, dlErr := s3p.DownloadObject(filename); dlErr == nil {
				defer reader.Close()
				if data, readErr = io.ReadAll(reader); readErr == nil {
					return data, nil
				}
			}
		}
		// Try attachment provider
		provider = storage.GetAttachmentProvider()
		if s3p, ok := provider.(*storage.S3Provider); ok {
			if reader, dlErr := s3p.DownloadObject(filename); dlErr == nil {
				defer reader.Close()
				if data, readErr = io.ReadAll(reader); readErr == nil {
					return data, nil
				}
			}
		}
	}

	return nil, fmt.Errorf("file not found in any storage: %s", filename)
}

// updateClipboardURL stores the permanent URL back into the clipboard message
// (best-effort, non-fatal).
func updateClipboardURL(id int64, permURL string) error {
	// We don't have a permanent_url column, and the msg.URL field is computed.
	// This is a no-op for now; the note's content has the correct permanent link.
	return nil
}
