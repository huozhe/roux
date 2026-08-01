import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import { getUserPrefs, updateUserPrefs } from "@/lib/recipes/queries";
import type { UserPrefs } from "@/lib/types";

/** GET /api/prefs */
export async function GET() {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  try {
    const prefs = await getUserPrefs(userId);
    return NextResponse.json({ prefs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load prefs" },
      { status: 500 },
    );
  }
}

function parsePrefsPatch(body: unknown): Partial<UserPrefs> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const patch: Partial<UserPrefs> = {};

  if ("layout" in b) {
    if (b.layout !== "single" && b.layout !== "split") return null;
    patch.layout = b.layout;
  }
  if ("timestamps" in b) {
    if (typeof b.timestamps !== "boolean") return null;
    patch.timestamps = b.timestamps;
  }
  if ("newShelf" in b) {
    if (typeof b.newShelf !== "boolean") return null;
    patch.newShelf = b.newShelf;
  }
  if ("syncMarkVerified" in b) {
    if (typeof b.syncMarkVerified !== "boolean") return null;
    patch.syncMarkVerified = b.syncMarkVerified;
  }
  if ("customCuisines" in b) {
    if (
      !Array.isArray(b.customCuisines) ||
      !b.customCuisines.every((s) => typeof s === "string")
    ) {
      return null;
    }
    patch.customCuisines = b.customCuisines;
  }
  if ("customMains" in b) {
    if (
      !Array.isArray(b.customMains) ||
      !b.customMains.every((s) => typeof s === "string")
    ) {
      return null;
    }
    patch.customMains = b.customMains;
  }
  if ("hiddenCuisines" in b) {
    if (
      !Array.isArray(b.hiddenCuisines) ||
      !b.hiddenCuisines.every((s) => typeof s === "string")
    ) {
      return null;
    }
    patch.hiddenCuisines = b.hiddenCuisines;
  }
  if ("hiddenMains" in b) {
    if (
      !Array.isArray(b.hiddenMains) ||
      !b.hiddenMains.every((s) => typeof s === "string")
    ) {
      return null;
    }
    patch.hiddenMains = b.hiddenMains;
  }

  return patch;
}

/** PUT /api/prefs — partial UserPrefs merge */
export async function PUT(req: Request) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch = parsePrefsPatch(body);
  if (!patch || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const prefs = await updateUserPrefs(userId, patch);
    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/recipes", "layout");
    revalidatePath("/sync");
    return NextResponse.json({ prefs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save prefs" },
      { status: 500 },
    );
  }
}
