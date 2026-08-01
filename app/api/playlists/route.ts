import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  RATE_LIMITS,
  rateLimitResponse,
  takeRateLimit,
} from "@/lib/rate-limit";
import { resolveAppUserId } from "@/lib/recipes/auth";
import {
  applySelection,
  fixturePlaylists,
  listStoredPlaylists,
  refreshUserPlaylists,
  setSelectedPlaylists,
} from "@/lib/youtube/playlists";

function hasDb() {
  return Boolean(process.env.DATABASE_URL);
}

function authReady() {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_SECRET);
}

/**
 * GET /api/playlists — stored playlists (default).
 * GET /api/playlists?refresh=1 — pull full catalog from YouTube + merge selection.
 */
export async function GET(req: Request) {
  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);
  const refresh =
    new URL(req.url).searchParams.get("refresh") === "1" ||
    new URL(req.url).searchParams.get("refresh") === "true";

  if (!userId || !hasDb() || !authReady()) {
    return NextResponse.json({
      playlists: fixturePlaylists(),
      source: "fixtures" as const,
    });
  }

  try {
    if (refresh) {
      // SEC-4: YouTube playlists.list quota — per-user refresh cap.
      const rl = takeRateLimit(
        `playlists-refresh:${userId}`,
        RATE_LIMITS.playlistsRefresh.limit,
        RATE_LIMITS.playlistsRefresh.windowMs,
      );
      if (!rl.ok) return rateLimitResponse(rl);

      const playlists = await refreshUserPlaylists(userId);
      return NextResponse.json({
        playlists,
        source: "youtube" as const,
      });
    }

    const playlists = await listStoredPlaylists(userId);
    return NextResponse.json({
      playlists,
      source: "db" as const,
    });
  } catch (err) {
    if (refresh) {
      try {
        const stored = await listStoredPlaylists(userId);
        if (stored.length > 0) {
          return NextResponse.json({
            playlists: stored,
            source: "db" as const,
            warning:
              err instanceof Error ? err.message : "YouTube refresh failed",
          });
        }
      } catch {
        /* ignore secondary failure */
      }
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to list playlists",
      },
      { status: 502 },
    );
  }
}

/**
 * PUT /api/playlists { selected: string[] }
 * Multi-select source playlists for sync.
 */
export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const selected = (body as { selected?: unknown })?.selected;
  if (
    !Array.isArray(selected) ||
    !selected.every((id) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "Body must be { selected: string[] }" },
      { status: 400 },
    );
  }

  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);

  if (!userId || !hasDb() || !authReady()) {
    const playlists = applySelection(fixturePlaylists(), selected as string[]);
    return NextResponse.json({
      playlists,
      source: "fixtures" as const,
    });
  }

  try {
    const playlists = await setSelectedPlaylists(userId, selected as string[]);
    return NextResponse.json({
      playlists,
      source: "db" as const,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to save playlist selection",
      },
      { status: 500 },
    );
  }
}
