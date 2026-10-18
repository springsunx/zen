package tokens

import (
	"database/sql"
	"errors"
	"testing"
	"zen/commons/sqlite"
	"zen/commons/utils"
)

func openAPITokenTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	previousDB := sqlite.DB
	sqlite.DB = db
	t.Cleanup(func() {
		sqlite.DB = previousDB
		db.Close()
	})

	for _, statement := range []string{
		`CREATE TABLE api_tokens (
			token_id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE api_token_scopes (
			token_id INTEGER NOT NULL,
			tag_id INTEGER NOT NULL,
			can_read INTEGER NOT NULL DEFAULT 0,
			can_write INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (token_id, tag_id),
			FOREIGN KEY (token_id) REFERENCES api_tokens (token_id) ON DELETE CASCADE
		)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("create test schema: %v", err)
		}
	}

	return db
}

func TestUpdateAPITokenReplacesEditableFields(t *testing.T) {
	db := openAPITokenTestDB(t)
	if _, err := db.Exec(`INSERT INTO api_tokens (token_id, name, token_hash) VALUES (1, 'old name', 'unchanged-hash')`); err != nil {
		t.Fatalf("insert token: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO api_token_scopes (token_id, tag_id, can_read, can_write) VALUES (1, 0, 1, 0)`); err != nil {
		t.Fatalf("insert scope: %v", err)
	}

	wantScopes := []Scope{
		{TagID: 3, CanRead: true, CanWrite: false},
		{TagID: 7, CanRead: true, CanWrite: true},
	}
	token, err := UpdateAPIToken(1, "new name", wantScopes)
	if err != nil {
		t.Fatalf("UpdateAPIToken: %v", err)
	}
	if token.TokenID != 1 || token.Name != "new name" || len(token.Scopes) != 2 {
		t.Fatalf("updated token = %#v", token)
	}

	var name, tokenHash string
	if err := db.QueryRow(`SELECT name, token_hash FROM api_tokens WHERE token_id = 1`).Scan(&name, &tokenHash); err != nil {
		t.Fatalf("read token: %v", err)
	}
	if name != "new name" || tokenHash != "unchanged-hash" {
		t.Fatalf("stored token = (%q, %q), want updated name and unchanged hash", name, tokenHash)
	}

	rows, err := db.Query(`SELECT tag_id, can_read, can_write FROM api_token_scopes WHERE token_id = 1 ORDER BY tag_id`)
	if err != nil {
		t.Fatalf("read scopes: %v", err)
	}
	defer rows.Close()

	var gotScopes []Scope
	for rows.Next() {
		var scope Scope
		if err := rows.Scan(&scope.TagID, &scope.CanRead, &scope.CanWrite); err != nil {
			t.Fatalf("scan scope: %v", err)
		}
		gotScopes = append(gotScopes, scope)
	}
	if len(gotScopes) != len(wantScopes) {
		t.Fatalf("stored scopes = %#v, want %#v", gotScopes, wantScopes)
	}
	for i := range wantScopes {
		if gotScopes[i] != wantScopes[i] {
			t.Fatalf("stored scopes = %#v, want %#v", gotScopes, wantScopes)
		}
	}
}

func TestUpdateAPITokenRollsBackOnInvalidScopes(t *testing.T) {
	db := openAPITokenTestDB(t)
	if _, err := db.Exec(`INSERT INTO api_tokens (token_id, name, token_hash) VALUES (1, 'old name', 'hash')`); err != nil {
		t.Fatalf("insert token: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO api_token_scopes (token_id, tag_id, can_read, can_write) VALUES (1, 4, 1, 0)`); err != nil {
		t.Fatalf("insert scope: %v", err)
	}

	duplicateScopes := []Scope{
		{TagID: 8, CanRead: true},
		{TagID: 8, CanRead: true, CanWrite: true},
	}
	if _, err := UpdateAPIToken(1, "new name", duplicateScopes); err == nil {
		t.Fatal("UpdateAPIToken returned nil error for duplicate scopes")
	}

	var name string
	if err := db.QueryRow(`SELECT name FROM api_tokens WHERE token_id = 1`).Scan(&name); err != nil {
		t.Fatalf("read token: %v", err)
	}
	if name != "old name" {
		t.Fatalf("name = %q, want rollback to old name", name)
	}

	var tagID int
	if err := db.QueryRow(`SELECT tag_id FROM api_token_scopes WHERE token_id = 1`).Scan(&tagID); err != nil {
		t.Fatalf("read scope: %v", err)
	}
	if tagID != 4 {
		t.Fatalf("tag ID = %d, want rollback to 4", tagID)
	}
}

func TestUpdateAPITokenReturnsNotFound(t *testing.T) {
	openAPITokenTestDB(t)

	_, err := UpdateAPIToken(99, "missing", []Scope{{TagID: AllTags, CanRead: true}})
	if !errors.Is(err, utils.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
}
