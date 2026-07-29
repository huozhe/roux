export type CaptionCue = {
  text: string;
  start_seconds: number;
  duration_seconds?: number;
};

export const SYSTEM_PROMPT = `You extract structured cooking recipes from YouTube video captions.

Return ONLY a single JSON object (no markdown, no commentary) with this shape:
{
  "title": string,                 // cleaned recipe name — strip clickbait, ALL CAPS hype, "REAL", emojis, "you won't believe"
  "cuisine": string | null,        // e.g. Sichuan, Italian, Japanese when clear
  "main_ingredient": string | null,// e.g. Tofu, Beef, Chicken, Seafood, Pork, Vegetable, Noodles
  "cook_minutes": number | null,   // total active+cook time if stated or clearly implied
  "servings": string | null,       // e.g. "serves 2", "4 portions"
  "ingredients": [{ "qty": string, "name": string, "inferred": boolean }],
  "steps": [{ "text": string, "t_seconds": number }],
  "confidence": "high" | "medium" | "low"
}

Rules:
- title: short, human recipe name (not the video title).
- Each step MUST include t_seconds = the caption cue start time (seconds) where that action begins. Use the nearest cue from the transcript.
- ingredients.qty: use the amount stated in captions. If the amount was not stated, invent a reasonable qty and set inferred: true.
- confidence: high = clear quantities + ordered steps; medium = some gaps/inferred; low = sparse or ambiguous transcript.
- cuisine / main_ingredient: set when reasonably clear, else null.
- Prefer controlled cuisine labels (Sichuan, Chinese, Japanese, Korean, Thai, Indian, Italian, French, Mexican, American) and mains (Beef, Pork, Chicken, Seafood, Tofu, Vegetable, Noodles) when they fit.
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
  parts.push("\nExtract the recipe JSON now.");
  return parts.join("\n");
}

export function buildRetryPrompt(previousRaw: string, errorMessage: string): string {
  return `Your previous response failed validation:
${errorMessage}

Previous response:
${previousRaw}

Fix it: return ONLY valid JSON matching the schema (no markdown fences).`;
}
