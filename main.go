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
	"zen/features/ai"
	"zen/features/attachments"
	"zen/features/canvas"
	"zen/features/clipboard"
	"zen/features/focus"
	"zen/features/images"
	"zen/features/intelligence"
	"zen/features/mcp"
	"zen/features/notes"
	"zen/features/search"
	"zen/features/settings"
	"zen/features/sharing"
	"zen/features/storage"
	"zen/features/tags"
	"zen/features/templates"
	"zen/features/tokens"
	"zen/features/users"
)

//go:embed assets/*
var Assets embed.FS

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
	sharing.AssetsFS = Assets
	mux := http.NewServeMux()

	addPublicRoute(mux, "GET /api/v1/users/me", users.HandleCheckUser)
	addPublicRoute(mux, "POST /api/v1/users/login", users.HandleLogin)
	addSessionRoute(mux, "POST /api/v1/users/new", users.HandleCreateUser)
	addSessionRoute(mux, "POST /api/v1/users/me/password", users.HandleUpdatePassword)
	addSessionRoute(mux, "POST /api/v1/users/logout", users.HandleLogout)

	// ─── Notes ───
	addAuthenticatedRoute(mux, "GET /api/v1/notes/", notes.HandleGetNotes)
	addAuthenticatedRoute(mux, "GET /api/v1/notes/{noteId}/", notes.HandleGetNote)
	addAuthenticatedRoute(mux, "GET /api/v1/notes/{noteId}", notes.HandleGetNote)
	addSessionRoute(mux, "GET /api/v1/notes/{noteId}/related/", notes.HandleGetRelatedNotes)
	addAuthenticatedRoute(mux, "POST /api/v1/notes/", notes.HandleCreateNote)
	addAuthenticatedRoute(mux, "PUT /api/v1/notes/{noteId}/", notes.HandleUpdateNote)
	addAuthenticatedRoute(mux, "PUT /api/v1/notes/{noteId}", notes.HandleUpdateNote)
	addSessionRoute(mux, "DELETE /api/v1/notes/bulk/", notes.HandleBulkSoftDeleteNotes)
	addSessionRoute(mux, "DELETE /api/v1/notes/{noteId}/", notes.HandleSoftDeleteNote)
	// The client calls the unversioned path without a trailing slash; before this
	// explicit route existed the mux answered with a 301 to the slash form, which is
	// the note-delete modal's "move to trash". Keep that meaning: never bind a hard
	// delete here, or the modal's promise becomes a lie.
	addSessionRoute(mux, "DELETE /api/v1/notes/{noteId}", notes.HandleSoftDeleteNote)
	addSessionRoute(mux, "DELETE /api/v1/notes/", notes.HandleDeleteNotes)
	addSessionRoute(mux, "PUT /api/v1/notes/bulk/archive/", notes.HandleBulkArchiveNotes)
	addSessionRoute(mux, "PUT /api/v1/notes/bulk/tag/", notes.HandleBulkAddTag)
	addSessionRoute(mux, "DELETE /api/v1/notes/bulk/tag/", notes.HandleBulkRemoveTag)
	addSessionRoute(mux, "PUT /api/v1/notes/{noteId}/archive/", notes.HandleArchiveNote)
	addSessionRoute(mux, "PUT /api/v1/notes/{noteId}/unarchive/", notes.HandleUnarchiveNote)
	addSessionRoute(mux, "PUT /api/v1/notes/{noteId}/restore/", notes.HandleRestoreDeletedNote)
	addSessionRoute(mux, "PUT /api/v1/notes/{noteId}/pin/", notes.HandlePinNote)
	addSessionRoute(mux, "PUT /api/v1/notes/{noteId}/unpin/", notes.HandleUnpinNote)
	addSessionRoute(mux, "GET /api/v1/notes/{noteId}/backlinks/", notes.HandleGetBacklinks)
	addSessionRoute(mux, "GET /api/v1/notes/{noteId}/versions/", notes.HandleGetNoteVersions)
	addSessionRoute(mux, "PUT /api/v1/notes/{noteId}/versions/{versionId}/restore/", notes.HandleRestoreNoteVersion)

	addSessionRoute(mux, "POST /api/notes/{noteId}/share/", sharing.HandleCreateShare)
	addSessionRoute(mux, "GET /api/notes/{noteId}/shares/", sharing.HandleGetShares)
	addSessionRoute(mux, "DELETE /api/shares/{shareId}/", sharing.HandleDeleteShare)
	addPublicRoute(mux, "GET /api/shares/{token}", sharing.HandleGetSharedNote)
	addPublicRoute(mux, "GET /s/{token}", sharing.HandleSharedNotePage)

	// ─── Tags ───
	addAuthenticatedRoute(mux, "GET /api/v1/tags", tags.HandleGetTags)
	addAuthenticatedRoute(mux, "GET /api/v1/tags/", tags.HandleGetTags)
	addSessionRoute(mux, "PUT /api/v1/tags/", tags.HandleUpdateTag)
	addSessionRoute(mux, "PUT /api/v1/tags/{tagId}/", tags.HandleUpdateTag)
	addSessionRoute(mux, "PUT /api/v1/tags/{tagId}", tags.HandleUpdateTag)
	addSessionRoute(mux, "PUT /api/v1/tags/reorder/", tags.HandleReorderTags)
	addSessionRoute(mux, "DELETE /api/v1/tags/{tagId}/", tags.HandleDeleteTag)
	addSessionRoute(mux, "DELETE /api/v1/tags/{tagId}", tags.HandleDeleteTag)
	addSessionRoute(mux, "PATCH /api/v1/tags/{tagId}/parent/", tags.HandleMoveTag)

	addSessionRoute(mux, "GET /api/v1/focus/", focus.HandleGetAllFocusModes)
	addSessionRoute(mux, "GET /api/v1/focus", focus.HandleGetAllFocusModes)
	addSessionRoute(mux, "POST /api/v1/focus/", focus.HandleCreateFocusMode)
	addSessionRoute(mux, "POST /api/v1/focus/new", focus.HandleCreateFocusMode)
	addSessionRoute(mux, "PUT /api/v1/focus/{focusId}/", focus.HandleUpdateFocusMode)
	addSessionRoute(mux, "PUT /api/v1/focus/{focusId}", focus.HandleUpdateFocusMode)
	addSessionRoute(mux, "DELETE /api/v1/focus/{focusId}/", focus.HandleDeleteFocusMode)

	addSessionRoute(mux, "POST /api/v1/images/", images.HandleUploadImage)
	addSessionRoute(mux, "GET /api/v1/images/", images.HandleGetImages)
	addSessionRoute(mux, "DELETE /api/v1/images/{filename}/", images.HandleDeleteImage)
	addSessionRoute(mux, "POST /api/v1/images/cleanup", images.HandleCleanupImages)

	addSessionRoute(mux, "GET /api/v1/attachments/", attachments.HandleGetAttachments)
	addSessionRoute(mux, "POST /api/v1/attachments/", attachments.HandleUploadAttachment)
	addSessionRoute(mux, "DELETE /api/v1/attachments/{filename}/", attachments.HandleDeleteAttachment)
	addSessionRoute(mux, "POST /api/v1/attachments/cleanup", attachments.HandleCleanupAttachments)

	addSessionRoute(mux, "POST /api/v1/import/", settings.HandleImport)
	addSessionRoute(mux, "GET /api/v1/export/", settings.HandleExport)

	addSessionRoute(mux, "GET /api/v1/tokens/", tokens.HandleGetAPITokens)
	addSessionRoute(mux, "POST /api/v1/tokens/", tokens.HandleCreateAPIToken)
	addSessionRoute(mux, "DELETE /api/v1/tokens/{tokenId}/", tokens.HandleRevokeAPIToken)

	addAuthenticatedRoute(mux, "GET /api/v1/search/", search.HandleSearch)
	addAuthenticatedRoute(mux, "GET /api/v1/search", search.HandleSearch)

	addSessionRoute(mux, "GET /api/v1/intelligence/availability/", intelligence.HandleAvailability)
	addSessionRoute(mux, "POST /api/v1/intelligence/index/", intelligence.HandleIndexAllContent)
	addSessionRoute(mux, "GET /api/v1/intelligence/queue/", intelligence.HandleQueueStats)
	addSessionRoute(mux, "GET /api/v1/intelligence/similarity/images/{filename}/", intelligence.HandleSimilarImages)

	// ─── AI (fork-only) ───
	addSessionRoute(mux, "GET /api/v1/ai/configs/", ai.HandleGetConfigs)
	addSessionRoute(mux, "POST /api/v1/ai/configs/", ai.HandleCreateConfig)
	addSessionRoute(mux, "PUT /api/v1/ai/configs/{configId}/", ai.HandleUpdateConfig)
	addSessionRoute(mux, "DELETE /api/v1/ai/configs/{configId}/", ai.HandleDeleteConfig)
	addSessionRoute(mux, "PUT /api/v1/ai/configs/{configId}/default/", ai.HandleSetDefault)
	addSessionRoute(mux, "POST /api/v1/ai/process/", ai.HandleProcess)
	addSessionRoute(mux, "POST /api/v1/ai/models/", ai.HandleFetchModels)

	// ─── Storage (fork-only) ───
	addSessionRoute(mux, "GET /api/v1/storage/config", storage.HandleGetConfig)
	addSessionRoute(mux, "PUT /api/v1/storage/config", storage.HandleUpdateConfig)
	addSessionRoute(mux, "POST /api/v1/storage/test", storage.HandleTestConnection)

	// ─── Templates ───
	addAuthenticatedRoute(mux, "GET /api/v1/templates/", templates.HandleGetTemplates)
	addAuthenticatedRoute(mux, "GET /api/v1/templates/{templateId}/", templates.HandleGetTemplate)
	addAuthenticatedRoute(mux, "GET /api/v1/templates/{templateId}", templates.HandleGetTemplate)
	addAuthenticatedRoute(mux, "POST /api/v1/templates/", templates.HandleCreateTemplate)
	addAuthenticatedRoute(mux, "PUT /api/v1/templates/{templateId}/", templates.HandleUpdateTemplate)
	addAuthenticatedRoute(mux, "PUT /api/v1/templates/{templateId}", templates.HandleUpdateTemplate)
	addAuthenticatedRoute(mux, "DELETE /api/v1/templates/{templateId}/", templates.HandleDeleteTemplate)
	addAuthenticatedRoute(mux, "DELETE /api/v1/templates/{templateId}", templates.HandleDeleteTemplate)
	addAuthenticatedRoute(mux, "GET /api/v1/templates/recommended/", templates.HandleGetRecommendedTemplates)
	addAuthenticatedRoute(mux, "PUT /api/v1/templates/{templateId}/usage/", templates.HandleIncrementTemplateUsage)

	// ─── Canvases ───
	addAuthenticatedRoute(mux, "GET /api/v1/canvases/", canvas.HandleGetCanvases)
	addAuthenticatedRoute(mux, "GET /api/v1/canvases/{canvasId}/", canvas.HandleGetCanvas)
	addAuthenticatedRoute(mux, "POST /api/v1/canvases/", canvas.HandleCreateCanvas)
	addAuthenticatedRoute(mux, "PUT /api/v1/canvases/{canvasId}/", canvas.HandleUpdateCanvas)
	addAuthenticatedRoute(mux, "PUT /api/v1/canvases/{canvasId}", canvas.HandleUpdateCanvas)
	addAuthenticatedRoute(mux, "DELETE /api/v1/canvases/{canvasId}/", canvas.HandleDeleteCanvas)
	addAuthenticatedRoute(mux, "DELETE /api/v1/canvases/{canvasId}", canvas.HandleDeleteCanvas)

	// Clipboard — phone↔computer file/text transfer
	addSessionRoute(mux, "POST /api/v1/clipboard/text", clipboard.HandlePushText)
	addSessionRoute(mux, "POST /api/v1/clipboard/upload", clipboard.HandleUploadFile)
	addSessionRoute(mux, "DELETE /api/v1/clipboard/revoke/{id}/", clipboard.HandleRevoke)
	addSessionRoute(mux, "DELETE /api/v1/clipboard/batch/{batch_id}/", clipboard.HandleRevokeBatch)
	addSessionRoute(mux, "DELETE /api/v1/clipboard/batch/{batch_id}/text/", clipboard.HandleDeleteBatchText)
	addSessionRoute(mux, "POST /api/v1/clipboard/{id}/note/", clipboard.HandleSaveAsNote)
	addSessionRoute(mux, "GET /api/v1/clipboard/content/", clipboard.HandleListContent)
	addSessionRoute(mux, "GET /api/v1/clipboard/content/latest", clipboard.HandleLatestContent)
	addSessionRoute(mux, "GET /api/v1/clipboard/file/", clipboard.HandleDownloadFile)

	mux.HandleFunc("POST /mcp", mcp.HandleMCP)
	mux.HandleFunc("OPTIONS /mcp", mcp.HandleMCP)

	// Bundles cached by the service worker before the move to /api/v1/ still call /api/ on the first page load after an upgrade.
	// Token clients never had the unversioned paths, so they are not forwarded.
	for _, method := range []string{"GET", "POST", "PUT", "DELETE"} {
		mux.HandleFunc(method+" /api/", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/v1/") || (r.Header.Get("Authorization") != "" && !auth.HasValidSession(r)) {
				http.NotFound(w, r)
				return
			}

			legacyRequest := r.Clone(r.Context())
			legacyRequest.URL.Path = "/api/v1/" + strings.TrimPrefix(r.URL.Path, "/api/")
			legacyRequest.URL.RawPath = ""
			mux.ServeHTTP(w, legacyRequest)
		})
	}

	addPublicRoute(mux, "GET /assets/", handleStaticAssets)
	addPublicRoute(mux, "GET /images/", handleUploadedImages)
	addPublicRoute(mux, "GET /attachments/", handleUploadedAttachments)
	addPublicRoute(mux, "GET /sw.js", handleServiceWorker)
	addPublicRoute(mux, "GET /", handleRoot)

	return mux
}

