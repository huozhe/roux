import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySelection,
  mergePlaylists,
} from "./playlists";

describe("mergePlaylists", () => {
  it("merges selection and last_synced from db", () => {
    const merged = mergePlaylists(
      [
        {
          id: "p1",
          title: "Cooking",
          visibility: "private",
          item_count: 10,
        },
        {
          id: "p2",
          title: "Later",
          visibility: "public",
          item_count: 3,
        },
      ],
      [
        {
          id: "p1",
          selected: true,
          lastSynced: new Date("2026-07-01T00:00:00.000Z"),
        },
      ],
    );
    assert.equal(merged[0]!.selected, true);
    assert.equal(merged[0]!.last_synced, "2026-07-01T00:00:00.000Z");
    assert.equal(merged[1]!.selected, false);
    assert.equal(merged[1]!.last_synced, null);
    assert.equal(merged[0]!.item_count, 10);
  });
});

describe("applySelection", () => {
  it("sets selected flags from id list", () => {
    const list = applySelection(
      [
        {
          id: "a",
          title: "A",
          visibility: "private",
          item_count: 1,
          selected: false,
          last_synced: null,
        },
        {
          id: "b",
          title: "B",
          visibility: "private",
          item_count: 2,
          selected: true,
          last_synced: null,
        },
      ],
      ["b"],
    );
    assert.equal(list[0]!.selected, false);
    assert.equal(list[1]!.selected, true);
  });
});
