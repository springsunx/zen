package main

import (
	"embed"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"zen/commons/auth"
	"zen/commons/session"
	"zen/commons/sqlite"
	"zen/features/attachments"
	"zen/features/canvas"
	"zen/features/clipboard"
	"zen/features/ai"
	"zen/features/focus"
	"zen/features/images"
	"zen/features/intelligence"
	"zen/features/mcp"
	"zen/features/notes"
	"zen/features/search"
	"zen/features/settings"
	"zen/features/storage"
	"zen/features/tags"
	"zen/features/templates"
	"zen/features/users"
)

//go:embed assets/*
var assets embed.FS

//go:embed migrations/*.sql
var migrations embed.FS

// Version can be set via ZEN_VERSION env var or -ldflags
var version = getEnv("ZEN_VERSION", "dev")

func main() {
	// ─── CLI Flags ───
	port := flag.String("port", getEnv("PORT", "8080"), "server port")
	dataFolder := flag.String("data", getEnv("DATA_FOLDER", "."), "database directory")
	imagesFolder := flag.String("images", getEnv("IMAGES_FOLDER", "./images"), "image storage directory")
	attachmentsFolder := flag.String("attachments", getEnv("ATTACHMENTS_FOLDER", "./attachments"), "attachment storage directory")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	// ─── Subcommands ───
	if *showVersion {
		fmt.Printf("zen %s\n", version)
		return
	}

	// Apply flag values back to env so existing code works unchanged
	os.Setenv("PORT", *port)
	os.Setenv("DATA_FOLDER", *dataFolder)
	os.Setenv("IMAGES_FOLDER", *imagesFolder)
	os.Setenv("ATTACHMENTS_FOLDER", *attachmentsFolder)

	defer func() {
		if r := recover(); r != nil {
			slog.Error("killing server", "error", r)
			os.Exit(1)
		}
	}()

	imagesDir := os.Getenv("IMAGES_FOLDER")
	if imagesDir == "" {
		imagesDir = "./images"
	}
	if err := os.MkdirAll(imagesDir, 0755); err != nil {
		panic(err)
	}
	attachmentsDir := os.Getenv("ATTACHMENTS_FOLDER")
	if attachmentsDir == "" {
		attachmentsDir = "./attachments"
	}
	if err := os.MkdirAll(attachmentsDir, 0755); err != nil {
		panic(err)
	}

	sqlite.NewDB()
	defer sqlite.DB.Close()

	osSignalChan := make(chan os.Signal, 1)
	signal.Notify(osSignalChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-osSignalChan
		slog.Info("received shutdown signal, closing database connection...")
		if err := sqlite.DB.Close(); err != nil {
			slog.Error("error closing database", "error", err)
		}
		slog.Info("database connection closed. Exiting.")
		os.Exit(0)
	}()

	sqlite.Migrate(migrations)

	go runBackgroundTasks()

	addr := ":" + *port
	slog.Info("starting server", "port", *port)
	err := http.ListenAndServe(addr, newRouter())
	if err != nil {
		panic(err)
	}
}

