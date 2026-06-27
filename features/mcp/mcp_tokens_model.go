package mcp

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"
	"zen/commons/sqlite"
)

type MCPToken struct {
	TokenID       int       `json:"tokenId"`
	Name          string    `json:"name"`
	CreatedAt     time.Time `json:"createdAt"`
	IsActive      bool      `json:"isActive"`
	AllowedTagIDs []int     `json:"allowedTagIds,omitempty"`
}

type MCPTokenRecord struct {
	TokenID   int
	Name      string
	TokenHash string
	CreatedAt time.Time
	IsActive  bool
}

func GetAllMCPTokens() ([]MCPToken, error) {
	tokens := []MCPToken{}

	query := `
		SELECT 
			token_id,
			name,
			created_at,
			is_active
		FROM 
			mcp_tokens 
		WHERE 
			is_active = 1
		ORDER BY 
			created_at DESC
	`

	rows, err := sqlite.DB.Query(query)
	if err != nil {
		err = fmt.Errorf("error retrieving MCP tokens: %w", err)
		slog.Error(err.Error())
		return tokens, err
	}
	defer rows.Close()

	for rows.Next() {
		var token MCPToken
		var isActiveInt int
		err = rows.Scan(&token.TokenID, &token.Name, &token.CreatedAt, &isActiveInt)
		if err != nil {
			err = fmt.Errorf("error scanning MCP token: %w", err)
			slog.Error(err.Error())
			return tokens, err
		}
		token.IsActive = isActiveInt == 1

		// Load allowed tags for this token
		allowedTagIDs, tagErr := GetTokenAllowedTagIDs(token.TokenID)
		if tagErr != nil {
			slog.Error("error fetching token allowed tags", "tokenId", token.TokenID, "error", tagErr)
		}
		token.AllowedTagIDs = allowedTagIDs

		tokens = append(tokens, token)
	}

	return tokens, nil
}

func CreateMCPToken(name string) (string, MCPToken, error) {
	// Generate a secure random token
	tokenBytes := make([]byte, 24) // 32 characters when hex encoded
	_, err := rand.Read(tokenBytes)
	if err != nil {
		err = fmt.Errorf("error generating token: %w", err)
		slog.Error(err.Error())
		return "", MCPToken{}, err
	}

	plainToken := hex.EncodeToString(tokenBytes)

	// Hash the token for storage
	hasher := sha256.New()
	hasher.Write([]byte(plainToken))
	tokenHash := hex.EncodeToString(hasher.Sum(nil))

	var token MCPToken
	query := `
		INSERT INTO 
			mcp_tokens (name, token_hash)
		VALUES 
			(?, ?)
		RETURNING 
			token_id, name, created_at, is_active
	`

	row := sqlite.DB.QueryRow(query, name, tokenHash)
	var isActiveInt int
	err = row.Scan(&token.TokenID, &token.Name, &token.CreatedAt, &isActiveInt)
	if err != nil {
		err = fmt.Errorf("error creating MCP token: %w", err)
		slog.Error(err.Error())
		return "", MCPToken{}, err
	}

	token.IsActive = isActiveInt == 1

	return plainToken, token, nil
}

func RevokeMCPToken(tokenID int) error {
	query := `
		UPDATE 
			mcp_tokens 
		SET 
			is_active = 0
		WHERE 
			token_id = ?
	`

	result, err := sqlite.DB.Exec(query, tokenID)
	if err != nil {
		err = fmt.Errorf("error revoking MCP token: %w", err)
		slog.Error(err.Error())
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		err = fmt.Errorf("error checking revoked token: %w", err)
		slog.Error(err.Error())
		return err
	}

	if rowsAffected == 0 {
		err = fmt.Errorf("MCP token not found")
		slog.Error(err.Error())
		return err
	}

	return nil
}

func ValidateMCPToken(plainToken string) bool {
	if plainToken == "" {
		return false
	}

	// Hash the incoming token
	hasher := sha256.New()
	hasher.Write([]byte(plainToken))
	tokenHash := hex.EncodeToString(hasher.Sum(nil))

	query := `
		SELECT 
			1 
		FROM 
			mcp_tokens 
		WHERE 
			token_hash = ? AND is_active = 1
	`

	var exists int
	err := sqlite.DB.QueryRow(query, tokenHash).Scan(&exists)
	if err == sql.ErrNoRows {
		return false
	}
	if err != nil {
		slog.Error("error validating MCP token", "error", err)
		return false
	}

	return true
}

// ─── Token-ID lookup ───

func GetTokenIDByToken(plainToken string) (int, error) {
	hasher := sha256.New()
	hasher.Write([]byte(plainToken))
	tokenHash := hex.EncodeToString(hasher.Sum(nil))

	var tokenID int
	err := sqlite.DB.QueryRow(
		"SELECT token_id FROM mcp_tokens WHERE token_hash = ? AND is_active = 1",
		tokenHash,
	).Scan(&tokenID)
	if err != nil {
		slog.Error("MCP token lookup failed", "error", err)
		return 0, fmt.Errorf("token not found or inactive: %w", err)
	}
	return tokenID, nil
}

// ─── Tag-based permission functions ───

// GetTokenAllowedTagIDs returns the tag IDs directly assigned to this token.
func GetTokenAllowedTagIDs(tokenID int) ([]int, error) {
	rows, err := sqlite.DB.Query(
		"SELECT tag_id FROM mcp_token_tags WHERE token_id = ?", tokenID,
	)
	if err != nil {
		return nil, fmt.Errorf("error fetching token allowed tags: %w", err)
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("error scanning tag id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// SetTokenAllowedTags replaces the allowed-tag set for a token (inside a transaction).
func SetTokenAllowedTags(tokenID int, tagIDs []int) error {
	tx, err := sqlite.DB.Begin()
	if err != nil {
		return fmt.Errorf("error starting transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM mcp_token_tags WHERE token_id = ?", tokenID); err != nil {
		return fmt.Errorf("error clearing token tags: %w", err)
	}

	for _, tagID := range tagIDs {
		if _, err := tx.Exec(
			"INSERT INTO mcp_token_tags (token_id, tag_id) VALUES (?, ?)",
			tokenID, tagID,
		); err != nil {
			return fmt.Errorf("error inserting token tag: %w", err)
		}
	}

	return tx.Commit()
}

// IsNoteAllowedForToken checks whether a note is tagged with at least one tag
// that the token is allowed to access (with recursive tag hierarchy).
// If the token has allowed tags but none match the note, the note cannot be modified.
func IsNoteAllowedForToken(noteID, tokenID int) (bool, error) {
	// First check: does this token have any allowed tags at all?
	// An empty allow list means no notes are permitted.
	allowedTags, err := GetTokenAllowedTagIDs(tokenID)
	if err != nil {
		return false, err
	}
	if len(allowedTags) == 0 {
		return false, nil // no tags selected = no notes allowed
	}

	query := `
		WITH RECURSIVE allowed_tags(id) AS (
			SELECT tag_id FROM mcp_token_tags WHERE token_id = ?
			UNION ALL
			SELECT t.tag_id FROM tags t
			INNER JOIN allowed_tags a ON t.parent_id = a.id
		)
		SELECT 1 FROM note_tags nt
		WHERE nt.note_id = ? AND nt.tag_id IN (SELECT id FROM allowed_tags)
		LIMIT 1
	`

	var exists int
	err = sqlite.DB.QueryRow(query, tokenID, noteID).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("error checking note permission: %w", err)
	}
	return true, nil
}
