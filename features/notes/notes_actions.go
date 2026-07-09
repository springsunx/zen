package notes

import (
	"fmt"
	"log/slog"
	"time"
	"zen/commons/sqlite"
	"zen/features/attachments"
	"zen/features/images"
	"zen/features/storage"
)

func ForceDeleteNote(noteID int) error {
	// Collect filenames before deleting links
	imageFilenames := collectNoteImageFilenames(noteID)
	attachmentFilenames := collectNoteAttachmentFilenames(noteID)

	tx, err := sqlite.DB.Begin()
	if err != nil {
		err = fmt.Errorf("error starting transaction: %w", err)
		slog.Error(err.Error())
		return err
	}
	defer tx.Rollback()

	if _, err = tx.Exec("DELETE FROM note_tags WHERE note_id = ?", noteID); err != nil {
		slog.Error("error deleting tags", "error", err)
		return fmt.Errorf("error deleting tags: %w", err)
	}

	if _, err = tx.Exec("DELETE FROM note_images WHERE note_id = ?", noteID); err != nil {
		slog.Error("error deleting note images", "error", err)
		return fmt.Errorf("error deleting note images: %w", err)
	}

	if _, err = tx.Exec("DELETE FROM note_attachments WHERE note_id = ?", noteID); err != nil {
		slog.Error("error deleting note attachments", "error", err)
		return fmt.Errorf("error deleting note attachments: %w", err)
	}

	if _, err = tx.Exec("DELETE FROM notes WHERE note_id = ?", noteID); err != nil {
		slog.Error("error deleting note", "error", err)
		return fmt.Errorf("error deleting note: %w", err)
	}

	if err = tx.Commit(); err != nil {
		slog.Error("error committing note deletion", "error", err)
		return fmt.Errorf("error committing note deletion: %w", err)
	}

	// Post-commit: clean up orphaned images and attachments from storage
	cleanupOrphanedImages(imageFilenames)
	cleanupOrphanedAttachments(attachmentFilenames)

	return nil
}

