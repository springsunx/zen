package notes

import (
	"database/sql"
	"reflect"
	"strings"
	"testing"
	"zen/commons/auth"
	"zen/commons/sqlite"
)

func TestBuildReadableNotesPredicate(t *testing.T) {
	tests := []struct {
		name          string
		access        auth.Access
		wantPredicate string
		wantArgs      []interface{}
	}{
		{
			name:          "unrestricted",
			access:        auth.Unrestricted,
			wantPredicate: "",
			wantArgs:      nil,
		},
		{
			name:          "no readable tags",
			access:        auth.Access{ReadTagIDs: []int{}},
			wantPredicate: "AND EXISTS (SELECT 1 FROM note_tags scoped_nt WHERE scoped_nt.note_id = n.note_id AND 0)",
			wantArgs:      nil,
		},
		{
			name:          "two tags",
			access:        auth.Access{ReadTagIDs: []int{5, 9}},
			wantPredicate: "AND EXISTS (SELECT 1 FROM note_tags scoped_nt WHERE scoped_nt.note_id = n.note_id AND scoped_nt.tag_id IN (?,?))",
			wantArgs:      []interface{}{5, 9},
		},
	}

	for _, test := range tests {
		predicate, args := buildReadableNotesPredicate(test.access)

		if predicate != test.wantPredicate {
			t.Errorf("%s: predicate = %q, want %q", test.name, predicate, test.wantPredicate)
		}

		if !reflect.DeepEqual(args, test.wantArgs) {
			t.Errorf("%s: args = %v, want %v", test.name, args, test.wantArgs)
		}

		placeholderCount := strings.Count(predicate, "?")
		if placeholderCount != len(args) {
			t.Errorf("%s: %d placeholders but %d args", test.name, placeholderCount, len(args))
		}
	}
}

func TestGetPinyinTitleMatchIDs(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	defer db.Close()

	previousDB := sqlite.DB
	sqlite.DB = db
	t.Cleanup(func() { sqlite.DB = previousDB })

	if _, err := db.Exec(`CREATE TABLE notes (note_id INTEGER PRIMARY KEY, title TEXT)`); err != nil {
		t.Fatalf("create notes table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO notes (note_id, title) VALUES (1, '工作周报'), (2, '会议记录'), (3, 'Project plan')`); err != nil {
		t.Fatalf("insert notes: %v", err)
	}

	for _, test := range []struct {
		query string
		want  []int
	}{
		{query: "gongzuo", want: []int{1}},
		{query: "gz", want: []int{1}},
		{query: "hy", want: []int{2}},
	} {
		got, err := GetPinyinTitleMatchIDs(auth.Unrestricted, test.query)
		if err != nil {
			t.Fatalf("GetPinyinTitleMatchIDs(%q): %v", test.query, err)
		}
		if !reflect.DeepEqual(got, test.want) {
			t.Errorf("GetPinyinTitleMatchIDs(%q) = %v, want %v", test.query, got, test.want)
		}
	}
}

func TestGetAllNotesFiltersTitlesBeforePagination(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	defer db.Close()

	previousDB := sqlite.DB
	sqlite.DB = db
	t.Cleanup(func() { sqlite.DB = previousDB })

	for _, statement := range []string{
		`CREATE TABLE notes (
			note_id INTEGER PRIMARY KEY,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMP,
			archived_at TIMESTAMP,
			pinned_at TIMESTAMP
		)`,
		`CREATE TABLE tags (tag_id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT)`,
		`CREATE TABLE note_tags (note_id INTEGER NOT NULL, tag_id INTEGER NOT NULL)`,
		`CREATE TABLE focus_mode_tags (focus_mode_id INTEGER NOT NULL, tag_id INTEGER NOT NULL)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("create test schema: %v", err)
		}
	}

	if _, err := db.Exec(`
		INSERT INTO notes (note_id, title, content) VALUES
			(1, 'Windows 管理共享拒绝访问', ''),
			(2, '工作周报', ''),
			(3, '无关笔记', '')
	`); err != nil {
		t.Fatalf("insert notes: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO tags (tag_id, name, color) VALUES (10, 'Windows', NULL)`); err != nil {
		t.Fatalf("insert tag: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO note_tags (note_id, tag_id) VALUES (1, 10), (2, 10)`); err != nil {
		t.Fatalf("tag notes: %v", err)
	}

	filter := NewNotesFilter(1, 10, 0, false, false)
	filter.titleQuery = "wi"
	matched, total, err := GetAllNotes(auth.Unrestricted, filter)
	if err != nil {
		t.Fatalf("GetAllNotes title filter: %v", err)
	}
	if total != 1 || len(matched) != 1 || matched[0].NoteID != 1 {
		t.Fatalf("GetAllNotes title filter = notes %#v, total %d; want only Windows note", matched, total)
	}

	filter = NewNotesFilter(1, 10, 0, false, false)
	filter.titleQuery = "gz"
	matched, total, err = GetAllNotes(auth.Unrestricted, filter)
	if err != nil {
		t.Fatalf("GetAllNotes pinyin filter: %v", err)
	}
	if total != 1 || len(matched) != 1 || matched[0].NoteID != 2 {
		t.Fatalf("GetAllNotes pinyin filter = notes %#v, total %d; want only 工作周报", matched, total)
	}
}
