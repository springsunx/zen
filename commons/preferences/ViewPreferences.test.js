import { test } from "node:test";
import assert from "node:assert/strict";
import ViewPreferences from "./ViewPreferences.js";

function useStorage(initial = {}) {
  const store = { ...initial };
  globalThis.localStorage = {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); }
  };
  return store;
}

test("keeps untagged view separate from all notes", () => {
  useStorage({ "view-preference-all": "card" });

  assert.equal(ViewPreferences.getPreference(null, null, false, false, false), "card");
  assert.equal(ViewPreferences.getPreference(null, null, false, false, true), "list");
});

test("stores the untagged view under its own key", () => {
  const store = useStorage({ "view-preference-all": "card" });

  ViewPreferences.setPreference("list", null, null, false, false, true);

  assert.equal(store["view-preference-untagged"], "list");
  assert.equal(store["view-preference-all"], "card");
});

test("global view mode intentionally shares the all-notes preference", () => {
  useStorage({
    "view-preference-global-mode": "true",
    "view-preference-all": "card",
    "view-preference-untagged": "list"
  });

  assert.equal(ViewPreferences.getPreference(null, null, false, false, true), "card");
});