func newRouter() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/users/me", users.HandleCheckUser)
	mux.HandleFunc("POST /api/users/login", users.HandleLogin)
	addPrivateRoute(mux, "POST /api/users/new", users.HandleCreateUser)
	addPrivateRoute(mux, "POST /api/users/me/password", users.HandleUpdatePassword)
	addPrivateRoute(mux, "POST /api/users/logout", users.HandleLogout)

	addPrivateRoute(mux, "GET /api/notes/", notes.HandleGetNotes)
	addPrivateRoute(mux, "GET /api/notes/{noteId}/", notes.HandleGetNote)
	addPrivateRoute(mux, "POST /api/notes/", notes.HandleCreateNote)
	addPrivateRoute(mux, "PUT /api/notes/{noteId}/", notes.HandleUpdateNote)
	addPrivateRoute(mux, "PUT /api/notes/{noteId}", notes.HandleUpdateNote)
	addPrivateRoute(mux, "DELETE /api/notes/bulk/", notes.HandleBulkSoftDeleteNotes)
	addPrivateRoute(mux, "DELETE /api/notes/{noteId}/", notes.HandleSoftDeleteNote)
	addPrivateRoute(mux, "DELETE /api/notes/", notes.HandleDeleteNotes)
	addPrivateRoute(mux, "PUT /api/notes/bulk/archive/", notes.HandleBulkArchiveNotes)
	addPrivateRoute(mux, "PUT /api/notes/bulk/tag/", notes.HandleBulkAddTag)
	addPrivateRoute(mux, "DELETE /api/notes/bulk/tag/", notes.HandleBulkRemoveTag)
	addPrivateRoute(mux, "PUT /api/notes/{noteId}/archive/", notes.HandleArchiveNote)
	addPrivateRoute(mux, "PUT /api/notes/{noteId}/unarchive/", notes.HandleUnarchiveNote)
	addPrivateRoute(mux, "PUT /api/notes/{noteId}/restore/", notes.HandleRestoreDeletedNote)
	addPrivateRoute(mux, "PUT /api/notes/{noteId}/pin/", notes.HandlePinNote)
	addPrivateRoute(mux, "PUT /api/notes/{noteId}/unpin/", notes.HandleUnpinNote)
	addPrivateRoute(mux, "GET /api/notes/{noteId}/backlinks/", notes.HandleGetBacklinks)

	addPrivateRoute(mux, "GET /api/tags/", tags.HandleGetTags)
	addPrivateRoute(mux, "PUT /api/tags/", tags.HandleUpdateTag)
	addPrivateRoute(mux, "PUT /api/tags/reorder/", tags.HandleReorderTags)
	addPrivateRoute(mux, "DELETE /api/tags/{tagId}/", tags.HandleDeleteTag)
	addPrivateRoute(mux, "PATCH /api/tags/{tagId}/parent/", tags.HandleMoveTag)

	addPrivateRoute(mux, "GET /api/focus/", focus.HandleGetAllFocusModes)
	addPrivateRoute(mux, "POST /api/focus/", focus.HandleCreateFocusMode)
	addPrivateRoute(mux, "PUT /api/focus/{focusId}/", focus.HandleUpdateFocusMode)
	addPrivateRoute(mux, "DELETE /api/focus/{focusId}/", focus.HandleDeleteFocusMode)

	addPrivateRoute(mux, "POST /api/images/", images.HandleUploadImage)
	addPrivateRoute(mux, "GET /api/images/", images.HandleGetImages)
	addPrivateRoute(mux, "DELETE /api/images/{filename}/", images.HandleDeleteImage)
	addPrivateRoute(mux, "POST /api/images/cleanup", images.HandleCleanupImages)

	addPrivateRoute(mux, "GET /api/attachments/", attachments.HandleGetAttachments)
	addPrivateRoute(mux, "POST /api/attachments/", attachments.HandleUploadAttachment)
	addPrivateRoute(mux, "DELETE /api/attachments/{filename}/", attachments.HandleDeleteAttachment)
	addPrivateRoute(mux, "POST /api/attachments/cleanup", attachments.HandleCleanupAttachments)

	addPrivateRoute(mux, "POST /api/import/", settings.HandleImport)
	addPrivateRoute(mux, "GET /api/export/", settings.HandleExport)

	addPrivateRoute(mux, "GET /api/mcp/tokens/", mcp.HandleGetMCPTokens)
	addPrivateRoute(mux, "POST /api/mcp/tokens/", mcp.HandleCreateMCPToken)
	addPrivateRoute(mux, "DELETE /api/mcp/tokens/{tokenId}/", mcp.HandleRevokeMCPToken)

	addPrivateRoute(mux, "GET /api/search/", search.HandleSearch)

	addPrivateRoute(mux, "GET /api/intelligence/availability/", intelligence.HandleAvailability)
	addPrivateRoute(mux, "POST /api/intelligence/index/", intelligence.HandleIndexAllContent)
	addPrivateRoute(mux, "GET /api/intelligence/queue/", intelligence.HandleQueueStats)
	addPrivateRoute(mux, "GET /api/intelligence/similarity/images/{filename}/", intelligence.HandleSimilarImages)

	// AI
	addPrivateRoute(mux, "GET /api/ai/configs/", ai.HandleGetConfigs)
	addPrivateRoute(mux, "POST /api/ai/configs/", ai.HandleCreateConfig)
	addPrivateRoute(mux, "PUT /api/ai/configs/{configId}/", ai.HandleUpdateConfig)
	addPrivateRoute(mux, "DELETE /api/ai/configs/{configId}/", ai.HandleDeleteConfig)
	addPrivateRoute(mux, "PUT /api/ai/configs/{configId}/default/", ai.HandleSetDefault)
	addPrivateRoute(mux, "POST /api/ai/process/", ai.HandleProcess)
	addPrivateRoute(mux, "POST /api/ai/models/", ai.HandleFetchModels)

	addPrivateRoute(mux, "GET /api/storage/config", storage.HandleGetConfig)
	addPrivateRoute(mux, "PUT /api/storage/config", storage.HandleUpdateConfig)
	addPrivateRoute(mux, "POST /api/storage/test", storage.HandleTestConnection)

	addPrivateRoute(mux, "GET /api/templates/", templates.HandleGetTemplates)
	addPrivateRoute(mux, "GET /api/templates/{templateId}/", templates.HandleGetTemplate)
	addPrivateRoute(mux, "POST /api/templates/", templates.HandleCreateTemplate)
	addPrivateRoute(mux, "PUT /api/templates/{templateId}/", templates.HandleUpdateTemplate)
	addPrivateRoute(mux, "DELETE /api/templates/{templateId}/", templates.HandleDeleteTemplate)
	addPrivateRoute(mux, "GET /api/templates/recommended/", templates.HandleGetRecommendedTemplates)
	addPrivateRoute(mux, "PUT /api/templates/{templateId}/usage/", templates.HandleIncrementTemplateUsage)

	addPrivateRoute(mux, "GET /api/canvases/", canvas.HandleGetCanvases)
	addPrivateRoute(mux, "GET /api/canvases/{canvasId}/", canvas.HandleGetCanvas)
	addPrivateRoute(mux, "POST /api/canvases/", canvas.HandleCreateCanvas)
	addPrivateRoute(mux, "PUT /api/canvases/{canvasId}/", canvas.HandleUpdateCanvas)
	addPrivateRoute(mux, "DELETE /api/canvases/{canvasId}/", canvas.HandleDeleteCanvas)

	// Clipboard — phone↔computer file/text transfer
	addPrivateRoute(mux, "POST /api/clipboard/text", clipboard.HandlePushText)
	addPrivateRoute(mux, "POST /api/clipboard/upload", clipboard.HandleUploadFile)
	addPrivateRoute(mux, "DELETE /api/clipboard/revoke/{id}/", clipboard.HandleRevoke)
	addPrivateRoute(mux, "DELETE /api/clipboard/batch/{batch_id}/", clipboard.HandleRevokeBatch)
	addPrivateRoute(mux, "DELETE /api/clipboard/batch/{batch_id}/text/", clipboard.HandleDeleteBatchText)
	addPrivateRoute(mux, "POST /api/clipboard/{id}/note/", clipboard.HandleSaveAsNote)
	addPrivateRoute(mux, "GET /api/clipboard/content/", clipboard.HandleListContent)
	addPrivateRoute(mux, "GET /api/clipboard/content/latest", clipboard.HandleLatestContent)
	mux.HandleFunc("GET /api/clipboard/file/", clipboard.HandleDownloadFile)

	mux.HandleFunc("POST /mcp", mcp.HandleMCP)
	mux.HandleFunc("OPTIONS /mcp", mcp.HandleMCP)

	mux.HandleFunc("GET /assets/", handleStaticAssets)
	mux.HandleFunc("GET /images/", handleUploadedImages)
	mux.HandleFunc("GET /attachments/", handleUploadedAttachments)
	mux.HandleFunc("GET /sw.js", handleServiceWorker)
	mux.HandleFunc("GET /", handleRoot)

	return mux
}

