package tags

import (
	"database/sql"
	"reflect"
	"strings"
	"testing"
	"zen/commons/auth"
	"zen/commons/sqlite"
)

func intPtr(value int) *int {
	return &value
}

func TestBuildTagTreeKeepsDeepDisplayHierarchy(t *testing.T) {
	tags := []Tag{
		{TagID: 1, Name: "工作"},
		{TagID: 2, Name: "项目", ParentID: intPtr(1)},
		{TagID: 3, Name: "会议", ParentID: intPtr(2)},
		{TagID: 4, Name: "周会", ParentID: intPtr(3)},
	}

	tree := BuildTagTree(tags)
	if len(tree) != 1 || tree[0].TagID != 1 {
		t.Fatalf("root = %#v, want 工作", tree)
	}
	if len(tree[0].Children) != 1 || tree[0].Children[0].TagID != 2 {
		t.Fatalf("first child = %#v, want 项目", tree[0].Children)
	}
	if len(tree[0].Children[0].Children) != 1 || tree[0].Children[0].Children[0].TagID != 3 {
		t.Fatalf("second child = %#v, want 会议", tree[0].Children[0].Children)
	}
	if len(tree[0].Children[0].Children[0].Children) != 1 || tree[0].Children[0].Children[0].Children[0].TagID != 4 {
		t.Fatalf("third child = %#v, want 周会", tree[0].Children[0].Children[0].Children)
	}
}

func TestFilteredTagsShowsAncestorsWithoutInheritingTheirNoteCount(t *testing.T) {
	db := openTagTestDB(t)
	defer db.Close()

	mustExecTagTest(t, db, `CREATE TABLE tags (tag_id INTEGER PRIMARY KEY, name TEXT, color TEXT, parent_id INTEGER, sort_order INTEGER)`)
	mustExecTagTest(t, db, `CREATE TABLE notes (note_id INTEGER PRIMARY KEY, archived_at TIMESTAMP, deleted_at TIMESTAMP)`)
	mustExecTagTest(t, db, `CREATE TABLE note_tags (note_id INTEGER, tag_id INTEGER)`)
	mustExecTagTest(t, db, `CREATE TABLE focus_mode_tags (focus_mode_id INTEGER, tag_id INTEGER)`)
	mustExecTagTest(t, db, `INSERT INTO tags (tag_id, name, parent_id) VALUES (1, '工作', NULL), (2, '项目', 1), (3, '会议', 2)`)
	mustExecTagTest(t, db, `INSERT INTO notes (note_id) VALUES (10)`)
	mustExecTagTest(t, db, `INSERT INTO note_tags (note_id, tag_id) VALUES (10, 3)`)
	mustExecTagTest(t, db, `INSERT INTO focus_mode_tags (focus_mode_id, tag_id) VALUES (7, 3)`)

	tags, err := GetFilteredTags(0, false, false, "notes", "")
	if err != nil {
		t.Fatalf("GetFilteredTags returned error: %v", err)
	}
	counts := map[int]int{}
	for _, tag := range tags {
		counts[tag.TagID] = tag.NoteCount
	}
	if !reflect.DeepEqual(counts, map[int]int{1: 0, 2: 0, 3: 1}) {
		t.Fatalf("tag counts = %#v, want direct counts with visible ancestors", counts)
	}

	focusTags, err := GetFilteredTags(7, false, false, "notes", "")
	if err != nil {
		t.Fatalf("GetFilteredTags for focus returned error: %v", err)
	}
	focusIDs := map[int]bool{}
	for _, tag := range focusTags {
		focusIDs[tag.TagID] = true
	}
	if !reflect.DeepEqual(focusIDs, map[int]bool{1: true, 2: true, 3: true}) {
		t.Fatalf("focus tag tree = %#v, want selected tag and display ancestors", focusIDs)
	}
}

func TestCreatingTagWithSlashDoesNotInferHierarchy(t *testing.T) {
	db := openTagTestDB(t)
	defer db.Close()
	mustExecTagTest(t, db, `CREATE TABLE tags (tag_id INTEGER PRIMARY KEY, name TEXT, parent_id INTEGER)`)

	tagID, name, err := ParseAndCreateTagHierarchy("工作/会议", db)
	if err != nil {
		t.Fatalf("ParseAndCreateTagHierarchy returned error: %v", err)
	}
	if tagID == 0 || name != "工作/会议" {
		t.Fatalf("created tag = (%d, %q), want a literal slash label", tagID, name)
	}

	var parentID sql.NullInt64
	if err := db.QueryRow(`SELECT parent_id FROM tags WHERE tag_id = ?`, tagID).Scan(&parentID); err != nil {
		t.Fatalf("read created tag: %v", err)
	}
	if parentID.Valid {
		t.Fatalf("parent_id = %d, want NULL", parentID.Int64)
	}
}

func TestMatchesPinyin(t *testing.T) {
	for _, query := range []string{"gongzuo", "gz"} {
		if !MatchesPinyin("工作", query) {
			t.Fatalf("MatchesPinyin(工作, %q) = false, want true", query)
		}
	}

	if MatchesPinyin("工作", "hy") {
		t.Fatal("MatchesPinyin(工作, hy) = true, want false")
	}
}

func openTagTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	previousDB := sqlite.DB
	sqlite.DB = db
	t.Cleanup(func() { sqlite.DB = previousDB })
	return db
}

func mustExecTagTest(t *testing.T, db *sql.DB, query string) {
	t.Helper()
	if _, err := db.Exec(query); err != nil {
		t.Fatalf("execute %q: %v", query, err)
	}
}

func TestBuildReadableTagsPredicate(t *testing.T) {
	tests := []struct {
		name          string
		access        auth.Access
		wantPredicate string
		wantArgs      []interface{}
	}{
		{name: "unrestricted", access: auth.Unrestricted, wantPredicate: "", wantArgs: nil},
		{name: "no readable tags", access: auth.Access{ReadTagIDs: []int{}}, wantPredicate: "AND 0", wantArgs: nil},
		{name: "one tag", access: auth.Access{ReadTagIDs: []int{4}}, wantPredicate: "AND t.tag_id IN (?)", wantArgs: []interface{}{4}},
		{name: "three tags", access: auth.Access{ReadTagIDs: []int{1, 2, 3}}, wantPredicate: "AND t.tag_id IN (?,?,?)", wantArgs: []interface{}{1, 2, 3}},
	}

	for _, test := range tests {
		predicate, args := BuildReadableTagsPredicate(test.access, "t.tag_id")

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
