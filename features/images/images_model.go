package images

import (
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"zen/commons/sqlite"
	"zen/features/storage"
)

func noteVisibilityCondition(filter ImagesFilter) string {
	if filter.isArchived {
		return "n.archived_at IS NOT NULL"
	}
	if filter.includeDeleted {
		return "1 = 1"
	}
	if filter.includeArchived {
		return "n.deleted_at IS NULL"
	}
	return "n.deleted_at IS NULL AND n.archived_at IS NULL"
}

func GetAllImages(filter ImagesFilter) ([]Image, int, error) {
	images := []Image{}
	total := 0
	limit := filter.limit
	if limit <= 0 {
		limit = IMAGES_LIMIT
	}
	offset := (filter.page - 1) * limit

	var query string
	var queryArgs []interface{}
	noteCondition := noteVisibilityCondition(filter)

	if filter.tagID != 0 {
		query = `
				SELECT
					i.filename, i.width, i.height, i.format, i.aspect_ratio,
					i.file_size, i.caption, i.created_at,
					COUNT(*) OVER() as total_count
				FROM images i
				INNER JOIN note_images ni ON i.filename = ni.filename
				INNER JOIN note_tags nt ON ni.note_id = nt.note_id
				INNER JOIN notes n ON ni.note_id = n.note_id
				WHERE nt.tag_id = ? AND ` + noteCondition + `
				GROUP BY i.filename
				ORDER BY i.created_at DESC LIMIT ? OFFSET ?
			`
		queryArgs = []interface{}{filter.tagID, limit, offset}
	} else if filter.focusModeID != 0 {
		query = `
				SELECT
					i.filename, i.width, i.height, i.format, i.aspect_ratio,
					i.file_size, i.caption, i.created_at,
					COUNT(*) OVER() as total_count
				FROM focus_mode_tags fmt
				JOIN note_tags nt ON fmt.tag_id = nt.tag_id
				JOIN note_images ni ON nt.note_id = ni.note_id
				JOIN images i ON ni.filename = i.filename
				JOIN notes n ON ni.note_id = n.note_id
				WHERE fmt.focus_mode_id = ? AND ` + noteCondition + `
				GROUP BY i.filename
				ORDER BY i.created_at DESC LIMIT ? OFFSET ?
			`
		queryArgs = []interface{}{filter.focusModeID, limit, offset}
	} else {
		query = `
				SELECT DISTINCT
					i.filename, i.width, i.height, i.format, i.aspect_ratio,
					i.file_size, i.caption, i.created_at,
					COUNT(*) OVER() as total_count
				FROM images i
				INNER JOIN note_images ni ON i.filename = ni.filename
				INNER JOIN notes n ON ni.note_id = n.note_id
				WHERE ` + noteCondition + `
				ORDER BY i.created_at DESC LIMIT ? OFFSET ?
			`
		queryArgs = []interface{}{limit, offset}
	}

	rows, err := sqlite.DB.Query(query, queryArgs...)
	if err != nil {
		err = fmt.Errorf("error retrieving images: %w", err)
		return images, total, err
	}
	defer rows.Close()

	for rows.Next() {
		var image Image
		err = rows.Scan(
			&image.Filename,
			&image.Width,
			&image.Height,
			&image.Format,
			&image.AspectRatio,
			&image.FileSize,
			&image.Caption,
			&image.CreatedAt,
			&total,
		)
		if err != nil {
			err = fmt.Errorf("error scanning image: %w", err)
			return images, total, err
		}
		images = append(images, image)
	}

	// Populate URL and storage metadata locally, then load all linked notes and
	// tags in one query. The previous per-image query pattern became very slow
	// for the file-management page.
	for i := range images {
		images[i].URL = storage.GetImageURL(images[i].Filename)
		images[i].Storage = detectStorage("images", images[i].Filename)
	}
	if err := populateImageLinkedNotes(images); err != nil {
		return images, total, err
	}

	return images, total, nil
}

