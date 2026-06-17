package notes

import (
	"fmt"
	"log/slog"
	"time"
	"zen/commons/sqlite"
)

func ForceDeleteNote(noteID int) error {
	tx, err := sqlite.DB.Begin()

	if err != nil {
		err = fmt.Errorf("error starting transaction: %w", err)
		slog.Error(err.Error())
		return err
	}

	defer tx.Rollback()

	query := `
		DELETE FROM
			note_tags
		WHERE
			note_id = ?
	`

	_, err = tx.Exec(query, noteID)
	if err != nil {
		err = fmt.Errorf("error deleting tags: %w", err)
		slog.Error(err.Error())
		return err
	}

	query = `
		DELETE FROM
			note_images
		WHERE
			note_id = ?
	`

	_, err = tx.Exec(query, noteID)
	if err != nil {
		err = fmt.Errorf("error deleting note images: %w", err)
		slog.Error(err.Error())
		return err
	}

	query = `
		DELETE FROM
			notes
		WHERE
			note_id = ?
	`

	_, err = tx.Exec(query, noteID)
	if err != nil {
		err = fmt.Errorf("error deleting note: %w", err)
		slog.Error(err.Error())
		return err
	}

	err = tx.Commit()

	if err != nil {
		err = fmt.Errorf("error deleting note: %w", err)
		slog.Error(err.Error())
		return err
	}

	return nil
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
	var rows_query string

	if shouldOnlyClearExpired {
		rows_query = `
			SELECT note_id FROM notes 
			WHERE deleted_at IS NOT NULL 
			AND deleted_at < ?
		`
	} else {
		rows_query = `
			SELECT note_id FROM notes 
			WHERE deleted_at IS NOT NULL
		`
	}

	var rows_result *[]int
	var err error

	if shouldOnlyClearExpired {
		expiry := time.Now().AddDate(0, 0, -30)
		rows, err := sqlite.DB.Query(rows_query, expiry)
		if err != nil {
			err = fmt.Errorf("error querying trashed notes: %w", err)
			slog.Error(err.Error())
			return err
		}
		defer rows.Close()

		var noteIDs []int
		for rows.Next() {
			var noteID int
			err = rows.Scan(&noteID)
			if err != nil {
				err = fmt.Errorf("error scanning note ID: %w", err)
				slog.Error(err.Error())
				return err
			}
			noteIDs = append(noteIDs, noteID)
		}
		rows_result = &noteIDs
	} else {
		rows, err := sqlite.DB.Query(rows_query)
		if err != nil {
			err = fmt.Errorf("error querying trashed notes: %w", err)
			slog.Error(err.Error())
			return err
		}
		defer rows.Close()

		var noteIDs []int
		for rows.Next() {
			var noteID int
			err = rows.Scan(&noteID)
			if err != nil {
				err = fmt.Errorf("error scanning note ID: %w", err)
				slog.Error(err.Error())
				return err
			}
			noteIDs = append(noteIDs, noteID)
		}
		rows_result = &noteIDs
	}

	for _, noteID := range *rows_result {
		err = ForceDeleteNote(noteID)
		if err != nil {
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
