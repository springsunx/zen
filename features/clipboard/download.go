package clipboard

import (
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"zen/commons/sqlite"
	"zen/features/storage"
)

// HandleDownloadFile serves a clipboard file for download.
// This is a PUBLIC route (no auth), matching the pattern of /images/ and /attachments/.
func HandleDownloadFile(w http.ResponseWriter, r *http.Request) {
	// Extract filename from URL path: /api/clipboard/file/{filename}
	filename := strings.TrimPrefix(r.URL.Path, "/api/clipboard/file/")
	filename = strings.TrimSuffix(filename, "/")
	if filename == "" {
		http.NotFound(w, r)
		return
	}

	// Get the original filename from DB for the Content-Disposition header
	var originalName string
	err := sqlite.DB.QueryRow(
		"SELECT COALESCE(original_name, '') FROM clipboard_messages WHERE filename = ?",
		filename,
	).Scan(&originalName)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	// Try local disks: images folder first, then attachments folder
	imagesDir := os.Getenv("IMAGES_FOLDER")
	if imagesDir == "" {
		imagesDir = "./images"
	}
	attachmentsDir := os.Getenv("ATTACHMENTS_FOLDER")
	if attachmentsDir == "" {
		attachmentsDir = "./attachments"
	}

	var localPath string
	var found bool
	if isImageFile(filename) {
		localPath = filepath.Join(imagesDir, filename)
		if _, statErr := os.Stat(localPath); statErr == nil {
			found = true
		}
	}
	if !found {
		localPath = filepath.Join(attachmentsDir, filename)
		if _, statErr := os.Stat(localPath); statErr == nil {
			found = true
		}
	}
	if found {
		if originalName != "" {
			w.Header().Set("Content-Disposition", storage.ContentDisposition(originalName))
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000")
		http.ServeFile(w, r, localPath)
		return
	}

	// File not on disk — if S3 is enabled, proxy from S3
	if storage.IsS3Enabled() {
		// Try image provider first, then attachment provider
		var providers []storage.Provider
		if isImageFile(filename) {
			providers = append(providers, storage.GetProvider())
		}
		providers = append(providers, storage.GetAttachmentProvider())

		for _, provider := range providers {
			s3p, ok := provider.(*storage.S3Provider)
			if !ok {
				continue
			}
			reader, dlErr := s3p.DownloadObject(filename)
			if dlErr != nil {
				continue
			}
			defer reader.Close()
			if originalName != "" {
				w.Header().Set("Content-Disposition", storage.ContentDisposition(originalName))
			}
			w.Header().Set("Cache-Control", "public, max-age=31536000")
			io.Copy(w, reader)
			return
		}
		slog.Error("S3 download failed for all providers", "filename", filename)
	}

	http.NotFound(w, r)
}
