package images

import (
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"zen/features/storage"

	"golang.org/x/image/draw"
)

const (
	thumbnailMaxDimension     = 160
	thumbnailLargestDimension = 1024
)

// Thumbnail creation is deliberately serialized. A first visit to the image
// manager can request many thumbnails at once; decoding every original in
// parallel would trade browser work for a large server CPU spike.
var thumbnailCreationMu sync.Mutex

// HandleGetThumbnail serves a small cached JPEG thumbnail for an uploaded
// image. The file-manager uses this route exclusively for list thumbnails;
// opening an image continues to use the original file.
func HandleGetThumbnail(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if !isSafeImageFilename(filename) {
		http.NotFound(w, r)
		return
	}

	maximum := thumbnailMaxDimension
	if value := r.URL.Query().Get("size"); value != "" {
		requested, parseErr := strconv.Atoi(value)
		if parseErr != nil || requested < thumbnailMaxDimension || requested > thumbnailLargestDimension {
			http.NotFound(w, r)
			return
		}
		maximum = requested
	}

	thumbnailPath, err := ensureThumbnail(filename, maximum)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, thumbnailPath)
}

// DeleteThumbnail removes the local cached rendition after an image is
// deleted. Failures are intentionally ignored by callers because the original
// image record remains the source of truth.
func DeleteThumbnail(filename string) error {
	if !isSafeImageFilename(filename) {
		return nil
	}
	paths, err := filepath.Glob(filepath.Join(imagesDirectory(), ".thumbs", filename+"*.jpg"))
	if err != nil {
		return err
	}
	for _, path := range paths {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func ensureThumbnail(filename string, maximum int) (string, error) {
	path := thumbnailFilePath(filename, maximum)
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}

	thumbnailCreationMu.Lock()
	defer thumbnailCreationMu.Unlock()

	if _, err := os.Stat(path); err == nil {
		return path, nil
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}

	reader, err := openImageSource(filename)
	if err != nil {
		return "", err
	}
	defer reader.Close()

	source, _, err := image.Decode(reader)
	if err != nil {
		return "", fmt.Errorf("decode image thumbnail: %w", err)
	}

	bounds := source.Bounds()
	width, height := scaledDimensions(bounds.Dx(), bounds.Dy(), maximum)
	thumbnail := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.ApproxBiLinear.Scale(thumbnail, thumbnail.Bounds(), source, bounds, draw.Over, nil)

	temp, err := os.CreateTemp(filepath.Dir(path), ".thumbnail-*")
	if err != nil {
		return "", err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)

	if err := jpeg.Encode(temp, thumbnail, &jpeg.Options{Quality: 80}); err != nil {
		temp.Close()
		return "", fmt.Errorf("encode image thumbnail: %w", err)
	}
	if err := temp.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return "", err
	}

	return path, nil
}

func openImageSource(filename string) (io.ReadCloser, error) {
	localFile, err := os.Open(filepath.Join(imagesDirectory(), filename))
	if err == nil {
		return localFile, nil
	}
	if !os.IsNotExist(err) {
		return nil, err
	}
	if !storage.IsS3Enabled() {
		return nil, err
	}

	s3Provider, ok := storage.GetProvider().(*storage.S3Provider)
	if !ok {
		return nil, os.ErrNotExist
	}
	return s3Provider.DownloadObject(filename)
}

func scaledDimensions(width, height, maximum int) (int, int) {
	if width <= 0 || height <= 0 {
		return 1, 1
	}
	if width <= maximum && height <= maximum {
		return width, height
	}
	if width >= height {
		return maximum, max(1, height*maximum/width)
	}
	return max(1, width*maximum/height), maximum
}

func thumbnailFilePath(filename string, maximum int) string {
	if maximum == thumbnailMaxDimension {
		return filepath.Join(imagesDirectory(), ".thumbs", filename+".jpg")
	}
	return filepath.Join(imagesDirectory(), ".thumbs", filename+"-"+strconv.Itoa(maximum)+".jpg")
}

func imagesDirectory() string {
	directory := os.Getenv("IMAGES_FOLDER")
	if directory == "" {
		return "./images"
	}
	return directory
}

func isSafeImageFilename(filename string) bool {
	return filename != "" &&
		filename == filepath.Base(filename) &&
		!strings.ContainsAny(filename, `/\\`) &&
		isImageFile(filename)
}
