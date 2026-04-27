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
)

const IMAGES_LIMIT = 100

type ImagesResponseEnvelope struct {
	Images []Image `json:"images"`
	Total  int     `json:"total"`
}

type Image struct {
	Filename    string    `json:"filename"`
	Width       int       `json:"width"`
	Height      int       `json:"height"`
	Format      string    `json:"format"`
	AspectRatio float64   `json:"aspectRatio"`
	FileSize    int64     `json:"fileSize"`
	Caption     *string   `json:"caption"`
	CreatedAt   time.Time `json:"createdAt"`
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
	filepath := filepath.Join("images", filename)

	dst, err := os.Create(filepath)
	if err != nil {
		err = fmt.Errorf("error creating image file: %w", err)
		utils.SendErrorResponse(w, "IMAGE_CREATE_FAILED", "Error creating image file.", err, http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	bytesWritten, err := io.Copy(dst, file)
	if err != nil {
		err = fmt.Errorf("error uploading image file: %w", err)
		utils.SendErrorResponse(w, "IMAGE_UPLOAD_FAILED", "Error uploading image.", err, http.StatusInternalServerError)
		return
	}

	imageRecord := ImageRecord{
		Filename:    filename,
		Width:       imageInfo.Width,
		Height:      imageInfo.Height,
		Format:      imageInfo.Format,
		AspectRatio: imageInfo.AspectRatio,
		FileSize:    bytesWritten,
		Caption:     nil,
	}

	image, err := CreateImage(imageRecord)
	if err != nil {
		err = fmt.Errorf("error creating image record: %w", err)
		utils.SendErrorResponse(w, "IMAGE_CREATE_FAILED", "Error saving image.", err, http.StatusInternalServerError)
		return
	}

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

    // Delete physical file (if exists)
    imgPath := filepath.Join("images", filename)
    if err := os.Remove(imgPath); err != nil && !os.IsNotExist(err) {
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


// HandleCleanupImages scans DB images and removes records whose files are missing
// and removes orphaned images (no note_images link) by deleting both file and record.
// Also registers image files on disk that have no DB record, and rebuilds note_images links
// from note content.
func HandleCleanupImages(w http.ResponseWriter, r *http.Request) {
    type result struct {
        RemovedMissing int      `json:"removedMissing"`
        RemovedOrphans int      `json:"removedOrphans"`
        Registered     int      `json:"registered"`
        LinksRebuilt   int      `json:"linksRebuilt"`
        MissingFiles   []string `json:"missingFiles"`
        OrphanFiles    []string `json:"orphanFiles"`
        RegisteredFiles []string `json:"registeredFiles"`
    }
    res := result{}

    // ── Step 1: Register files on disk that have no DB record ──
    dbFilenames := make(map[string]bool)
    for page := 1; ; page++ {
        imgs, total, e := GetAllImages(NewImagesFilter(page, 0, 0))
        if e != nil || len(imgs) == 0 { break }
        _ = total
        for _, im := range imgs {
            dbFilenames[im.Filename] = true
        }
        if len(imgs) < IMAGES_LIMIT { break }
    }

    entries, err := os.ReadDir("images")
    if err == nil {
        for _, entry := range entries {
            if entry.IsDir() { continue }
            fname := entry.Name()
            if dbFilenames[fname] { continue }

            // New file — register it
            fullPath := filepath.Join("images", fname)
            f, openErr := os.Open(fullPath)
            if openErr != nil { continue }

            info, imgErr := getImageInfo(f)
            f.Close()
            if imgErr != nil { continue }

            fi, statErr := entry.Info()
            if statErr != nil { continue }

            ext := strings.ToLower(filepath.Ext(fname))
            format := strings.TrimPrefix(ext, ".")

            imageRecord := ImageRecord{
                Filename:    fname,
                Width:       info.Width,
                Height:      info.Height,
                Format:      format,
                AspectRatio: info.AspectRatio,
                FileSize:    fi.Size(),
                Caption:     nil,
            }
            _, createErr := CreateImage(imageRecord)
            if createErr == nil {
                res.Registered++
                res.RegisteredFiles = append(res.RegisteredFiles, fname)
            }
        }
    }

    // ── Step 2: Rebuild note_images links from note content ──
    imageRegex := regexp.MustCompile(`!\[.*?\]\(/images/([^)]+)\)`)
    allNotes, noteErr := GetAllNoteContents()
    if noteErr == nil {
        // Collect existing links to avoid double-counting rebuilds
        existingLinks := make(map[string]map[int]bool) // filename -> set of noteIDs
        for page := 1; ; page++ {
            imgs, total, e := GetAllImages(NewImagesFilter(page, 0, 0))
            if e != nil || len(imgs) == 0 { break }
            _ = total
            for _, im := range imgs {
                noteIDs, linkErr := GetLinkedNotesByImage(im.Filename)
                if linkErr == nil {
                    for _, nid := range noteIDs {
                        if existingLinks[im.Filename] == nil {
                            existingLinks[im.Filename] = make(map[int]bool)
                        }
                        existingLinks[im.Filename][nid] = true
                    }
                }
            }
            if len(imgs) < IMAGES_LIMIT { break }
        }

        for _, note := range allNotes {
            matches := imageRegex.FindAllStringSubmatch(note.Content, -1)
            for _, m := range matches {
                if len(m) > 1 {
                    filename := m[1]
                    // Only count as rebuilt if not already linked
                    if existingLinks[filename] != nil && existingLinks[filename][note.NoteID] {
                        continue
                    }
                    if LinkImageToNote(note.NoteID, filename) == nil {
                        res.LinksRebuilt++
                    }
                }
            }
        }
    }

    // ── Step 3: Remove DB records with missing files ──
    for page := 1; ; page++ {
        imgs, total, e := GetAllImages(NewImagesFilter(page, 0, 0))
        if e != nil || len(imgs) == 0 { break }
        _ = total
        for _, im := range imgs {
            path := filepath.Join("images", im.Filename)
            if _, statErr := os.Stat(path); statErr != nil {
                _ = DeleteImageLinks(im.Filename)
                _ = DeleteImage(im.Filename)
                res.RemovedMissing++
                res.MissingFiles = append(res.MissingFiles, im.Filename)
            }
        }
        if len(imgs) < IMAGES_LIMIT { break }
    }

    // ── Step 4: Remove orphaned images (no links, no reference in note content) ──
    if orphans, e := GetOrphanedImages(); e == nil {
        // Collect all filenames referenced in note content
        referencedInContent := make(map[string]bool)
        for _, note := range allNotes {
            matches := imageRegex.FindAllStringSubmatch(note.Content, -1)
            for _, m := range matches {
                if len(m) > 1 {
                    referencedInContent[m[1]] = true
                }
            }
        }

        for _, im := range orphans {
            // Only delete if also not referenced in note content
            if referencedInContent[im.Filename] {
                continue
            }
            path := filepath.Join("images", im.Filename)
            _ = os.Remove(path)
            _ = DeleteImageLinks(im.Filename)
            _ = DeleteImage(im.Filename)
            res.RemovedOrphans++
            res.OrphanFiles = append(res.OrphanFiles, im.Filename)
        }
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(res)
}
