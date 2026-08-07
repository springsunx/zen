package sharing

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"
	"zen/commons/sqlite"
)

func generateShareToken() (string, error) {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func CreateShare(noteID int, expiresInHours *int) (*SharedNote, error) {
	token, err := generateShareToken()
	if err != nil {
		return nil, err
	}

	var expiresAt *time.Time
	if expiresInHours != nil && *expiresInHours > 0 {
		t := time.Now().Add(time.Duration(*expiresInHours) * time.Hour)
		expiresAt = &t
	}

	query := `INSERT INTO shared_notes (share_token, note_id, expires_at) VALUES (?, ?, ?)`
	result, err := sqlite.DB.Exec(query, token, noteID, expiresAt)
	if err != nil {
		slog.Error("create share failed", "error", err)
		return nil, fmt.Errorf("create share: %w", err)
	}

	id, _ := result.LastInsertId()

	return &SharedNote{
		ID:         int(id),
		ShareToken: token,
		NoteID:     noteID,
		ExpiresAt:  expiresAt,
		CreatedAt:  time.Now(),
	}, nil
}

func GetSharesByNoteID(noteID int) ([]SharedNote, error) {
	query := `SELECT id, share_token, note_id, expires_at, created_at FROM shared_notes WHERE note_id = ? ORDER BY created_at DESC`
	rows, err := sqlite.DB.Query(query, noteID)
	if err != nil {
		slog.Error("get shares by note id failed", "error", err)
		return nil, fmt.Errorf("get shares: %w", err)
	}
	defer rows.Close()

	var shares []SharedNote
	for rows.Next() {
		var s SharedNote
		var expiresAt sql.NullTime
		err := rows.Scan(&s.ID, &s.ShareToken, &s.NoteID, &expiresAt, &s.CreatedAt)
		if err != nil {
			slog.Error("scan share row failed", "error", err)
			return nil, fmt.Errorf("scan share: %w", err)
		}
		if expiresAt.Valid {
			s.ExpiresAt = &expiresAt.Time
		}
		shares = append(shares, s)
	}
	if shares == nil {
		shares = []SharedNote{}
	}
	return shares, nil
}

func GetShareByToken(token string) (*SharedNote, error) {
	query := `SELECT id, share_token, note_id, expires_at, created_at FROM shared_notes WHERE share_token = ?`
	var s SharedNote
	var expiresAt sql.NullTime
	err := sqlite.DB.QueryRow(query, token).Scan(&s.ID, &s.ShareToken, &s.NoteID, &expiresAt, &s.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		slog.Error("get share by token failed", "error", err)
		return nil, fmt.Errorf("get share by token: %w", err)
	}
	if expiresAt.Valid {
		s.ExpiresAt = &expiresAt.Time
	}
	if s.ExpiresAt != nil && time.Now().After(*s.ExpiresAt) {
		return nil, nil
	}
	return &s, nil
}

func DeleteShare(shareID int) error {
	query := `DELETE FROM shared_notes WHERE id = ?`
	_, err := sqlite.DB.Exec(query, shareID)
	if err != nil {
		slog.Error("delete share failed", "error", err)
		return fmt.Errorf("delete share: %w", err)
	}
	return nil
}
