package mcp

import (
	"database/sql"
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"zen/commons/auth"
	"zen/commons/sqlite"
)

func openMCPTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	// A SQLite :memory: database is scoped to one connection. Keep all helper
	// queries and the note transaction on that same connection.
	db.SetMaxOpenConns(1)
	previousDB := sqlite.DB
	sqlite.DB = db
	t.Cleanup(func() {
		sqlite.DB = previousDB
		_ = db.Close()
	})
	return db
}

func mustExecMCPTest(t *testing.T, db *sql.DB, query string) {
	t.Helper()
	if _, err := db.Exec(query); err != nil {
		t.Fatalf("execute %q: %v", query, err)
	}
}

func createMCPNoteTables(t *testing.T, db *sql.DB) {
	t.Helper()
	mustExecMCPTest(t, db, `CREATE TABLE notes (
		note_id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		deleted_at TIMESTAMP,
		archived_at TIMESTAMP,
		pinned_at TIMESTAMP
	)`)
	mustExecMCPTest(t, db, `CREATE TABLE tags (
		tag_id INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		color TEXT,
		created_at TIMESTAMP,
		updated_at TIMESTAMP,
		deleted_at TIMESTAMP
	)`)
	mustExecMCPTest(t, db, `CREATE TABLE note_tags (note_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (note_id, tag_id))`)
	mustExecMCPTest(t, db, `CREATE TABLE note_versions (version_id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
}

func toolResultData(t *testing.T, result ToolCallResult) map[string]interface{} {
	t.Helper()
	if len(result.Content) != 1 {
		t.Fatalf("content = %#v, want one JSON result", result.Content)
	}
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(result.Content[0].Text), &data); err != nil {
		t.Fatalf("decode tool result: %v", err)
	}
	return data
}

func TestCreateNoteResolvesExistingScopedTagNames(t *testing.T) {
	db := openMCPTestDB(t)
	createMCPNoteTables(t, db)
	mustExecMCPTest(t, db, `INSERT INTO tags (tag_id, name, color) VALUES (7, '标签审核', 'blue')`)

	result := handleCreateNote(map[string]interface{}{
		"title":   "审核记录",
		"content": "正文",
		"tags":    []interface{}{"标签审核"},
	}, auth.Access{ReadTagIDs: []int{7}, WriteTagIDs: []int{7}})
	if result.IsError {
		t.Fatalf("create result = %#v", toolResultData(t, result))
	}

	data := toolResultData(t, result)
	note := data["note"].(map[string]interface{})
	noteID := int(note["noteId"].(float64))
	var tagID int
	if err := db.QueryRow(`SELECT tag_id FROM note_tags WHERE note_id = ?`, noteID).Scan(&tagID); err != nil {
		t.Fatalf("read assigned tag for note %d, result %#v: %v", noteID, data, err)
	}
	if tagID != 7 {
		t.Fatalf("assigned tag ID = %d, want 7", tagID)
	}
}

func TestCreateNoteRejectsUnknownScopedTag(t *testing.T) {
	db := openMCPTestDB(t)
	createMCPNoteTables(t, db)

	result := handleCreateNote(map[string]interface{}{
		"title":   "审核记录",
		"content": "正文",
		"tags":    []interface{}{"不存在"},
	}, auth.Access{WriteTagIDs: []int{7}})
	data := toolResultData(t, result)
	if !result.IsError || data["code"] != "TAG_NOT_FOUND" {
		t.Fatalf("result = %#v, want TAG_NOT_FOUND", data)
	}
}

func TestCreateNoteRejectsDeletedScopedTag(t *testing.T) {
	db := openMCPTestDB(t)
	createMCPNoteTables(t, db)
	mustExecMCPTest(t, db, `INSERT INTO tags (tag_id, name, deleted_at) VALUES (7, '旧标签', CURRENT_TIMESTAMP)`)

	result := handleCreateNote(map[string]interface{}{
		"title":   "审核记录",
		"content": "正文",
		"tags":    []interface{}{"旧标签"},
	}, auth.Access{WriteTagIDs: []int{7}})
	data := toolResultData(t, result)
	if !result.IsError || data["code"] != "TAG_NOT_FOUND" {
		t.Fatalf("result = %#v, want TAG_NOT_FOUND", data)
	}
}

func TestToolsListIncludesTokenWritableTagNames(t *testing.T) {
	db := openMCPTestDB(t)
	mustExecMCPTest(t, db, `CREATE TABLE tags (tag_id INTEGER PRIMARY KEY, name TEXT NOT NULL)`)
	mustExecMCPTest(t, db, `INSERT INTO tags (tag_id, name) VALUES (7, '标签审核')`)

	response := handleToolsList(Request{ID: 1}, auth.Access{ReadTagIDs: []int{7}, WriteTagIDs: []int{7}})
	result, ok := response.Result.(ToolListResult)
	if !ok {
		t.Fatalf("tools/list result = %#v", response.Result)
	}
	for _, tool := range result.Tools {
		if tool.Name != "create_note" {
			continue
		}
		if !strings.Contains(tool.Description, "标签审核") {
			t.Fatalf("create_note description = %q, want writable tag name", tool.Description)
		}
		schema := tool.InputSchema.(map[string]interface{})
		required := schema["required"].([]string)
		if !slices.Contains(required, "tags") {
			t.Fatalf("create_note required fields = %#v, want tags for scoped token", required)
		}
		return
	}
	t.Fatal("create_note was not listed")
}

func TestUpdateNoteRejectsStaleUpdatedAt(t *testing.T) {
	db := openMCPTestDB(t)
	createMCPNoteTables(t, db)
	mustExecMCPTest(t, db, `INSERT INTO tags (tag_id, name, color) VALUES (7, '标签审核', 'blue')`)
	mustExecMCPTest(t, db, `INSERT INTO notes (note_id, title, content, created_at, updated_at) VALUES (3, '原题', '原文', '2026-01-02 03:04:05', '2026-01-02 03:04:05')`)
	mustExecMCPTest(t, db, `INSERT INTO note_tags (note_id, tag_id) VALUES (3, 7)`)

	result := handleUpdateNote(map[string]interface{}{
		"noteId":    float64(3),
		"updatedAt": "2026-01-02T03:04:04Z",
		"content":   "错误覆盖",
	}, auth.Access{ReadTagIDs: []int{7}, WriteTagIDs: []int{7}})
	data := toolResultData(t, result)
	if !result.IsError || data["code"] != "NOTE_CONFLICT" {
		t.Fatalf("result = %#v, want NOTE_CONFLICT", data)
	}

	var content string
	if err := db.QueryRow(`SELECT content FROM notes WHERE note_id = 3`).Scan(&content); err != nil {
		t.Fatalf("read note after conflict: %v", err)
	}
	if content != "原文" {
		t.Fatalf("content = %q, want original content", content)
	}
}

func TestInsertImageMarkdownUsesCanonicalSyntax(t *testing.T) {
	markdown := imageMarkdown("example.png", "收据")
	content, result, ok := insertImageMarkdown("原有内容", markdown, map[string]interface{}{"mode": "append"})
	if !ok || result.IsError {
		t.Fatalf("append failed: %#v", result)
	}
	if content != "原有内容\n\n![收据](/images/example.png)\n" {
		t.Fatalf("content = %q", content)
	}

	replaced, result, ok := insertImageMarkdown("前 {{image:receipt}} 后", markdown, map[string]interface{}{
		"mode":        "replacePlaceholder",
		"placeholder": "{{image:receipt}}",
	})
	if !ok || result.IsError || replaced != "前 ![收据](/images/example.png) 后" {
		t.Fatalf("replacement = %q, result = %#v", replaced, result)
	}
}
