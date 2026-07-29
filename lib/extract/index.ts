import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedRecipe } from "@/lib/types";
import { formatParseError, parseExtractedJson } from "./schema";
import {
  SYSTEM_PROMPT,
  buildRetryPrompt,
  buildUserPrompt,
  type CaptionCue,
} from "./prompt";

export type { CaptionCue };

export type ExtractOpts = {
  videoTitle?: string;
  /** Injected client for tests; defaults to new Anthropic(). */
  client?: Anthropic;
  model?: string;
};

const DEFAULT_MODEL = "claude-sonnet-4-6";
/** Long Chinese cooking videos can produce large JSON; 4k was truncating. */
const MAX_TOKENS = 8192;

function textFromMessage(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function callClaude(
  client: Anthropic,
  model: string,
  userContent: string,
): Promise<{ text: string; truncated: boolean }> {
  const msg = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  return {
    text: textFromMessage(msg),
    truncated: msg.stop_reason === "max_tokens",
  };
}

/**
 * Extract a structured recipe from timed caption cues via Claude.
 * Retries up to 2x on invalid JSON / schema / truncation.
 */
export async function extractRecipe(
  cues: CaptionCue[],
  opts?: ExtractOpts,
): Promise<ExtractedRecipe> {
  if (!cues.length) {
    throw new Error("extractRecipe: no caption cues");
  }

  const client = opts?.client ?? new Anthropic();
  const model = opts?.model ?? DEFAULT_MODEL;
  let userPrompt = buildUserPrompt(cues, { videoTitle: opts?.videoTitle });

  let lastError = "unknown";
  let lastRaw = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    const { text, truncated } = await callClaude(client, model, userPrompt);
    lastRaw = text;
    if (truncated) {
      lastError = "Response truncated (max_tokens); need shorter recipe JSON";
      userPrompt = buildRetryPrompt(
        text.slice(0, 4000),
        lastError +
          ". Return compact JSON: fewer ingredient lines if needed, still ≥1 ingredient and ≥1 step, under 10 steps.",
      );
      continue;
    }
    try {
      return parseExtractedJson(text);
    } catch (err) {
      lastError = formatParseError(err);
      userPrompt = buildRetryPrompt(text, lastError);
    }
  }

  throw new Error(
    `extractRecipe failed after retries: ${lastError}` +
      (lastRaw ? ` | raw=${lastRaw.slice(0, 180).replace(/\s+/g, " ")}` : ""),
  );
}

export {
  parseExtractedJson,
  extractJsonObject,
  formatParseError,
  extractedRecipeSchema,
} from "./schema";
export { SYSTEM_PROMPT, buildUserPrompt, formatCues } from "./prompt";
