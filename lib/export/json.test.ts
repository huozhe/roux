import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipesToJson } from "./json";
import type { Recipe } from "@/lib/types";

const sample: Recipe = {
  id: "r1",
  video_id: "aa1",
  title: "Mapo Tofu",
  video_title: "REAL Mapo",
  channel_title: "Wok Discipline",
  channel_id: null,
  thumbnail_url: null,
  cuisine: "Sichuan",
  main_ingredient: "Tofu",
  cook_minutes: 25,
  servings: "serves 2",
  ingredients: [{ qty: "400 g", name: "soft tofu", inferred: false }],
  steps: [{ n: 1, text: "Simmer tofu", t_seconds: 70 }],
  notes: "Extra spicy",
  confidence: "medium",
  verified: false,
  video_status: "ok",
  playlist_id: "p1",
  uploaded_at: "2024-03-11T09:00:00.000Z",
  added_at: "2026-07-26T09:00:00.000Z",
  written_at: "2026-07-28T09:00:00.000Z",
  archived_at: null,
};

describe("recipesToJson", () => {
  it("pretty-prints an array including notes", () => {
    const out = recipesToJson([sample]);
    const parsed = JSON.parse(out) as Recipe[];
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]!.title, "Mapo Tofu");
    assert.equal(parsed[0]!.notes, "Extra spicy");
    assert.ok(out.includes("\n"));
  });

  it("handles empty list", () => {
    assert.equal(recipesToJson([]), "[]");
  });
});
