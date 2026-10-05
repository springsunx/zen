import { test } from "node:test";
import assert from "node:assert/strict";
import EditorWidthPreferences from "./EditorWidthPreferences.js";

function useStorage(store) {
  globalThis.localStorage = {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); }
  };
  return store;
}

test("falls back to the default width when nothing is stored", () => {
  useStorage({});
  assert.equal(EditorWidthPreferences.getWidth(false), EditorWidthPreferences.DEFAULT_WIDTH);
  assert.equal(EditorWidthPreferences.getWidth(true), EditorWidthPreferences.DEFAULT_WIDTH);
});

test("raises stored widths to the readable floor", () => {
  useStorage({ "editor-width-browse": "12" });
  assert.equal(EditorWidthPreferences.getWidth(false), EditorWidthPreferences.MIN_WIDTH);
});

test("leaves wide values alone so the column can fill the pane", () => {
  useStorage({ "editor-width-browse": "2400", "editor-width-expanded": "99999" });
  assert.equal(EditorWidthPreferences.getWidth(false), 2400);
  assert.equal(EditorWidthPreferences.getWidth(true), 99999);
});

test("keeps browse and expanded widths independent", () => {
  const store = useStorage({});
  EditorWidthPreferences.setWidth(700, false);
  EditorWidthPreferences.setWidth(1100, true);

  assert.equal(EditorWidthPreferences.getWidth(false), 700);
  assert.equal(EditorWidthPreferences.getWidth(true), 1100);
  assert.equal(store["editor-width-browse"], "700");
  assert.equal(store["editor-width-expanded"], "1100");
});

test("clamps only the floor before writing", () => {
  const store = useStorage({});
  EditorWidthPreferences.setWidth(10, false);
  EditorWidthPreferences.setWidth(5000, true);

  assert.equal(store["editor-width-browse"], String(EditorWidthPreferences.MIN_WIDTH));
  assert.equal(store["editor-width-expanded"], "5000");
});

test("ignores values that are not numbers", () => {
  useStorage({ "editor-width-browse": "wide" });
  assert.equal(EditorWidthPreferences.getWidth(false), EditorWidthPreferences.DEFAULT_WIDTH);
});

test("survives storage that throws", () => {
  globalThis.localStorage = {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("storage blocked"); }
  };

  assert.equal(EditorWidthPreferences.getWidth(false), EditorWidthPreferences.DEFAULT_WIDTH);
  assert.doesNotThrow(() => EditorWidthPreferences.setWidth(900, false));
});
