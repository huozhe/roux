import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOTES_DEBOUNCE_MS,
  NOTES_STATUS,
  notesPatchBody,
} from "./useRecipeNotes";

describe("notes autosave constants", () => {
  it("keeps the 600ms debounce used on main", () => {
    assert.equal(NOTES_DEBOUNCE_MS, 600);
  });

  it("exposes the status strings the UI relies on", () => {
    assert.equal(NOTES_STATUS.idle, "Only you can see these");
    assert.equal(NOTES_STATUS.saving, "Saving…");
    assert.equal(NOTES_STATUS.saved, "Saved to this recipe");
    assert.equal(NOTES_STATUS.failed, "Couldn’t save notes");
  });
});

describe("notesPatchBody", () => {
  it("sends empty string as null", () => {
    assert.deepEqual(notesPatchBody(""), { notes: null });
  });

  it("passes through non-empty notes", () => {
    assert.deepEqual(notesPatchBody("salt more"), { notes: "salt more" });
  });
});
