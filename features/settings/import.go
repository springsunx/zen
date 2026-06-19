package settings

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"zen/commons/sqlite"
	"zen/commons/utils"
	"zen/features/images"
	"zen/features/notes"
	"zen/features/tags"
)

const MAX_UPLOAD_SIZE = 200 << 20 // 200MB

type ImportResult struct {
	Message     string   `json:"message"`
	Imported    int      `json:"imported"`
	Skipped     int      `json:"skipped"`
	Errors      int      `json:"errors"`
	ImportedMD  []string `json:"importedMd"`
	ErrorFiles  []string `json:"errorFiles"`
	SkippedFiles []string `json:"skippedFiles"`
}

type frontmatter struct {
	title     string
	tags      []string
	createdAt *time.Time
	updatedAt *time.Time
}

func HandleImport(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(MAX_UPLOAD_SIZE)
	if err != nil {
		err = fmt.Errorf("error parsing file: %w", err)
		utils.SendErrorResponse(w, "INVALID_FILE", "Invalid file", err, http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		err = fmt.Errorf("error parsing file: %w", err)
		utils.SendErrorResponse(w, "INVALID_FILE", "Invalid file", err, http.StatusBadRequest)
		return
	}
	defer file.Close()

	path := r.FormValue("path")
	ext := strings.ToLower(filepath.Ext(handler.Filename))

	if ext == ".zip" {
		handleZipImport(w, file, handler.Filename)
		return
	}

	if ext != ".md" && ext != ".txt" {
		err = fmt.Errorf("unsupported file type: %s", ext)
		utils.SendErrorResponse(w, "INVALID_FILE_TYPE", "Only .md, .txt, and .zip files are allowed", err, http.StatusBadRequest)
		return
	}

	content, err := io.ReadAll(file)
	if err != nil {
		err = fmt.Errorf("error reading file content: %w", err)
		utils.SendErrorResponse(w, "FILE_READ_FAILED", "Error reading file content", err, http.StatusInternalServerError)
		return
	}

	body, fm := extractFrontmatter(string(content))

	title := strings.TrimSuffix(handler.Filename, ext)
	if fm.title != "" {
		title = fm.title
	}

	tagNames := fm.tags
	if len(tagNames) == 0 {
		tagNames = extractTagNamesFromPath(path)
	}
	noteTags := resolveTags(tagNames)

	note := notes.Note{
		Title:   title,
		Content: body,
		Tags:    noteTags,
	}

	if fm.createdAt != nil && fm.updatedAt != nil {
		note.CreatedAt = *fm.createdAt
		note.UpdatedAt = *fm.updatedAt
	} else if fm.createdAt != nil {
		note.CreatedAt = *fm.createdAt
		note.UpdatedAt = *fm.createdAt
	} else if fm.updatedAt != nil {
		note.CreatedAt = *fm.updatedAt
		note.UpdatedAt = *fm.updatedAt
	}

	_, err = notes.CreateNote(note)
	if err != nil {
		err = fmt.Errorf("error creating note: %w", err)
		utils.SendErrorResponse(w, "NOTES_IMPORT_FAILED", "Error importing note", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "File uploaded successfully"}`))
}

func handleZipImport(w http.ResponseWriter, src io.Reader, filename string) {
	tmpFile, err := os.CreateTemp("", "zen-import-*.zip")
	if err != nil {
		utils.SendErrorResponse(w, "IMPORT_FAILED", "Error creating temp file", err, http.StatusInternalServerError)
		return
	}
	defer os.Remove(tmpFile.Name())

	_, err = io.Copy(tmpFile, src)
	if err != nil {
		utils.SendErrorResponse(w, "IMPORT_FAILED", "Error saving uploaded file", err, http.StatusInternalServerError)
		return
	}
	tmpFile.Close()

	zipReader, err := zip.OpenReader(tmpFile.Name())
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_ZIP", "Invalid ZIP file", err, http.StatusBadRequest)
		return
	}
	defer zipReader.Close()

	result := ImportResult{
		Message:  "Import completed",
		ImportedMD: []string{},
		ErrorFiles: []string{},
		SkippedFiles: []string{},
	}

	// Build file map: name -> zip.File
	files := make(map[string]*zip.File)
	for _, f := range zipReader.File {
		files[filepath.ToSlash(f.Name)] = f
	}

	// Step 1: Parse tags.json and ensure tags exist
	tagNameToID := make(map[string]int)
	if tagFile, ok := files["tags.json"]; ok {
		importTagsFromZip(tagFile, tagNameToID)
		result.Skipped++
	}

	// Step 2: Parse notes.json and create notes
	if notesFile, ok := files["notes.json"]; ok {
		importNotesFromZip(notesFile, tagNameToID, &result)
	} else {
		// No JSON files — fall back to importing individual .md files
		for _, f := range zipReader.File {
			name := filepath.ToSlash(f.Name)
			if strings.HasPrefix(name, "images/") {
				continue
			}
			if !strings.HasSuffix(strings.ToLower(f.Name), ".md") {
				continue
			}

			rc, err := f.Open()
			if err != nil {
				result.ErrorFiles = append(result.ErrorFiles, f.Name)
				result.Errors++
				continue
			}

			content, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				result.ErrorFiles = append(result.ErrorFiles, f.Name)
				result.Errors++
				continue
			}

			note := notes.Note{
				Title:   strings.TrimSuffix(f.Name, ".md"),
				Content: string(content),
				Tags:    resolveTags(extractTagNamesFromPath(name)),
			}

			_, err = notes.CreateNote(note)
			if err != nil {
				result.ErrorFiles = append(result.ErrorFiles, f.Name)
				result.Errors++
			} else {
				result.ImportedMD = append(result.ImportedMD, f.Name)
				result.Imported++
			}
		}
	}

	// Step 3: Process images/
	importImagesFromZip(files, &result)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func importTagsFromZip(tagFile *zip.File, tagNameToID map[string]int) {
	rc, err := tagFile.Open()
	if err != nil {
		return
	}
	defer rc.Close()

	var exportedTags []tags.Tag
	if err := json.NewDecoder(rc).Decode(&exportedTags); err != nil {
		return
	}

	// Phase 1: Create all tags (name, color, sortOrder) without parentId
	// Also build oldID->newID mapping for parent resolution
	oldIDToNewID := make(map[int]int)
	for _, t := range exportedTags {
		id := getOrCreateTagWithMeta(t.Name, t.Color, t.SortOrder)
		if id > 0 {
			tagNameToID[t.Name] = id
			oldIDToNewID[t.TagID] = id
		}
	}

	// Phase 2: Update parentId using old->new ID mapping
	for _, t := range exportedTags {
		if t.ParentID == nil {
			continue
		}
		newID, ok := oldIDToNewID[t.TagID]
		if !ok || newID == 0 {
			continue
		}
		newParentID, ok := oldIDToNewID[*t.ParentID]
		if !ok || newParentID == 0 {
			continue
		}
		_, _ = sqlite.DB.Exec("UPDATE tags SET parent_id = ? WHERE tag_id = ?", newParentID, newID)
	}
}

type importNote struct {
	NoteID     int       `json:"noteId"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
	Tags       []string  `json:"tags"`
	IsArchived bool      `json:"isArchived"`
	IsPinned   bool      `json:"isPinned"`
	IsDeleted  bool      `json:"isDeleted"`
}

func importNotesFromZip(notesFile *zip.File, tagNameToID map[string]int, result *ImportResult) []string {
	rc, err := notesFile.Open()
	if err != nil {
		return nil
	}
	defer rc.Close()

	var exportNotes []importNote
	if err := json.NewDecoder(rc).Decode(&exportNotes); err != nil {
		return nil
	}

	var archivedTitles []string

	for _, en := range exportNotes {
		// Resolve tag IDs
		var noteTags []tags.Tag
		for _, tagName := range en.Tags {
			id, ok := tagNameToID[tagName]
			if !ok {
				id = getOrCreateTag(tagName)
				if id > 0 {
					tagNameToID[tagName] = id
				}
			}
			if id > 0 {
				noteTags = append(noteTags, tags.Tag{TagID: id, Name: tagName})
			}
		}

		// Create note preserving metadata
		nid, err := createNoteFromExport(en, noteTags)
		if err != nil {
			result.ErrorFiles = append(result.ErrorFiles, en.Title)
			result.Errors++
		} else {
			result.ImportedMD = append(result.ImportedMD, en.Title+".md")
			result.Imported++
			if en.IsArchived {
				archivedTitles = append(archivedTitles, en.Title)
			}
			_ = nid
		}
	}

	return archivedTitles
}

func createNoteFromExport(en importNote, noteTags []tags.Tag) (int, error) {
	tx, err := sqlite.DB.Begin()
	if err != nil {
		return 0, fmt.Errorf("error starting transaction: %w", err)
	}
	defer tx.Rollback()

	var archivedAt interface{} = nil
	if en.IsArchived {
		archivedAt = en.CreatedAt
	}
	var deletedAt interface{} = nil
	if en.IsDeleted {
		deletedAt = en.CreatedAt
	}
	var pinnedAt interface{} = nil
	if en.IsPinned {
		pinnedAt = en.CreatedAt
	}

	var noteID int
	var createdAt, updatedAt time.Time

	query := `
		INSERT INTO
			notes (title, content, created_at, updated_at, archived_at, deleted_at, pinned_at)
		VALUES
			(?, ?, ?, ?, ?, ?, ?)
		RETURNING
			note_id, created_at, updated_at
	`
	err = tx.QueryRow(query, en.Title, en.Content, en.CreatedAt, en.UpdatedAt, archivedAt, deletedAt, pinnedAt).Scan(&noteID, &createdAt, &updatedAt)
	if err != nil {
		return 0, fmt.Errorf("error creating note: %w", err)
	}

	for _, tag := range noteTags {
		query := `
			INSERT INTO
				note_tags (note_id, tag_id)
			VALUES
				(?, ?)
		`
		_, err := tx.Exec(query, noteID, tag.TagID)
		if err != nil {
			return 0, fmt.Errorf("error adding tag to note: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("error committing transaction: %w", err)
	}

	return noteID, nil
}

func importImagesFromZip(files map[string]*zip.File, result *ImportResult) {
	for zipPath, f := range files {
		zipPath = filepath.ToSlash(zipPath)
		if !strings.HasPrefix(zipPath, "images/") {
			continue
		}

		relPath := strings.TrimPrefix(zipPath, "images/")
		if relPath == "" {
			continue
		}

		rc, err := f.Open()
		if err != nil {
			result.ErrorFiles = append(result.ErrorFiles, zipPath)
			result.Errors++
			continue
		}

		imageData, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			result.ErrorFiles = append(result.ErrorFiles, zipPath)
			result.Errors++
			continue
		}

		// Use original filename; skip if already exists
		filename := relPath
		if _, err := os.Stat(filepath.Join("images", filename)); err == nil {
			continue
		}
		imagePath := filepath.Join("images", filename)

		if err := os.MkdirAll("images", 0755); err != nil {
			result.ErrorFiles = append(result.ErrorFiles, zipPath)
			result.Errors++
			continue
		}

		err = os.WriteFile(imagePath, imageData, 0644)
		if err != nil {
			result.ErrorFiles = append(result.ErrorFiles, zipPath)
			result.Errors++
			continue
		}

		// Create database record with minimal info
		imageRecord := images.ImageRecord{
			Filename: filename,
			Width:    0,
			Height:   0,
			Format:   strings.TrimPrefix(filepath.Ext(relPath), "."),
			FileSize: int64(len(imageData)),
		}

		_, err = images.CreateImage(imageRecord)
		if err != nil {
			result.ErrorFiles = append(result.ErrorFiles, zipPath)
			result.Errors++
		}
	}
}

func getOrCreateTag(name string) int {
	return getOrCreateTagWithMeta(name, nil, nil)
}

func getOrCreateTagWithMeta(name string, color *string, sortOrder *int) int {
	if name == "" {
		return 0
	}

	// Check if tag exists
	existingTags, err := tags.SearchTags(name)
	if err == nil {
		for _, t := range existingTags {
			if t.Name == name {
				// Update color and sortOrder if provided
				if color != nil || sortOrder != nil {
					_, _ = sqlite.DB.Exec("UPDATE tags SET color = COALESCE(?, color), sort_order = COALESCE(?, sort_order) WHERE tag_id = ?", color, sortOrder, t.TagID)
				}
				return t.TagID
			}
		}
	}

	// Create new tag
	query := `
		INSERT INTO
			tags (name, color, sort_order)
		VALUES
			(?, ?, ?)
		RETURNING
			tag_id
	`
	var tagID int
	err = sqlite.DB.QueryRow(query, name, color, sortOrder).Scan(&tagID)
	if err != nil {
		return 0
	}
	return tagID
}

func extractTagNamesFromPath(path string) []string {
	if path == "" {
		return nil
	}

	cleanPath := filepath.Clean(path)
	pathParts := strings.Split(cleanPath, string(filepath.Separator))

	var folders []string
	for i, part := range pathParts {
		if part != "" && i < len(pathParts)-1 {
			folders = append(folders, part)
		}
	}

	if len(folders) == 0 {
		return nil
	}

	return []string{folders[len(folders)-1]}
}

func extractFrontmatter(content string) (string, frontmatter) {
	content = strings.ReplaceAll(content, "\r\n", "\n")

	if !strings.HasPrefix(content, "---\n") {
		return content, frontmatter{}
	}

	end := strings.Index(content[4:], "\n---\n")
	if end == -1 {
		return content, frontmatter{}
	}

	block := content[4 : end+4]
	body := strings.TrimPrefix(content[end+9:], "\n")

	var fm frontmatter
	for _, line := range strings.Split(block, "\n") {
		key, value, found := strings.Cut(line, ":")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)

		switch key {
		case "title":
			if fm.title == "" {
				fm.title = value
			}
		case "tags":
			if len(fm.tags) == 0 {
				fm.tags = splitTags(value)
			}
		case "created":
			if fm.createdAt == nil {
				t, err := time.Parse(time.RFC3339, value)
				if err == nil {
					fm.createdAt = &t
				}
			}
		case "updated":
			if fm.updatedAt == nil {
				t, err := time.Parse(time.RFC3339, value)
				if err == nil {
					fm.updatedAt = &t
				}
			}
		}
	}

	return body, fm
}

func splitTags(value string) []string {
	var result []string
	for _, part := range strings.Split(value, ",") {
		tag := strings.TrimSpace(part)
		if tag != "" {
			result = append(result, tag)
		}
	}
	return result
}

func resolveTags(names []string) []tags.Tag {
	var result []tags.Tag
	for _, name := range names {
		existingTags, err := tags.SearchTags(name)
		if err == nil {
			for _, t := range existingTags {
				if t.Name == name {
					result = append(result, t)
					goto next
				}
			}
		}
		result = append(result, tags.Tag{TagID: -1, Name: name})
	next:
	}
	return result
}