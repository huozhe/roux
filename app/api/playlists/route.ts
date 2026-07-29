import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
 * GET /api/playlists — YouTube list merged with selected flags.
 * Without session/DB: fixture playlists (UI dev).
 */
export async function GET() {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;

  if (!userId || !hasDb() || !authReady()) {
    return NextResponse.json({
      playlists: fixturePlaylists(),
      source: "fixtures" as const,
    });
  }

  try {
    const playlists = await refreshUserPlaylists(userId);
    return NextResponse.json({
      playlists,
      source: "youtube" as const,
    });
  } catch (err) {
    // Fall back to last stored rows if YouTube is down / token missing.
    try {
      const stored = await listStoredPlaylists(userId);
      if (stored.length > 0) {
        return NextResponse.json({
          playlists: stored,
          source: "db" as const,
          warning: err instanceof Error ? err.message : "YouTube refresh failed",
        });
      }
    } catch {
      /* ignore secondary failure */
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
  const userId = session?.user?.id;

  if (!userId || !hasDb() || !authReady()) {
    const playlists = applySelection(fixturePlaylists(), selected as string[]);
    return NextResponse.json({
      playlists,
      source: "fixtures" as const,
    });
  }

  try {
    // Ensure we have current YouTube catalog before applying selection.
    await refreshUserPlaylists(userId);
    const playlists = await setSelectedPlaylists(userId, selected as string[]);
    return NextResponse.json({
      playlists,
      source: "youtube" as const,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update playlists",
      },
      { status: 502 },
    );
  }
}
