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
