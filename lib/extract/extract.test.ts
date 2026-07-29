import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  parseExtractedJson,
  extractedRecipeSchema,
  extractRecipe,
  buildUserPrompt,
  formatCues,
  type CaptionCue,
} from "./index";
import mapoCues from "@/lib/fixtures/transcripts/mapo-tofu.json";

const validFixture = {
  title: "Mapo Tofu",
  cuisine: "Sichuan",
  main_ingredient: "Tofu",
  cook_minutes: 25,
  servings: "serves 2",
  ingredients: [
    { qty: "400 g", name: "soft tofu", inferred: false },
    { qty: "150 g", name: "ground pork", inferred: false },
    { qty: "2 tbsp", name: "doubanjiang", inferred: true },
  ],
  steps: [
    { text: "Blanch tofu cubes in salted water.", t_seconds: 45 },
    { text: "Brown the pork in a hot wok.", t_seconds: 90 },
    { text: "Add doubanjiang and aromatics; fry until fragrant.", t_seconds: 120 },
    { text: "Add stock and tofu; simmer gently.", t_seconds: 150 },
    { text: "Thicken with slurry; finish with pepper oil.", t_seconds: 200 },
  ],
  confidence: "high" as const,
};

describe("parseExtractedJson", () => {
  it("parses bare JSON", () => {
    const r = parseExtractedJson(JSON.stringify(validFixture));
    assert.equal(r.title, "Mapo Tofu");
    assert.equal(r.ingredients.length, 3);
    assert.equal(r.ingredients[2]!.inferred, true);
    assert.equal(r.steps[0]!.t_seconds, 45);
    assert.equal(r.confidence, "high");
  });

  it("strips markdown fences", () => {
    const raw = "```json\n" + JSON.stringify(validFixture) + "\n```";
    const r = parseExtractedJson(raw);
    assert.equal(r.title, "Mapo Tofu");
  });

  it("rejects empty title", () => {
    assert.throws(() =>
      parseExtractedJson(
        JSON.stringify({ ...validFixture, title: "" }),
      ),
    );
  });

  it("rejects missing ingredients", () => {
    assert.throws(() =>
      parseExtractedJson(
        JSON.stringify({ ...validFixture, ingredients: [] }),
      ),
    );
  });

  it("rejects bad confidence", () => {
    assert.throws(() =>
      parseExtractedJson(
        JSON.stringify({ ...validFixture, confidence: "maybe" }),
      ),
    );
  });

  it("rejects invalid JSON", () => {
    assert.throws(() => parseExtractedJson("not json at all"));
  });

  it("allows null optional fields", () => {
    const r = parseExtractedJson(
      JSON.stringify({
        ...validFixture,
        cuisine: null,
        main_ingredient: null,
        cook_minutes: null,
        servings: null,
        confidence: "low",
      }),
    );
    assert.equal(r.cuisine, null);
    assert.equal(r.cook_minutes, null);
    assert.equal(r.confidence, "low");
  });
});

describe("extractedRecipeSchema", () => {
  it("matches ExtractedRecipe shape", () => {
    const parsed = extractedRecipeSchema.parse(validFixture);
    assert.ok(parsed.steps.every((s) => typeof s.t_seconds === "number"));
  });
});

describe("formatCues / buildUserPrompt", () => {
  const cues = mapoCues as CaptionCue[];

  it("formats timestamps", () => {
    const line = formatCues([cues[0]!]);
    assert.match(line, /\[00:00\]/);
    assert.match(line, /mapo tofu/i);
  });

  it("includes video title when given", () => {
    const p = buildUserPrompt(cues, {
      videoTitle: "YOU WON'T BELIEVE this MAPO TOFU!!!",
    });
    assert.match(p, /YOU WON'T BELIEVE/);
    assert.match(p, /Timed captions/);
  });
});

describe("extractRecipe", () => {
  it("returns parsed recipe from mock client", async () => {
    const create = mock.fn(async () => ({
      content: [{ type: "text" as const, text: JSON.stringify(validFixture) }],
    }));
    const client = { messages: { create } } as never;

    const r = await extractRecipe(mapoCues as CaptionCue[], {
      client,
      videoTitle: "REAL Mapo Tofu You NEED",
    });
    assert.equal(r.title, "Mapo Tofu");
    assert.equal(create.mock.callCount(), 1);
  });

  it("retries once on invalid first response", async () => {
    let n = 0;
    const create = mock.fn(async () => {
      n += 1;
      if (n === 1) {
        return { content: [{ type: "text" as const, text: "oops not json" }] };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(validFixture) }],
      };
    });
    const client = { messages: { create } } as never;

    const r = await extractRecipe([{ text: "cook tofu", start_seconds: 1 }], {
      client,
    });
    assert.equal(r.title, "Mapo Tofu");
    assert.equal(create.mock.callCount(), 2);
  });

  it("throws when no cues", async () => {
    await assert.rejects(() => extractRecipe([]), /no caption cues/);
  });
});