func handleRoot(w http.ResponseWriter, r *http.Request) {
	var indexPage []byte
	var err error

	if os.Getenv("DEV_MODE") == "true" {
		indexPage, err = os.ReadFile("./assets/index.html")
	} else {
		indexPage, err = assets.ReadFile("assets/index.html")
	}

	if err != nil {
		err = fmt.Errorf("error reading index.html: %w", err)
		slog.Error(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(indexPage)
}

func handleStaticAssets(w http.ResponseWriter, r *http.Request) {
	var fsys http.FileSystem

	if os.Getenv("DEV_MODE") == "true" {
		fsys = http.Dir("./assets")
	} else {
		subtree, err := fs.Sub(assets, "assets")
		if err != nil {
			err = fmt.Errorf("error reading assets subtree: %w", err)
			slog.Error(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		fsys = http.FS(subtree)
	}

	http.StripPrefix("/assets/", http.FileServer(fsys)).ServeHTTP(w, r)
}

func handleUploadedImages(w http.ResponseWriter, r *http.Request) {
	serveStorageFile(w, r, "/images/", false)
}

func handleUploadedAttachments(w http.ResponseWriter, r *http.Request) {
	serveStorageFile(w, r, "/attachments/", true)
}

// serveStorageFile serves a file from local disk or redirects to a presigned S3 URL.
func serveStorageFile(w http.ResponseWriter, r *http.Request, prefix string, isAttachment bool) {
	filename := strings.TrimPrefix(r.URL.Path, prefix)
	filename = strings.TrimSuffix(filename, "/")
	if filename == "" {
		http.NotFound(w, r)
		return
	}

	// Look up original name for attachments (for content-disposition)
	var originalName string
	if isAttachment {
		if att, err := attachments.GetAttachmentByFilename(filename); err == nil {
			originalName = att.OriginalName
		}
	}

	// Determine local directory
	var dir string
	if isAttachment {
		dir = os.Getenv("ATTACHMENTS_FOLDER")
		if dir == "" {
			dir = "./attachments"
		}
	} else {
		dir = os.Getenv("IMAGES_FOLDER")
		if dir == "" {
			dir = "./images"
		}
	}

	// Check if file exists locally first
	localPath := filepath.Join(dir, filename)
	if _, statErr := os.Stat(localPath); statErr == nil {
		// File exists on disk — serve locally
		if isAttachment && originalName != "" {
			w.Header().Set("Content-Disposition", storage.ContentDisposition(originalName))
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000")
		http.StripPrefix(prefix, http.FileServer(http.Dir(dir))).ServeHTTP(w, r)
		return
	}

	// File not on disk — if S3 is enabled, proxy from S3
	if storage.IsS3Enabled() {
		var provider storage.Provider
		if isAttachment {
			provider = storage.GetAttachmentProvider()
		} else {
			provider = storage.GetProvider()
		}
		s3p, ok := provider.(*storage.S3Provider)
		if !ok {
			http.NotFound(w, r)
			return
		}
		reader, dlErr := s3p.DownloadObject(filename)
		if dlErr != nil {
			slog.Error("S3 download failed", "filename", filename, "error", dlErr)
			http.NotFound(w, r)
			return
		}
		defer reader.Close()
		if isAttachment && originalName != "" {
			w.Header().Set("Content-Disposition", storage.ContentDisposition(originalName))
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000")
		io.Copy(w, reader)
		return
	}

	http.NotFound(w, r)
}

func addPrivateRoute(mux *http.ServeMux, pattern string, handlerFunc func(w http.ResponseWriter, r *http.Request)) {
	handler := http.HandlerFunc(handlerFunc)
	mux.HandleFunc(pattern, auth.EnsureAuthenticated(handler))
}

func runBackgroundTasks() {
	trashCleanupFrequency := 30 * 24 * time.Hour       // 30 days
	sessionCleanupFrequency := 24 * time.Hour          // 24 hours
	intelligenceProcessingFrequency := 5 * time.Minute // 5 minutes

	go func() {
		notes.EmptyTrash(true) // Run immediately on server start
		for range time.Tick(trashCleanupFrequency) {
			notes.EmptyTrash(true)
		}
	}()

	go func() {
		for range time.Tick(sessionCleanupFrequency) {
			session.DeleteExpiredSessions()
		}
	}()

	go func() {
		for range time.Tick(intelligenceProcessingFrequency) {
			intelligence.ProcessQueues()
		}
	}()

	tagCleanupFrequency := 24 * time.Hour
	go func() {
		tags.CleanupUnusedTags() // Run immediately on server start
		for range time.Tick(tagCleanupFrequency) {
			tags.CleanupUnusedTags()
		}
	}()
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func handleServiceWorker(w http.ResponseWriter, r *http.Request) {
	var swContent []byte
	var err error

	swContent, err = os.ReadFile("./assets/sw.js")
	if err != nil {
		err = fmt.Errorf("error reading sw.js: %w", err)
		slog.Error(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/javascript")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Service-Worker-Allowed", "/")
	w.WriteHeader(http.StatusOK)
	w.Write(swContent)
}