func populateImageLinkedNotes(images []Image) error {
	if len(images) == 0 {
		return nil
	}

	filenames := make([]interface{}, 0, len(images))
	placeholders := make([]string, 0, len(images))
	for _, image := range images {
		filenames = append(filenames, image.Filename)
		placeholders = append(placeholders, "?")
	}

	rows, err := sqlite.DB.Query(`
		SELECT ni.filename, n.note_id, n.title, n.archived_at IS NOT NULL, n.deleted_at IS NOT NULL, t.tag_id, t.name, t.color
		FROM note_images ni
		JOIN notes n ON ni.note_id = n.note_id
		LEFT JOIN note_tags nt ON n.note_id = nt.note_id
		LEFT JOIN tags t ON nt.tag_id = t.tag_id
		WHERE ni.filename IN (`+strings.Join(placeholders, ",")+`)
		ORDER BY ni.filename, n.updated_at DESC, t.name ASC
	`, filenames...)
	if err != nil {
		return fmt.Errorf("load linked notes for images: %w", err)
	}
	defer rows.Close()

	linkedByFilename := make(map[string][]ImageLinkedNote, len(images))
	notePositions := make(map[string]map[int]int, len(images))
	for rows.Next() {
		var filename, title string
		var noteID int
		var isArchived, isDeleted bool
		var tagID sql.NullInt64
		var tagName, tagColor sql.NullString
		if err := rows.Scan(&filename, &noteID, &title, &isArchived, &isDeleted, &tagID, &tagName, &tagColor); err != nil {
			return fmt.Errorf("scan linked image note: %w", err)
		}

		positions := notePositions[filename]
		if positions == nil {
			positions = make(map[int]int)
			notePositions[filename] = positions
		}
		position, exists := positions[noteID]
		if !exists {
			position = len(linkedByFilename[filename])
			positions[noteID] = position
			linkedByFilename[filename] = append(linkedByFilename[filename], ImageLinkedNote{
				ImageNoteRef: ImageNoteRef{NoteID: noteID, Title: title, IsArchived: isArchived, IsDeleted: isDeleted},
			})
		}
		if tagID.Valid {
			linkedByFilename[filename][position].Tags = append(linkedByFilename[filename][position].Tags, ImageTagBrief{
				TagID: int(tagID.Int64), Name: tagName.String, Color: tagColor.String,
			})
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate linked image notes: %w", err)
	}

	for i := range images {
		images[i].LinkedNotes = linkedByFilename[images[i].Filename]
	}
	return nil
}

func CreateImage(imageRecord ImageRecord) (Image, error) {
	query := `
		INSERT INTO images (
			filename,
			width,
			height,
			format,
			aspect_ratio,
			file_size,
			caption
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`

	_, err := sqlite.DB.Exec(
		query,
		imageRecord.Filename,
		imageRecord.Width,
		imageRecord.Height,
		imageRecord.Format,
		imageRecord.AspectRatio,
		imageRecord.FileSize,
		imageRecord.Caption,
	)

	if err != nil {
		err = fmt.Errorf("error inserting image: %w", err)
		return Image{}, err
	}

	// Query the inserted image to get the timestamps
	var image Image
	selectQuery := `
		SELECT
			filename,
			width,
			height,
			format,
			aspect_ratio,
			file_size,
			caption,
			created_at
		FROM images
		WHERE filename = ?
	`

	err = sqlite.DB.QueryRow(selectQuery, imageRecord.Filename).Scan(
		&image.Filename,
		&image.Width,
		&image.Height,
		&image.Format,
		&image.AspectRatio,
		&image.FileSize,
		&image.Caption,
		&image.CreatedAt,
	)

	if err != nil {
		err = fmt.Errorf("error retrieving created image: %w", err)
		return Image{}, err
	}

	return image, nil
}

func DeleteImage(filename string) error {
	query := "DELETE FROM images WHERE filename = ?"

	_, err := sqlite.DB.Exec(query, filename)
	if err != nil {
		err = fmt.Errorf("error deleting image: %w", err)
		return err
	}

	return nil
}

func LinkImageToNote(noteID int, filename string) error {
	query := `
		INSERT OR IGNORE INTO note_images (note_id, filename)
		VALUES (?, ?)
	`

	_, err := sqlite.DB.Exec(query, noteID, filename)
	if err != nil {
		err = fmt.Errorf("error linking image to note: %w", err)
		return err
	}

	return nil
}

func UnlinkImageFromNote(noteID int, filename string) error {
	query := "DELETE FROM note_images WHERE note_id = ? AND filename = ?"

	_, err := sqlite.DB.Exec(query, noteID, filename)
	if err != nil {
		err = fmt.Errorf("error unlinking image from note: %w", err)
		return err
	}

	return nil
}

func GetOrphanedImages() ([]Image, error) {
	images := []Image{}
	query := `
		SELECT
			i.filename,
			i.width,
			i.height,
			i.format,
			i.aspect_ratio,
			i.file_size,
			i.caption,
			i.created_at
		FROM
			images i
		LEFT JOIN
			note_images ni ON i.filename = ni.filename
		WHERE
			ni.filename IS NULL
	`

	rows, err := sqlite.DB.Query(query)
	if err != nil {
		err = fmt.Errorf("error retrieving orphaned images: %w", err)
		return images, err
	}
	defer rows.Close()

	for rows.Next() {
		var image Image
		err = rows.Scan(
			&image.Filename,
			&image.Width,
			&image.Height,
			&image.Format,
			&image.AspectRatio,
			&image.FileSize,
			&image.Caption,
			&image.CreatedAt,
		)
		if err != nil {
			err = fmt.Errorf("error scanning orphaned image: %w", err)
			return images, err
		}
		images = append(images, image)
	}

	return images, nil
}

func GetLinkedNotesByImage(filename string) ([]int, error) {
	var noteIDs []int
	query := "SELECT note_id FROM note_images WHERE filename = ?"

	rows, err := sqlite.DB.Query(query, filename)
	if err != nil {
		err = fmt.Errorf("error querying note_images: %w", err)
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var noteID int
		err = rows.Scan(&noteID)
		if err != nil {
			err = fmt.Errorf("error scanning note_id: %w", err)
			return nil, err
		}
		noteIDs = append(noteIDs, noteID)
	}

	return noteIDs, nil
}

func GetImageByFilename(filename string) (Image, error) {
	var image Image
	query := `
		SELECT
			filename,
			width,
			height,
			format,
			aspect_ratio,
			file_size,
			caption,
			created_at
		FROM
			images
		WHERE
			filename = ?
	`

	err := sqlite.DB.QueryRow(query, filename).Scan(
		&image.Filename,
		&image.Width,
		&image.Height,
		&image.Format,
		&image.AspectRatio,
		&image.FileSize,
		&image.Caption,
		&image.CreatedAt,
	)

	if err != nil {
		err = fmt.Errorf("error retrieving image: %w", err)
		return image, err
	}

	return image, nil
}

type NoteContent struct {
	NoteID  int
	Content string
}

func GetAllNoteContents() ([]NoteContent, error) {
	var notes []NoteContent
	query := "SELECT note_id, content FROM notes"
	rows, err := sqlite.DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("error querying note contents: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var nc NoteContent
		if err := rows.Scan(&nc.NoteID, &nc.Content); err != nil {
			return nil, fmt.Errorf("error scanning note content: %w", err)
		}
		notes = append(notes, nc)
	}
	return notes, nil
}

func GetImagesCount() (int, error) {
	var count int
	query := "SELECT COUNT(*) FROM images"

	err := sqlite.DB.QueryRow(query).Scan(&count)
	if err != nil {
		err = fmt.Errorf("error getting images count: %w", err)
		return 0, err
	}

	return count, nil
}

// DeleteImageLinks removes any note_images links for the given filename.
func DeleteImageLinks(filename string) error {
	query := "DELETE FROM note_images WHERE filename = ?"
	if _, err := sqlite.DB.Exec(query, filename); err != nil {
		err = fmt.Errorf("error deleting note_images links: %w", err)
		slog.Error(err.Error())
		return err
	}
	return nil
}

func detectStorage(dir, filename string) string {
	localPath := filepath.Join(dir, filename)
	if _, err := os.Stat(localPath); err == nil {
		return "local"
	}
	if storage.IsS3Enabled() {
		return "s3"
	}
	return "local"
}

func getImageLinkedNotes(filename string) []ImageLinkedNote {
	rows, err := sqlite.DB.Query(`
		SELECT n.note_id, n.title
		FROM note_images ni
		JOIN notes n ON ni.note_id = n.note_id
		WHERE ni.filename = ?
		ORDER BY n.updated_at DESC
	`, filename)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var notes []ImageLinkedNote
	for rows.Next() {
		var note ImageLinkedNote
		if err := rows.Scan(&note.NoteID, &note.Title); err != nil {
			continue
		}
		note.Tags = getImageNoteTags(note.NoteID)
		notes = append(notes, note)
	}
	return notes
}

func getImageNoteTags(noteID int) []ImageTagBrief {
	rows, err := sqlite.DB.Query(`
		SELECT t.tag_id, t.name, COALESCE(t.color, '')
		FROM note_tags nt
		JOIN tags t ON nt.tag_id = t.tag_id
		WHERE nt.note_id = ?
	`, noteID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var tags []ImageTagBrief
	for rows.Next() {
		var tag ImageTagBrief
		if err := rows.Scan(&tag.TagID, &tag.Name, &tag.Color); err != nil {
			continue
		}
		tags = append(tags, tag)
	}
	return tags
}
