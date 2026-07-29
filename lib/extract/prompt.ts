export type CaptionCue = {
  text: string;
  start_seconds: number;
  duration_seconds?: number;
};

export const SYSTEM_PROMPT = `You extract structured cooking recipes from YouTube video captions.

Return ONLY a single JSON object (no markdown, no commentary) with this shape:
{
  "title": string,
  "cuisine": string | null,
  "main_ingredient": string | null,
  "cook_minutes": number | null,
  "servings": string | null,
  "ingredients": [
    {
      "qty": string,
      "name": string,
      "inferred": boolean,
      "group": string
    }
  ],
  "steps": [{ "text": string, "t_seconds": number }],
  "confidence": "high" | "medium" | "low"
}

## Title & meta
- title: short, human recipe name — strip clickbait, ALL CAPS hype, "REAL", emojis, "you won't believe".
- cuisine / main_ingredient: set when reasonably clear, else null. Prefer labels like Sichuan, Chinese, Japanese, Korean, Thai, Indian, Italian, French, Mexican, American and mains Beef, Pork, Chicken, Seafood, Tofu, Vegetable, Noodles.
- cook_minutes / servings: from captions when stated or clearly implied.
- confidence: high = clear quantities + ordered steps; medium = some gaps/inferred; low = sparse or ambiguous transcript.

## Ingredients (professional culinary format)
Write the ingredient list as a chef or recipe editor would for a published cookbook or line kitchen:

1. **Every item has a group** label. Use standard mise-en-place groups, in this preferred order when they appear:
   - Protein
   - Produce (vegetables, fruit, mushrooms)
   - Aromatics (onion, garlic, ginger, scallion, fresh chili, herbs used as base)
   - Dairy & eggs (if any)
   - Spices & dry seasonings
   - Sauces & condiments
   - Liquids & oils (stock, water, cooking oil, slurry)
   - Garnish
   For multi-component dishes, prefer component groups instead when clearer, e.g.:
   - For the braise · For the sauce · For searing · To finish
   Use Title Case short labels (not ALL CAPS).

2. **Order**: emit ingredients already sorted — all items of one group together, groups in kitchen-standard order above (or component order for multi-part recipes). Do not interleave groups.

3. **Naming**: clean, specific, consistent. Prefer "light soy sauce" over rambling asides. Put prep notes in the name after a comma when useful ("soft tofu, cubed"). Drop filler speech ("you know", "like I said").

4. **Quantities**:
   - qty: standardized forms when the transcript allows (e.g. "400 g", "2 tbsp", "1 cup", "2", "to taste").
   - Prefer metric mass/volume when the speaker gives grams/ml; otherwise keep common kitchen units.
   - If the amount was not stated, give a reasonable qty and set inferred: true.
   - Avoid vague qty text like "several" when you can pick a usable amount; if you must stay vague, still set inferred: true.

5. **Completeness**: include every ingredient needed for the dish that the transcript implies; do not invent ingredients that never appear. Collapse duplicates (one line per distinct item).

## Steps
- Consolidate into fewer, kitchen-usable actions. Target 5–9 steps; hard limit fewer than 10 total.
- Merge prep, seasoning, and continuous cooking into single steps when they form one phase. Do not write one step per caption line.
- Each step MUST include t_seconds = caption cue start (seconds) where that phase begins.
- Do not invent steps that never appear. Merge rambling chat into concise imperative steps.`;

export function formatCues(cues: CaptionCue[]): string {
  return cues
    .map((c) => {
      const t = Math.floor(c.start_seconds);
      const mm = String(Math.floor(t / 60)).padStart(2, "0");
      const ss = String(t % 60).padStart(2, "0");
      return `[${mm}:${ss}] ${c.text}`;
    })
    .join("\n");
}

export function buildUserPrompt(
  cues: CaptionCue[],
  opts?: { videoTitle?: string },
): string {
  const parts: string[] = [];
  if (opts?.videoTitle) {
    parts.push(`Video title (may be clickbait): ${opts.videoTitle}`);
  }
  parts.push("Timed captions:");
  parts.push(formatCues(cues));
  parts.push(
    "\nExtract the recipe JSON now. Ingredient list must be grouped and ordered to professional culinary standard; each item needs a group label.",
  );
  return parts.join("\n");
}

export function buildRetryPrompt(
  previousRaw: string,
  errorMessage: string,
): string {
  return `Your previous response failed validation:
${errorMessage}

Previous response:
${previousRaw}

Fix it: return ONLY valid JSON matching the schema (no markdown fences). Every ingredient must include qty, name, inferred, and group.`;
}
