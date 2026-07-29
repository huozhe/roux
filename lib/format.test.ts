import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCookMinutes,
  formatQty,
  formatTimestamp,
  makeShareSlug,
  parseTimestamp,
  slugifyTitle,
  youtubeStepUrl,
} from "./format";
import { filterAndSortRecipes } from "./search";
import type { Recipe } from "./types";

describe("formatQty", () => {
  it("leaves normal qty alone", () => {
    assert.equal(formatQty({ qty: "2 tbsp", inferred: false }), "2 tbsp");
  });
  it("brackets inferred", () => {
    assert.equal(formatQty({ qty: "1 tbsp", inferred: true }), "[1 tbsp]");
  });
  it("does not double-bracket", () => {
    assert.equal(formatQty({ qty: "[1 tbsp]", inferred: true }), "[1 tbsp]");
  });
});

describe("timestamps", () => {
  it("parses M:SS", () => {
    assert.equal(parseTimestamp("1:10"), 70);
  });
  it("formats seconds", () => {
    assert.equal(formatTimestamp(70), "1:10");
    assert.equal(formatTimestamp(3661), "1:01:01");
  });
  it("builds youtube step urls", () => {
    assert.equal(
      youtubeStepUrl("abc", 70),
      "https://www.youtube.com/watch?v=abc&t=70s",
    );
  });
});

describe("slug", () => {
  it("slugifies titles", () => {
    assert.equal(slugifyTitle("Mapo Tofu!"), "mapo-tofu");
  });
  it("makes share slug", () => {
    assert.equal(makeShareSlug("Mapo Tofu", "a7f3"), "mapo-tofu-a7f3");
  });
});

describe("formatCookMinutes", () => {
  it("handles hours", () => {
    assert.equal(formatCookMinutes(25), "25 min");
    assert.equal(formatCookMinutes(180), "3 hr");
    assert.equal(formatCookMinutes(90), "1 hr 30");
  });
});

describe("filterAndSortRecipes", () => {
  const base: Recipe = {
    id: "x",
    video_id: "v",
    title: "Mapo Tofu",
    video_title: "REAL Mapo",
    channel_title: "Wok Discipline",
    channel_id: null,
    thumbnail_url: null,
    cuisine: "Sichuan",
    main_ingredient: "Tofu",
    cook_minutes: 25,
    servings: "serves 2",
    ingredients: [{ qty: "1", name: "tofu", inferred: false }],
    steps: [{ n: 1, text: "cook", t_seconds: 10 }],
    notes: null,
    confidence: "medium",
    verified: false,
    video_status: "ok",
    playlist_id: null,
    uploaded_at: "2024-01-01T00:00:00.000Z",
    added_at: "2026-07-01T00:00:00.000Z",
    written_at: "2026-07-01T00:00:00.000Z",
    archived_at: null,
  };

  it("filters by query and cuisine", () => {
    const other = {
      ...base,
      id: "y",
      title: "Carnitas",
      cuisine: "Mexican",
      main_ingredient: "Pork",
    };
    const hit = filterAndSortRecipes([base, other], {
      q: "tofu",
      cuisine: ["Sichuan"],
    });
    assert.equal(hit.length, 1);
    assert.equal(hit[0]!.id, "x");
  });

  it("hides archived in library view", () => {
    const archived = {
      ...base,
      id: "z",
      archived_at: "2026-07-20T00:00:00.000Z",
    };
    assert.equal(
      filterAndSortRecipes([base, archived], { view: "library" }).length,
      1,
    );
    assert.equal(
      filterAndSortRecipes([base, archived], { view: "archive" }).length,
      1,
    );
  });
});
