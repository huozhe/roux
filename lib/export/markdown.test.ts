import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipeToMarkdown } from "./markdown";
import type { Recipe } from "@/lib/types";

const sample: Recipe = {
  id: "r1",
  video_id: "aa1",
  title: "Mapo Tofu",
  video_title: "REAL Mapo Tofu",
  channel_title: "Wok Discipline",
  channel_id: null,
  thumbnail_url: null,
  cuisine: "Sichuan",
  main_ingredient: "Tofu",
  cook_minutes: 25,
  servings: "serves 2",
  ingredients: [
    { qty: "400 g", name: "soft tofu, cubed", inferred: false },
    { qty: "1 tbsp", name: "cornstarch slurry", inferred: true },
  ],
  steps: [
    { n: 1, text: "Slide the tofu into salted water.", t_seconds: 70 },
    { n: 2, text: "Render the pork.", t_seconds: 160 },
  ],
  notes: "Double the Sichuan pepper.",
  confidence: "medium",
  verified: false,
  video_status: "ok",
  playlist_id: "p1",
  uploaded_at: "2024-03-11T09:00:00.000Z",
  added_at: "2026-07-26T09:00:00.000Z",
  written_at: "2026-07-28T09:00:00.000Z",
  archived_at: null,
};

describe("recipeToMarkdown", () => {
  it("includes title, ingredients, steps, notes", () => {
    const md = recipeToMarkdown(sample);
    assert.ok(md.startsWith("# Mapo Tofu"));
    assert.ok(md.includes("Sichuan · Tofu · 25 min · serves 2"));
    assert.ok(md.includes("## Ingredients"));
    assert.ok(md.includes("**400 g** soft tofu, cubed"));
    assert.ok(md.includes("**[1 tbsp]** cornstarch slurry"));
    assert.ok(md.includes("## Steps"));
    assert.ok(md.includes("1. Slide the tofu into salted water. _(at 1:10)_"));
    assert.ok(md.includes("## Notes"));
    assert.ok(md.includes("Double the Sichuan pepper."));
    assert.ok(md.includes("Wok Discipline"));
  });

  it("omits notes section when empty", () => {
    const md = recipeToMarkdown({ ...sample, notes: null });
    assert.ok(!md.includes("## Notes"));
  });
});
