/**
 * Run Roux playlist → transcript → Claude extract sync on this machine.
 *
 * Use this instead of Vercel "Sync now" / cron: YouTube blocks datacenter IPs
 * (LOGIN_REQUIRED). Your home network can fetch captions; Neon still holds data.
 *
 * Usage:
 *   npm run sync
 *   npm run sync -- --max=10
 *   npm run sync -- --email=you@gmail.com
 *
 * Requires .env.local: DATABASE_URL, ANTHROPIC_API_KEY, AUTH_GOOGLE_* (for token refresh)
 * User must already have signed in once on the web app (refresh_token in DB).
 */
import { eq } from "drizzle-orm";
import { getDb, users } from "@/lib/db";
import { runSyncForUser } from "@/lib/sync";
import { loadEnvLocal } from "./load-env-local";

loadEnvLocal();

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1]!.startsWith("-")) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function printHelp(): void {
  console.log(`Roux local sync

Usage:
  npm run sync
  npm run sync -- --max=10
  npm run sync -- --email=you@gmail.com

Options:
  --max=N       Max new videos to extract this run (default SYNC_MAX_NEW or 5)
  --email=ADDR  Which account to sync (default: sole user in DB, or ROUX_SYNC_EMAIL)
  --help        Show this help

Env (.env.local):
  DATABASE_URL, ANTHROPIC_API_KEY, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET,
  TOKEN_ENCRYPTION_KEY
  Optional: SYNC_MAX_NEW, ROUX_SYNC_EMAIL
`);
}

async function resolveUserId(): Promise<{ id: string; email: string }> {
  const db = getDb();
  const email =
    argValue("email")?.trim() ||
    process.env.ROUX_SYNC_EMAIL?.trim() ||
    "";

  if (email) {
    const rows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new Error(
        `No user with email ${email}. Sign in once at the web app first.`,
      );
    }
    return row;
  }

  const all = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .limit(5);

  if (all.length === 0) {
    throw new Error(
      "No users in database. Open the deployed app, sign in with Google once, then re-run.",
    );
  }
  if (all.length > 1) {
    const list = all.map((u) => `  - ${u.email}`).join("\n");
    throw new Error(
      `Multiple users found. Pass --email=… or set ROUX_SYNC_EMAIL.\n${list}`,
    );
  }
  return all[0]!;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (add to .env.local)");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (add to .env.local)");
    process.exit(1);
  }
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    console.error(
      "AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET required to refresh YouTube tokens",
    );
    process.exit(1);
  }
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.error("TOKEN_ENCRYPTION_KEY is not set");
    process.exit(1);
  }

  const maxRaw = argValue("max") ?? process.env.SYNC_MAX_NEW;
  const maxNewVideos = maxRaw
    ? Math.max(1, Math.floor(Number(maxRaw)) || 5)
    : undefined;

  const user = await resolveUserId();
  console.log(`Syncing as ${user.email} (${user.id})`);
  if (maxNewVideos) console.log(`max new videos: ${maxNewVideos}`);
  console.log("");

  const result = await runSyncForUser(user.id, {
    maxNewVideos,
    onProgress: (p) => {
      const counts = [
        p.found != null ? `found=${p.found}` : null,
        p.written != null ? `written=${p.written}` : null,
        p.skipped != null ? `skipped=${p.skipped}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(`· ${p.stage}${counts ? `  (${counts})` : ""}`);
    },
  });

  console.log("");
  console.log("Done.");
  console.log(`  result:  ${result.result}`);
  console.log(`  found:   ${result.found}`);
  console.log(`  written: ${result.written}`);
  console.log(`  skipped: ${result.skipped}`);

  const detail = result.detail as {
    needTranscript?: Array<{ title?: string; videoId?: string; reason?: string }>;
    errors?: Array<{ message?: string; videoId?: string }>;
    maxNewVideos?: number;
  } | null;

  const nt = detail?.needTranscript ?? [];
  const errs = detail?.errors ?? [];
  if (nt.length || errs.length) {
    const loginN = nt.filter((t) => /LOGIN_REQUIRED/i.test(t.reason ?? "")).length;
    const goneN = nt.filter((t) =>
      /unavailable|deleted/i.test(t.reason ?? ""),
    ).length;
    console.log("\nSkip breakdown:");
    console.log(`  no transcript:     ${nt.length}`);
    if (loginN) console.log(`    LOGIN_REQUIRED:  ${loginN}  (cookies / IP block, not Anthropic rate limit)`);
    if (goneN) console.log(`    deleted/unavail: ${goneN}`);
    console.log(`  extract errors:    ${errs.length}`);
    if (detail?.maxNewVideos != null) {
      console.log(`  max new (writes):  ${detail.maxNewVideos}`);
    }
  }

  if (nt.length) {
    console.log("\nNo transcript (first 15):");
    for (const item of nt.slice(0, 15)) {
      console.log(`  - ${item.title ?? item.videoId ?? "?"}`);
      console.log(`    ${item.reason ?? "?"}`);
      if (item.videoId) {
        console.log(`    https://www.youtube.com/watch?v=${item.videoId}`);
      }
    }
    if (loginNHint(nt)) {
      console.log(
        "\nTip: set YOUTUBE_COOKIES in .env.local to a logged-in youtube.com Cookie header, then re-run.\n" +
          "     Caption fails no longer burn --max budget; re-run will retry remaining videos.",
      );
    }
  }
  if (errs.length) {
    console.log("\nExtract errors:");
    for (const e of errs.slice(0, 15)) {
      console.log(`  - ${e.videoId ?? "?"}: ${e.message}`);
    }
  }

  if (result.written > 0) {
    console.log(
      "\nRecipes are in Neon — refresh the library on https://roux-green.vercel.app",
    );
  }

  process.exit(result.result === "error" || result.result === "quota hit" ? 1 : 0);
}

function loginNHint(
  nt: Array<{ reason?: string }>,
): boolean {
  return nt.some((t) => /LOGIN_REQUIRED/i.test(t.reason ?? ""));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
