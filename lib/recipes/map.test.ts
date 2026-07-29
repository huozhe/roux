import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RecipeRow } from "@/lib/db/schema";
import { rowToRecipe } from "./map";

function sampleRow(over: Partial<RecipeRow> = {}): RecipeRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    videoId: "aa1",
    playlistId: "p1",
    title: "Mapo Tofu",
    videoTitle: "REAL Mapo",
    channelTitle: "Wok Discipline",
    channelId: "ch1",
    thumbnailUrl: "https://img.example/t.jpg",
    thumbnailBlob: null,
    cuisine: "Sichuan",
    mainIngredient: "Tofu",
    cookMinutes: 25,
    servings: "serves 2",
    ingredients: [{ qty: "400 g", name: "soft tofu", inferred: false }],
    steps: [{ n: 1, text: "Simmer", t_seconds: 70 }],
    notes: "private",
    confidence: "high",
    verified: true,
    videoStatus: "ok",
    uploadedAt: new Date("2024-03-11T09:00:00.000Z"),
    addedAt: new Date("2026-07-26T09:00:00.000Z"),
    writtenAt: new Date("2026-07-28T09:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    ...over,
  };
}

describe("rowToRecipe", () => {
  it("maps camelCase row to snake-ish Recipe", () => {
    const r = rowToRecipe(sampleRow());
    assert.equal(r.id, "11111111-1111-1111-1111-111111111111");
    assert.equal(r.video_id, "aa1");
    assert.equal(r.video_title, "REAL Mapo");
    assert.equal(r.channel_title, "Wok Discipline");
    assert.equal(r.channel_id, "ch1");
    assert.equal(r.thumbnail_url, "https://img.example/t.jpg");
    assert.equal(r.main_ingredient, "Tofu");
    assert.equal(r.cook_minutes, 25);
    assert.equal(r.playlist_id, "p1");
    assert.equal(r.uploaded_at, "2024-03-11T09:00:00.000Z");
    assert.equal(r.added_at, "2026-07-26T09:00:00.000Z");
    assert.equal(r.written_at, "2026-07-28T09:00:00.000Z");
    assert.equal(r.archived_at, null);
    assert.equal(r.confidence, "high");
    assert.equal(r.video_status, "ok");
    assert.equal(r.ingredients.length, 1);
    assert.equal(r.steps[0]!.t_seconds, 70);
  });

  it("nulls dates and unknown enums safely", () => {
    const r = rowToRecipe(
      sampleRow({
        channelId: null,
        thumbnailUrl: null,
        cuisine: null,
        mainIngredient: null,
        cookMinutes: null,
        servings: null,
        notes: null,
        playlistId: null,
        uploadedAt: null,
        archivedAt: new Date("2026-07-20T00:00:00.000Z"),
        confidence: "weird",
        videoStatus: "unknown",
        ingredients: [],
        steps: [],
      }),
    );
    assert.equal(r.channel_id, null);
    assert.equal(r.uploaded_at, null);
    assert.equal(r.archived_at, "2026-07-20T00:00:00.000Z");
    assert.equal(r.confidence, "medium");
    assert.equal(r.video_status, "ok");
  });
});
