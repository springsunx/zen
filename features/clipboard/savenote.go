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
func HandleSaveAsNote(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/clipboard/")
	path = strings.TrimSuffix(path, "/")
	path = strings.TrimSuffix(path, "/note")
	id, err := strconv.ParseInt(path, 10, 64)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_ID", "Invalid message ID.", err, http.StatusBadRequest)
		return
	}

	msg, err := getMessageByID(id)
	if err != nil {
		utils.SendErrorResponse(w, "NOT_FOUND", "Clipboard message not found.", err, http.StatusNotFound)
		return
	}

	title, content, err := buildNoteContent(msg)
	if err != nil {
		utils.SendErrorResponse(w, "NOTE_BUILD_FAILED", "Error building note content.", err, http.StatusInternalServerError)
		return
	}

	createdNote, err := notes.CreateNote(notes.Note{Title: title, Content: content})
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
		runes := []rune(msg.Content)
		title := msg.Content
		if len(runes) > 15 {
			title = string(runes[:15]) + "..."
		}
		return title, msg.Content, nil
	}

	permURL, _, err := copyToPermanentStorage(msg)
	if err != nil {
		return "", "", fmt.Errorf("copy to permanent storage: %w", err)
	}

	isImg := isImageFile(msg.OriginalName)
	var fileLink string
	if isImg {
		fileLink = fmt.Sprintf("![](%s)", permURL)
	} else {
		fileLink = fmt.Sprintf("[%s](%s)", msg.OriginalName, permURL)
	}

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

	content := fileLink
	if msg.Content != "" {
		content = msg.Content + "\n\n" + fileLink
	}

	return title, content, nil
}

// copyToPermanentStorage reads a clipboard file and copies it to the permanent
// images or attachments storage, returning the permanent URL and file size.
func copyToPermanentStorage(msg ClipboardMessage) (string, int64, error) {
	isImg := isImageFile(msg.OriginalName)

	data, err := readClipboardFile(msg.Filename)
	if err != nil {
		return "", 0, fmt.Errorf("read clipboard file: %w", err)
	}
	fileSize := int64(len(data))
	reader := bytes.NewReader(data)

	newFilename := fmt.Sprintf("%d%s", time.Now().UnixNano(), filepath.Ext(msg.OriginalName))

	if isImg {
		_, _ = reader.Seek(0, io.SeekStart)
		imgConfig, format, decodeErr := image.DecodeConfig(reader)
		if decodeErr != nil {
			return "", 0, fmt.Errorf("decode image config: %w", decodeErr)
		}
		_, _ = reader.Seek(0, io.SeekStart)

		aspectRatio := float64(imgConfig.Width) / float64(imgConfig.Height)
		if imgConfig.Height == 0 {
			aspectRatio = 1
		}

		provider := storage.GetProvider()
		if uploadErr := provider.Upload(newFilename, reader, fileSize, "image/"+format, nil); uploadErr != nil {
			return "", 0, fmt.Errorf("upload image: %w", uploadErr)
		}

		_, createErr := images.CreateImage(images.ImageRecord{
			Filename:    newFilename,
			Width:       imgConfig.Width,
			Height:      imgConfig.Height,
			Format:      format,
			AspectRatio: aspectRatio,
			FileSize:    fileSize,
		})
		if createErr != nil {
			_ = provider.Delete(newFilename)
			return "", 0, fmt.Errorf("create image record: %w", createErr)
		}

		return storage.GetImageURL(newFilename), fileSize, nil
	}

	_, _ = reader.Seek(0, io.SeekStart)
	contentType := msg.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	provider := storage.GetAttachmentProvider()
	if uploadErr := provider.Upload(newFilename, reader, fileSize, contentType, nil); uploadErr != nil {
		return "", 0, fmt.Errorf("upload attachment: %w", uploadErr)
	}

	_, createErr := attachments.CreateAttachment(newFilename, msg.OriginalName, contentType, fileSize)
	if createErr != nil {
		_ = provider.Delete(newFilename)
		return "", 0, fmt.Errorf("create attachment record: %w", createErr)
	}

	return storage.GetAttachmentURL(newFilename), fileSize, nil
}

// readClipboardFile reads a clipboard file from storage into memory.
func readClipboardFile(filename string) ([]byte, error) {
	imagesDir := os.Getenv("IMAGES_FOLDER")
	if imagesDir == "" {
		imagesDir = "./images"
	}
	attachmentsDir := os.Getenv("ATTACHMENTS_FOLDER")
	if attachmentsDir == "" {
		attachmentsDir = "./attachments"
	}

	for _, dir := range []string{imagesDir, attachmentsDir} {
		if data, err := os.ReadFile(filepath.Join(dir, filename)); err == nil {
			return data, nil
		}
	}

	// Not found locally — try S3 if enabled
	if storage.IsS3Enabled() {
		for _, getProvider := range []func() storage.Provider{storage.GetProvider, storage.GetAttachmentProvider} {
			if s3p, ok := getProvider().(*storage.S3Provider); ok {
				if reader, dlErr := s3p.DownloadObject(filename); dlErr == nil {
					defer reader.Close()
					if data, readErr := io.ReadAll(reader); readErr == nil {
						return data, nil
					}
				}
			}
		}
	}

	return nil, fmt.Errorf("file not found: %s", filename)
}