func handleRoot(w http.ResponseWriter, r *http.Request) {
	var indexPage []byte
	var err error

	if os.Getenv("DEV_MODE") == "true" {
		indexPage, err = os.ReadFile("./assets/index.html")
	} else {
		indexPage, err = Assets.ReadFile("assets/index.html")
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
		// The bundle is rebuilt on every change and the page references it without a
		// version query, so a browser left to its own heuristic freshness keeps serving
		// the previous build and any UI change looks like it never happened.
		w.Header().Set("Cache-Control", "no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fsys = http.Dir("./assets")
	} else {
		subtree, err := fs.Sub(Assets, "assets")
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

func addPublicRoute(mux *http.ServeMux, pattern string, handlerFunc func(w http.ResponseWriter, r *http.Request)) {
	mux.HandleFunc(pattern, handlerFunc)
}

func addAuthenticatedRoute(mux *http.ServeMux, pattern string, handlerFunc func(w http.ResponseWriter, r *http.Request)) {
	handler := http.HandlerFunc(handlerFunc)
	mux.HandleFunc(pattern, auth.EnsureAuthenticated(handler))
}

func addSessionRoute(mux *http.ServeMux, pattern string, handlerFunc func(w http.ResponseWriter, r *http.Request)) {
	handler := http.HandlerFunc(handlerFunc)
	mux.HandleFunc(pattern, auth.EnsureSession(handler))
}

func runBackgroundTasks() {
	trashCleanupFrequency := 30 * 24 * time.Hour       // 30 days
	sessionCleanupFrequency := 24 * time.Hour          // 24 hours
	imageSyncFrequency := 24 * time.Hour               // 24 hours
	intelligenceProcessingFrequency := 5 * time.Minute // 5 minutes
	versionPruneFrequency := 24 * time.Hour            // 24 hours
	tagCleanupFrequency := 24 * time.Hour              // 24 hours

	go func() {
		logError(notes.EmptyTrash(true)) // Run immediately on server start
		for range time.Tick(trashCleanupFrequency) {
			logError(notes.EmptyTrash(true))
		}
	}()

	go func() {
		for range time.Tick(sessionCleanupFrequency) {
			session.DeleteExpiredSessions()
		}
	}()

	go func() {
		for range time.Tick(imageSyncFrequency) {
			logError(images.SyncImagesFromDisk())
		}
	}()

	go func() {
		for range time.Tick(intelligenceProcessingFrequency) {
			intelligence.ProcessQueues()
		}
	}()

	go func() {
		tags.CleanupUnusedTags() // Run immediately on server start
		for range time.Tick(tagCleanupFrequency) {
			tags.CleanupUnusedTags()
		}
	}()

	go func() {
		logError(notes.PruneNoteVersions()) // Run immediately on server start
		for range time.Tick(versionPruneFrequency) {
			logError(notes.PruneNoteVersions())
		}
	}()
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func logError(err error) {
	if err != nil {
		slog.Error(err.Error())
	}
}

func handleServiceWorker(w http.ResponseWriter, r *http.Request) {
	var swContent []byte
	var err error

	if os.Getenv("DEV_MODE") == "true" {
		swContent, err = os.ReadFile("./assets/sw.js")
	} else {
		swContent, err = Assets.ReadFile("assets/sw.js")
	}

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
