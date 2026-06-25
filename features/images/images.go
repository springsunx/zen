package images

import (
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
	"regexp"
	"strconv"
	"strings"
	"time"
	"zen/commons/queue"
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
	NoteID int    `json:"noteId"`
	Title  string `json:"title"`
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
	Filename    string           `json:"filename"`
	URL         string           `json:"url"`
	Width       int              `json:"width"`
	Height      int              `json:"height"`
	Format      string           `json:"format"`
	AspectRatio float64          `json:"aspectRatio"`
	FileSize    int64            `json:"fileSize"`
	Caption     *string          `json:"caption"`
	Storage     string           `json:"storage"`
	LinkedNotes []ImageLinkedNote `json:"linkedNotes"`
	CreatedAt   time.Time        `json:"createdAt"`
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
	page        int
	tagID       int
	focusModeID int
}

func NewImagesFilter(page, tagID, focusModeID int) ImagesFilter {
	return ImagesFilter{
		page:        page,
		tagID:       tagID,
		focusModeID: focusModeID,
	}
}

func HandleGetImages(w http.ResponseWriter, r *http.Request) {
	var allImages []Image
	var err error
	var total int

	pageStr := r.URL.Query().Get("page")
	tagIDStr := r.URL.Query().Get("tagId")
	focusModeIDStr := r.URL.Query().Get("focusId")

	page := 1
	tagID := 0
	focusModeID := 0

	if pageStr != "" {
		page, err = strconv.Atoi(pageStr)
		if err != nil {
			utils.SendErrorResponse(w, "INVALID_PAGE_NUMBER", "Invalid page number", err, http.StatusBadRequest)
			return
		}
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
		page:        page,
		tagID:       tagID,
		focusModeID: focusModeID,
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
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

	queue.AddImageTask(filename, queue.QUEUE_IMAGE_PROCESS, "process")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(image)
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
// URL format: DELETE /api/images/{filename}/
func HandleDeleteImage(w http.ResponseWriter, r *http.Request) {
    path := r.URL.Path
    idx := strings.Index(path, "/api/images/")
    if idx == -1 {
        utils.SendErrorResponse(w, "INVALID_PATH", "Invalid image delete path", fmt.Errorf("invalid path"), http.StatusBadRequest)
        return
    }
    rel := path[idx+len("/api/images/"):]
    rel = strings.TrimSuffix(rel, "/")
    if rel == "" {
        utils.SendErrorResponse(w, "INVALID_FILENAME", "Missing image filename", fmt.Errorf("missing filename"), http.StatusBadRequest)
        return
    }

    filename := rel

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

    w.WriteHeader(http.StatusNoContent)
}


// HandleCleanupImages cleans up image records and files.
// Local mode: registers disk files, rebuilds links, removes missing/orphaned files.
// S3 mode: registers note-referenced images, rebuilds links, deletes unused S3 files.
func HandleCleanupImages(w http.ResponseWriter, r *http.Request) {
	type result struct {
		RemovedMissing  int      `json:"removedMissing"`
		RemovedOrphans  int      `json:"removedOrphans"`
		Registered      int      `json:"registered"`
		LinksRebuilt    int      `json:"linksRebuilt"`
		MissingFiles    []string `json:"missingFiles"`
		OrphanFiles     []string `json:"orphanFiles"`
		RegisteredFiles []string `json:"registeredFiles"`
	}
	res := result{}
	isS3 := storage.IsS3Enabled()

	// ── Collect DB filenames ──
	dbFilenames := make(map[string]bool)
	forEachAllImages(func(im Image) error {
		dbFilenames[im.Filename] = true
		return nil
	})

	// ── Collect note image references ──
	referencedInContent := collectNoteImageRefs()

	// ── Collect existing note_images links ──
	existingLinks := collectExistingLinks()

	// ── Rebuild note_images links (shared by both modes) ──
	for filename, noteIDs := range referencedInContent {
		for _, nid := range noteIDs {
			if existingLinks[filename] != nil && existingLinks[filename][nid] {
				continue
			}
			if LinkImageToNote(nid, filename) == nil {
				res.LinksRebuilt++
			}
		}
	}

	if isS3 {
		// ── S3: Register note-referenced images missing from DB ──
		for filename, noteIDs := range referencedInContent {
			if dbFilenames[filename] || !isImageFile(filename) {
				continue
			}
			if _, err := CreateImage(ImageRecord{Filename: filename}); err == nil {
				res.Registered++
				res.RegisteredFiles = append(res.RegisteredFiles, filename)
			}
			for _, nid := range noteIDs {
				_ = LinkImageToNote(nid, filename)
			}
		}

		// ── S3: Delete unused DB records and S3 files ──
		s3provider := storage.GetProvider()
		forEachAllImages(func(im Image) error {
			if len(referencedInContent[im.Filename]) > 0 {
				return nil
			}
			_ = s3provider.Delete(im.Filename)
			_ = DeleteImageLinks(im.Filename)
			_ = DeleteImage(im.Filename)
			res.RemovedOrphans++
			res.OrphanFiles = append(res.OrphanFiles, im.Filename)
			return nil
		})
	} else {
		// ── Local: Register disk files missing from DB ──
		imagesDir := os.Getenv("IMAGES_FOLDER")
		if imagesDir == "" {
			imagesDir = "./images"
		}
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
				_ = DeleteImageLinks(im.Filename)
				_ = DeleteImage(im.Filename)
				res.RemovedOrphans++
				res.OrphanFiles = append(res.OrphanFiles, im.Filename)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// ── Helpers ──

var imageRefRegex = regexp.MustCompile(`!\[.*?\]\(/images/([^)]+)\)`)

func forEachAllImages(fn func(Image) error) {
	for page := 1; ; page++ {
		imgs, _, err := GetAllImages(NewImagesFilter(page, 0, 0))
		if err != nil || len(imgs) == 0 {
			return
		}
		for _, im := range imgs {
			_ = fn(im)
		}
		if len(imgs) < IMAGES_LIMIT {
			return
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

func collectExistingLinks() map[string]map[int]bool {
	links := make(map[string]map[int]bool)
	forEachAllImages(func(im Image) error {
		noteIDs, err := GetLinkedNotesByImage(im.Filename)
		if err != nil {
			return nil
		}
		if links[im.Filename] == nil {
			links[im.Filename] = make(map[int]bool)
		}
		for _, nid := range noteIDs {
			links[im.Filename][nid] = true
		}
		return nil
	})
	return links
}