func collectNoteImageFilenames(noteID int) []string {
	rows, err := sqlite.DB.Query("SELECT filename FROM note_images WHERE note_id = ?", noteID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var filenames []string
	for rows.Next() {
		var fn string
		if rows.Scan(&fn) == nil {
			filenames = append(filenames, fn)
		}
	}
	return filenames
}

func collectNoteAttachmentFilenames(noteID int) []string {
	rows, err := sqlite.DB.Query("SELECT filename FROM note_attachments WHERE note_id = ?", noteID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var filenames []string
	for rows.Next() {
		var fn string
		if rows.Scan(&fn) == nil {
			filenames = append(filenames, fn)
		}
	}
	return filenames
}

func cleanupOrphanedImages(filenames []string) {
	imgProvider := storage.GetProvider()
	for _, fn := range filenames {
		var count int
		if err := sqlite.DB.QueryRow("SELECT COUNT(*) FROM note_images WHERE filename = ?", fn).Scan(&count); err != nil {
			slog.Error("error checking image references", "filename", fn, "error", err)
			continue
		}
		if count > 0 {
			continue
		}
		// No other notes reference this image — delete from DB and storage
		if err := images.DeleteImage(fn); err != nil {
			slog.Error("error deleting image record", "filename", fn, "error", err)
		}
		if delErr := imgProvider.Delete(fn); delErr != nil {
			slog.Error("error deleting image file from storage", "filename", fn, "error", delErr)
		}
	}
}

func cleanupOrphanedAttachments(filenames []string) {
	attProvider := storage.GetAttachmentProvider()
	for _, fn := range filenames {
		var count int
		if err := sqlite.DB.QueryRow("SELECT COUNT(*) FROM note_attachments WHERE filename = ?", fn).Scan(&count); err != nil {
			slog.Error("error checking attachment references", "filename", fn, "error", err)
			continue
		}
		if count > 0 {
			continue
		}
		// No other notes reference this attachment — delete from DB and storage
		if err := attachments.DeleteAttachment(fn); err != nil {
			slog.Error("error deleting attachment record", "filename", fn, "error", err)
		}
		if delErr := attProvider.Delete(fn); delErr != nil {
			slog.Error("error deleting attachment file from storage", "filename", fn, "error", delErr)
		}
	}
}

func SoftDeleteNote(noteID int) error {
	query := `
		UPDATE
			notes
		SET
			archived_at = NULL,
			deleted_at = CURRENT_TIMESTAMP
		WHERE
			note_id = ?
	`

	_, err := sqlite.DB.Exec(query, noteID)
	if err != nil {
		err = fmt.Errorf("error soft deleting note: %w", err)
		slog.Error(err.Error())
		return err
	}

	return nil
}

func RestoreDeletedNote(noteID int) error {
	query := `
		UPDATE
			notes
		SET
			deleted_at = NULL
		WHERE
			note_id = ?
	`

	_, err := sqlite.DB.Exec(query, noteID)
	if err != nil {
		err = fmt.Errorf("error restoring note: %w", err)
		slog.Error(err.Error())
		return err
	}

	return nil
}

func ArchiveNote(noteID int) error {
	query := `
		UPDATE
			notes
		SET
			deleted_at = NULL,
			archived_at = CURRENT_TIMESTAMP
		WHERE
			note_id = ?
	`

	_, err := sqlite.DB.Exec(query, noteID)
	if err != nil {
		err = fmt.Errorf("error archiving note: %w", err)
		slog.Error(err.Error())
		return err
	}

	return nil
}

func UnarchiveNote(noteID int) error {
	query := `
		UPDATE
			notes
		SET
			archived_at = NULL
		WHERE
			note_id = ?
	`

	_, err := sqlite.DB.Exec(query, noteID)
	if err != nil {
		err = fmt.Errorf("error unarchiving note: %w", err)
		slog.Error(err.Error())
		return err
	}

	return nil
}

func EmptyTrash(shouldOnlyClearExpired bool) error {
	query := `SELECT note_id FROM notes WHERE deleted_at IS NOT NULL`
	var args []interface{}

	if shouldOnlyClearExpired {
		query += ` AND deleted_at < ?`
		args = append(args, time.Now().AddDate(0, 0, -30))
	}

	rows, err := sqlite.DB.Query(query, args...)
	if err != nil {
		err = fmt.Errorf("error querying trashed notes: %w", err)
		slog.Error(err.Error())
		return err
	}
	defer rows.Close()

	var noteIDs []int
	for rows.Next() {
		var noteID int
		if err := rows.Scan(&noteID); err != nil {
			err = fmt.Errorf("error scanning note ID: %w", err)
			slog.Error(err.Error())
			return err
		}
		noteIDs = append(noteIDs, noteID)
	}

	for _, noteID := range noteIDs {
		if err := ForceDeleteNote(noteID); err != nil {
			err = fmt.Errorf("error deleting trashed note %d: %w", noteID, err)
			slog.Error(err.Error())
			return err
		}
	}

	return nil
}

func PinNote(noteID int) error {
	query := `
		UPDATE
			notes
		SET
			pinned_at = CURRENT_TIMESTAMP
		WHERE
			note_id = ?
	`

	_, err := sqlite.DB.Exec(query, noteID)
	if err != nil {
		err = fmt.Errorf("error pinning note: %w", err)
		slog.Error(err.Error())
		return err
	}

	return nil
}

func UnpinNote(noteID int) error {
	query := `
		UPDATE
			notes
		SET
			pinned_at = NULL
		WHERE
			note_id = ?
	`

	_, err := sqlite.DB.Exec(query, noteID)
	if err != nil {
		err = fmt.Errorf("error unpinning note: %w", err)
		slog.Error(err.Error())
		return err
	}

	return nil
}
