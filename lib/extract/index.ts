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

/** Per-attempt Anthropic usage for sync_runs.detail telemetry. */
export type ExtractAttemptUsage = {
  attempt: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type ExtractOutcome = {
  recipe: ExtractedRecipe;
  attempts: number;
  usage: ExtractAttemptUsage[];
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

function usageFromMessage(
  attempt: number,
  msg: Anthropic.Message,
): ExtractAttemptUsage {
  const u = msg.usage as Anthropic.Usage & {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  return {
    attempt,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    ...(u.cache_creation_input_tokens != null
      ? { cache_creation_input_tokens: u.cache_creation_input_tokens }
      : {}),
    ...(u.cache_read_input_tokens != null
      ? { cache_read_input_tokens: u.cache_read_input_tokens }
      : {}),
  };
}

async function callClaude(
  client: Anthropic,
  model: string,
  userContent: string,
  attempt: number,
): Promise<{
  text: string;
  truncated: boolean;
  usage: ExtractAttemptUsage;
}> {
  const msg = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    // SYSTEM_PROMPT measured ~1063 tokens via countTokens (>1024 Sonnet cache min).
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });
  return {
    text: textFromMessage(msg),
    truncated: msg.stop_reason === "max_tokens",
    usage: usageFromMessage(attempt, msg),
  };
}

/**
 * Extract a structured recipe from timed caption cues via Claude.
 * Retries up to 2x on invalid JSON / schema / truncation.
 */
export async function extractRecipe(
  cues: CaptionCue[],
  opts?: ExtractOpts,
): Promise<ExtractOutcome> {
  if (!cues.length) {
    throw new Error("extractRecipe: no caption cues");
  }

  const client = opts?.client ?? new Anthropic();
  const model = opts?.model ?? DEFAULT_MODEL;
  let userPrompt = buildUserPrompt(cues, { videoTitle: opts?.videoTitle });

  let lastError = "unknown";
  let lastRaw = "";
  const usage: ExtractAttemptUsage[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const {
      text,
      truncated,
      usage: attemptUsage,
    } = await callClaude(client, model, userPrompt, attempt + 1);
    usage.push(attemptUsage);
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
      return {
        recipe: parseExtractedJson(text),
        attempts: attempt + 1,
        usage,
      };
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
