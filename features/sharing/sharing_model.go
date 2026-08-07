package sharing

import "time"

type SharedNote struct {
	ID         int        `json:"id"`
	ShareToken string     `json:"shareToken"`
	NoteID     int        `json:"noteId"`
	ExpiresAt  *time.Time `json:"expiresAt"`
	CreatedAt  time.Time  `json:"createdAt"`
}

type ShareRequest struct {
	ExpiresInHours *int `json:"expiresInHours"` // nil = never expires
}
