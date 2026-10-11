package images

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"zen/commons/queue"
	"zen/commons/sqlite"
	"zen/commons/utils"
	"zen/features/storage"
)

const IMAGES_LIMIT = 100

func isImageFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif":
		return true
	default:
		return false
	}
}

type ImagesResponseEnvelope struct {
	Images []Image `json:"images"`
	Total  int     `json:"total"`
}

type ImageNoteRef struct {
	NoteID     int    `json:"noteId"`
	Title      string `json:"title"`
	IsArchived bool   `json:"isArchived"`
	IsDeleted  bool   `json:"isDeleted"`
}

type ImageTagBrief struct {
	TagID int    `json:"tagId"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type ImageLinkedNote struct {
	ImageNoteRef
	Tags []ImageTagBrief `json:"tags"`
}

type Image struct {
	Filename    string            `json:"filename"`
	URL         string            `json:"url"`
	Width       int               `json:"width"`
	Height      int               `json:"height"`
	Format      string            `json:"format"`
	AspectRatio float64           `json:"aspectRatio"`
	FileSize    int64             `json:"fileSize"`
	Caption     *string           `json:"caption"`
	Storage     string            `json:"storage"`
	LinkedNotes []ImageLinkedNote `json:"linkedNotes"`
	CreatedAt   time.Time         `json:"createdAt"`
}

type ImageRecord struct {
	Filename    string
	Width       int
	Height      int
	Format      string
	AspectRatio float64
	FileSize    int64
	Caption     *string
}

type ImageInfo struct {
	Width       int
	Height      int
	Format      string
	AspectRatio float64
}

type ImagesFilter struct {
	page            int
	limit           int
	tagID           int
	focusModeID     int
	isArchived      bool
	includeArchived bool
	includeDeleted  bool
}

func NewImagesFilter(page, tagID, focusModeID int, isArchived ...bool) ImagesFilter {
	archived := false
	if len(isArchived) > 0 {
		archived = isArchived[0]
	}
	return ImagesFilter{
		page:        page,
		limit:       IMAGES_LIMIT,
		tagID:       tagID,
		focusModeID: focusModeID,
		isArchived:  archived,
	}
}

func HandleGetImages(w http.ResponseWriter, r *http.Request) {
	var allImages []Image
	var err error
	var total int

	pageStr := r.URL.Query().Get("page")
	tagIDStr := r.URL.Query().Get("tagId")
	focusModeIDStr := r.URL.Query().Get("focusId")
	isArchivedStr := r.URL.Query().Get("isArchived")
	includeArchivedStr := r.URL.Query().Get("includeArchived")
	includeDeletedStr := r.URL.Query().Get("includeDeleted")

	page := 1
	limit := IMAGES_LIMIT
	tagID := 0
	focusModeID := 0
	isArchived := isArchivedStr == "true"

	if pageStr != "" {
		page, err = strconv.Atoi(pageStr)
		if err != nil {
			utils.SendErrorResponse(w, "INVALID_PAGE_NUMBER", "Invalid page number", err, http.StatusBadRequest)
			return
		}
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		parsedLimit, parseErr := strconv.Atoi(limitStr)
		if parseErr != nil || parsedLimit < 1 || parsedLimit > IMAGES_LIMIT {
			utils.SendErrorResponse(w, "INVALID_PAGE_LIMIT", "Invalid image page limit", parseErr, http.StatusBadRequest)
			return
		}
		limit = parsedLimit
	}

	if tagIDStr != "" {
		tagID, err = strconv.Atoi(tagIDStr)
		if err != nil {
			utils.SendErrorResponse(w, "INVALID_TAG_ID", "Invalid tag ID", err, http.StatusBadRequest)
			return
		}
	}

	if focusModeIDStr != "" {
		focusModeID, err = strconv.Atoi(focusModeIDStr)
		if err != nil {
			utils.SendErrorResponse(w, "INVALID_FOCUS_ID", "Invalid focus mode ID", err, http.StatusBadRequest)
			return
		}
	}

	filter := ImagesFilter{
		page:            page,
		limit:           limit,
		tagID:           tagID,
		focusModeID:     focusModeID,
		isArchived:      isArchived,
		includeArchived: includeArchivedStr == "true",
		includeDeleted:  includeDeletedStr == "true",
	}

	allImages, total, err = GetAllImages(filter)

	if err != nil {
		utils.SendErrorResponse(w, "IMAGES_READ_FAILED", "Error fetching images.", err, http.StatusInternalServerError)
		return
	}

	response := ImagesResponseEnvelope{
		Images: allImages,
		Total:  total,
	}

	utils.SendJSON(w, http.StatusOK, response)
}

func HandleUploadImage(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(10 << 20) // Max 10MB
	if err != nil {
		err = fmt.Errorf("error parsing image: %w", err)
		utils.SendErrorResponse(w, "INVALID_IMAGE", "Invalid image file", err, http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("image")
	if err != nil {
		err = fmt.Errorf("error parsing image: %w", err)
		utils.SendErrorResponse(w, "INVALID_IMAGE", "Invalid image file", err, http.StatusBadRequest)
		return
	}
	defer file.Close()

	imageInfo, err := getImageInfo(file)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_IMAGE", "Invalid image format", err, http.StatusBadRequest)
		return
	}

	if _, err := file.Seek(0, 0); err != nil {
		err = fmt.Errorf("error resetting file pointer: %w", err)
		utils.SendErrorResponse(w, "IMAGE_UPLOAD_FAILED", "Error processing image", err, http.StatusInternalServerError)
		return
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), filepath.Ext(handler.Filename))
	provider := storage.GetProvider()

	// Determine content type
	contentType := handler.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if err := provider.Upload(filename, file, handler.Size, contentType, nil); err != nil {
		err = fmt.Errorf("error uploading image: %w", err)
		utils.SendErrorResponse(w, "IMAGE_UPLOAD_FAILED", "Error uploading image.", err, http.StatusInternalServerError)
		return
	}

	imageRecord := ImageRecord{
		Filename:    filename,
		Width:       imageInfo.Width,
		Height:      imageInfo.Height,
		Format:      imageInfo.Format,
		AspectRatio: imageInfo.AspectRatio,
		FileSize:    handler.Size,
		Caption:     nil,
	}

	image, err := CreateImage(imageRecord)
	if err != nil {
		err = fmt.Errorf("error creating image record: %w", err)
		utils.SendErrorResponse(w, "IMAGE_CREATE_FAILED", "Error saving image.", err, http.StatusInternalServerError)
		return
	}

	image.URL = storage.GetImageURL(filename)

	if _, err = queue.AddImageTask(filename, queue.QUEUE_IMAGE_PROCESS, "process"); err != nil {
		slog.Error(err.Error())
	}

	utils.SendJSON(w, http.StatusOK, image)
}

func getImageInfo(file io.Reader) (*ImageInfo, error) {
	img, format, err := image.Decode(file)
	if err != nil {
		return nil, fmt.Errorf("error decoding image: %w", err)
	}

	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	aspectRatio := float64(width) / float64(height)

	info := &ImageInfo{
		Width:       width,
		Height:      height,
		Format:      format,
		AspectRatio: aspectRatio,
	}

	return info, nil
}

// HandleDeleteImage deletes an image file and its DB record.
// URL format: DELETE /api/v1/images/{filename}/
func HandleDeleteImage(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if filename == "" {
		utils.SendErrorResponse(w, "INVALID_FILENAME", "Missing image filename", fmt.Errorf("missing filename"), http.StatusBadRequest)
		return
	}

	// pre-check references unless force=true
	force := r.URL.Query().Get("force") == "true"
	if !force {
		if linked, err := GetLinkedNotesByImage(filename); err == nil && len(linked) > 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]any{"code": "IMAGE_IN_USE", "message": "Image is referenced by notes", "referencedBy": linked})
			return
		}
	}

	// Remove note_images links first (avoid FK or logic inconsistencies)
	if err := DeleteImageLinks(filename); err != nil {
		utils.SendErrorResponse(w, "IMAGE_DELETE_FAILED", "Error deleting image links", err, http.StatusInternalServerError)
		return
	}

	// Delete physical file
	provider := storage.GetProvider()
	if err := provider.Delete(filename); err != nil {
		utils.SendErrorResponse(w, "IMAGE_DELETE_FAILED", "Error deleting image file", err, http.StatusInternalServerError)
		return
	}

	// Delete DB record
	if err := DeleteImage(filename); err != nil {
		utils.SendErrorResponse(w, "IMAGE_DELETE_FAILED", "Error deleting image record", err, http.StatusInternalServerError)
		return
	}
	_ = DeleteThumbnail(filename)

	w.WriteHeader(http.StatusNoContent)
}

// HandleCleanupImages cleans up image records and files.
// Local mode: registers disk files, removes missing/orphaned files.
// S3 mode: registers note-referenced images, deletes unused S3 files.
// Both modes: full rebuild of note_images links from note content.
func HandleCleanupImages(w http.ResponseWriter, r *http.Request) {
	type result struct {
		RemovedMissing  int      `json:"removedMissing"`
		RemovedOrphans  int      `json:"removedOrphans"`
		Registered      int      `json:"registered"`
		Updated         int      `json:"updated"`
		RemovedLocal    int      `json:"removedLocal"`
		LinksRebuilt    int      `json:"linksRebuilt"`
		MissingFiles    []string `json:"missingFiles"`
		OrphanFiles     []string `json:"orphanFiles"`
		LocalFiles      []string `json:"localFiles"`
		RegisteredFiles []string `json:"registeredFiles"`
	}
	res := result{}
	dryRun := r.URL.Query().Get("dryRun") == "true"
	isS3 := storage.IsS3Enabled()

	// ── Collect DB filenames ──
	dbFilenames := make(map[string]bool)
	forEachAllImages(func(im Image) error {
		dbFilenames[im.Filename] = true
		return nil
	})

	// ── Collect note image references ──
	referencedInContent := collectNoteImageRefs()

	if dryRun {
		if isS3 {
			// Once S3 is active, image files in the local image directory are
			// migration leftovers rather than active storage. Surface them for
			// confirmation instead of silently leaving them on disk.
			if localFiles, err := localImageFiles(); err != nil {
				slog.Warn("failed to scan local image leftovers", "error", err)
			} else {
				res.LocalFiles = append(res.LocalFiles, localFiles...)
			}
			s3p, _ := storage.GetProvider().(*storage.S3Provider)
			forEachAllImages(func(im Image) error {
				if len(referencedInContent[im.Filename]) == 0 {
					res.OrphanFiles = append(res.OrphanFiles, im.Filename)
					return nil
				}
				if s3p == nil {
					return nil
				}
				exists, existsErr := s3p.ObjectExists(im.Filename)
				if existsErr != nil {
					slog.Warn("failed to check S3 image", "filename", im.Filename, "error", existsErr)
					return nil
				}
				if !exists {
					res.MissingFiles = append(res.MissingFiles, im.Filename)
				}
				return nil
			})
		} else {
			imagesDir := os.Getenv("IMAGES_FOLDER")
			if imagesDir == "" {
				imagesDir = "./images"
			}
			forEachAllImages(func(im Image) error {
				if _, err := os.Stat(filepath.Join(imagesDir, im.Filename)); err != nil {
					res.MissingFiles = append(res.MissingFiles, im.Filename)
				}
				return nil
			})
			if orphans, err := GetOrphanedImages(); err == nil {
				for _, im := range orphans {
					if len(referencedInContent[im.Filename]) == 0 {
						res.OrphanFiles = append(res.OrphanFiles, im.Filename)
					}
				}
			}
		}
		sort.Strings(res.MissingFiles)
		sort.Strings(res.OrphanFiles)
		sort.Strings(res.LocalFiles)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
		return
	}

	if isS3 {
		// ── S3: Register note-referenced images that still exist in storage ──
		s3provider := storage.GetProvider()
		s3p, _ := s3provider.(*storage.S3Provider)
		for filename := range referencedInContent {
			if dbFilenames[filename] || !isImageFile(filename) {
				continue
			}
			if s3p == nil {
				continue
			}
			exists, existsErr := s3p.ObjectExists(filename)
			if existsErr != nil {
				slog.Warn("failed to check S3 image", "filename", filename, "error", existsErr)
				continue
			}
			if !exists {
				continue
			}
			record, recordErr := imageRecordFromS3(s3p, filename)
			if recordErr != nil {
				slog.Warn("failed to read S3 image", "filename", filename, "error", recordErr)
				continue
			}
			if _, err := CreateImage(record); err == nil {
				res.Registered++
				res.RegisteredFiles = append(res.RegisteredFiles, filename)
			}
		}

		// ── S3: Delete unused and missing DB records ──
		forEachAllImages(func(im Image) error {
			if len(referencedInContent[im.Filename]) > 0 {
				if s3p == nil {
					return nil
				}
				exists, existsErr := s3p.ObjectExists(im.Filename)
				if existsErr != nil {
					slog.Warn("failed to check S3 image", "filename", im.Filename, "error", existsErr)
					return nil
				}
				if exists {
					if im.Width > 0 && im.Height > 0 && im.FileSize > 0 && im.Format != "" {
						return nil
					}
					record, recordErr := imageRecordFromS3(s3p, im.Filename)
					if recordErr != nil {
						slog.Warn("failed to read S3 image metadata", "filename", im.Filename, "error", recordErr)
						return nil
					}
					if err := UpdateImageMetadata(record); err != nil {
						slog.Warn("failed to update S3 image metadata", "filename", im.Filename, "error", err)
						return nil
					}
					res.Updated++
					return nil
				}
				_ = DeleteImageLinks(im.Filename)
				_ = DeleteImage(im.Filename)
				_ = DeleteThumbnail(im.Filename)
				res.RemovedMissing++
				res.MissingFiles = append(res.MissingFiles, im.Filename)
				return nil
			}
			_ = s3provider.Delete(im.Filename)
			_ = DeleteImageLinks(im.Filename)
			_ = DeleteImage(im.Filename)
			res.RemovedOrphans++
			res.OrphanFiles = append(res.OrphanFiles, im.Filename)
			return nil
		})

		// S3 is the active image store in this mode. Remove local source files
		// left behind by an S3 migration after the user confirms the preview.
		if localFiles, err := localImageFiles(); err != nil {
			slog.Warn("failed to scan local image leftovers", "error", err)
		} else {
			imagesDir := localImagesDir()
			for _, filename := range localFiles {
				if err := os.Remove(filepath.Join(imagesDir, filename)); err != nil {
					slog.Warn("failed to remove local image leftover", "filename", filename, "error", err)
					continue
				}
				res.RemovedLocal++
				res.LocalFiles = append(res.LocalFiles, filename)
			}
		}
	} else {
		// ── Local: Register disk files missing from DB ──
		imagesDir := localImagesDir()
		if entries, err := os.ReadDir(imagesDir); err == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					continue
				}
				fname := entry.Name()
				if dbFilenames[fname] || !isImageFile(fname) {
					continue
				}
				fullPath := filepath.Join(imagesDir, fname)
				f, openErr := os.Open(fullPath)
				if openErr != nil {
					continue
				}
				info, imgErr := getImageInfo(f)
				f.Close()
				if imgErr != nil {
					continue
				}
				fi, statErr := entry.Info()
				if statErr != nil {
					continue
				}
				ext := strings.ToLower(filepath.Ext(fname))
				record := ImageRecord{
					Filename:    fname,
					Width:       info.Width,
					Height:      info.Height,
					Format:      strings.TrimPrefix(ext, "."),
					AspectRatio: info.AspectRatio,
					FileSize:    fi.Size(),
				}
				if _, err := CreateImage(record); err == nil {
					res.Registered++
					res.RegisteredFiles = append(res.RegisteredFiles, fname)
				}
			}
		}

		// ── Local: Remove DB records with missing files ──
		forEachAllImages(func(im Image) error {
			path := filepath.Join(imagesDir, im.Filename)
			if _, err := os.Stat(path); err != nil {
				_ = DeleteImageLinks(im.Filename)
				_ = DeleteImage(im.Filename)
				res.RemovedMissing++
				res.MissingFiles = append(res.MissingFiles, im.Filename)
			}
			return nil
		})

		// ── Local: Remove orphaned files ──
		if orphans, e := GetOrphanedImages(); e == nil {
			for _, im := range orphans {
				if len(referencedInContent[im.Filename]) > 0 {
					continue
				}
				_ = os.Remove(filepath.Join(imagesDir, im.Filename))
				_ = DeleteThumbnail(im.Filename)
				_ = DeleteImageLinks(im.Filename)
				_ = DeleteImage(im.Filename)
				res.RemovedOrphans++
				res.OrphanFiles = append(res.OrphanFiles, im.Filename)
			}
		}
	}

	// ── Rebuild image links for files that still have valid records ──
	// A deleted image can still have Markdown left in a note. Do not recreate a
	// dangling DB link for it just because that stale Markdown is present.
	validImages := make(map[string]bool)
	forEachAllImages(func(im Image) error {
		validImages[im.Filename] = true
		return nil
	})
	_, _ = sqlite.DB.Exec("DELETE FROM note_images")
	for filename, noteIDs := range referencedInContent {
		if !validImages[filename] {
			continue
		}
		for _, nid := range noteIDs {
			if LinkImageToNote(nid, filename) == nil {
				res.LinksRebuilt++
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func localImagesDir() string {
	if imagesDir := os.Getenv("IMAGES_FOLDER"); imagesDir != "" {
		return imagesDir
	}
	return "./images"
}

func localImageFiles() ([]string, error) {
	entries, err := os.ReadDir(localImagesDir())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	filenames := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && isImageFile(entry.Name()) {
			filenames = append(filenames, entry.Name())
		}
	}
	return filenames, nil
}

func imageRecordFromS3(provider *storage.S3Provider, filename string) (ImageRecord, error) {
	reader, err := provider.DownloadObject(filename)
	if err != nil {
		return ImageRecord{}, err
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return ImageRecord{}, err
	}
	if len(data) == 0 {
		return ImageRecord{}, fmt.Errorf("S3 image is empty")
	}

	info, err := getImageInfo(bytes.NewReader(data))
	if err != nil {
		return ImageRecord{}, err
	}
	return ImageRecord{
		Filename:    filename,
		Width:       info.Width,
		Height:      info.Height,
		Format:      info.Format,
		AspectRatio: info.AspectRatio,
		FileSize:    int64(len(data)),
	}, nil
}

// ── Helpers ──

var imageRefRegex = regexp.MustCompile(`!\[.*?\]\(/images/([^)]+)\)`)

func forEachAllImages(fn func(Image) error) {
	rows, err := sqlite.DB.Query(`
		SELECT filename, width, height, format, aspect_ratio, file_size, caption, created_at
		FROM images
	`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var image Image
		if rows.Scan(&image.Filename, &image.Width, &image.Height, &image.Format, &image.AspectRatio, &image.FileSize, &image.Caption, &image.CreatedAt) == nil {
			if fn(image) != nil {
				return
			}
		}
	}
}

func collectNoteImageRefs() map[string][]int {
	refs := make(map[string][]int)
	notes, err := GetAllNoteContents()
	if err != nil {
		return refs
	}
	for _, note := range notes {
		for _, m := range imageRefRegex.FindAllStringSubmatch(note.Content, -1) {
			if len(m) > 1 {
				refs[m[1]] = append(refs[m[1]], note.NoteID)
			}
		}
	}
	return refs
}
