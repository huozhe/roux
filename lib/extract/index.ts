import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedRecipe } from "@/lib/types";
import { parseExtractedJson } from "./schema";
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
): Promise<string> {
  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  return textFromMessage(msg);
}

/**
 * Extract a structured recipe from timed caption cues via Claude.
 * Retries once if the response is invalid JSON or fails schema validation.
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
  const userPrompt = buildUserPrompt(cues, { videoTitle: opts?.videoTitle });

  const first = await callClaude(client, model, userPrompt);
  try {
    return parseExtractedJson(first);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const second = await callClaude(
      client,
      model,
      buildRetryPrompt(first, message),
    );
    return parseExtractedJson(second);
  }
}

export { parseExtractedJson, extractedRecipeSchema } from "./schema";
export { SYSTEM_PROMPT, buildUserPrompt, formatCues } from "./prompt";
