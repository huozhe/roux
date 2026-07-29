import { headers } from "next/headers";
import { AccountCard } from "@/components/settings/AccountCard";
import { CategoriesEditor } from "@/components/settings/CategoriesEditor";
import { ExportButtons } from "@/components/settings/ExportButtons";
import { PlaylistPicker } from "@/components/settings/PlaylistPicker";
import { PrefsForm } from "@/components/settings/PrefsForm";
import { ShareLinksList } from "@/components/settings/ShareLinksList";
import { auth } from "@/lib/auth";
import { categoryOptions, CUISINES, MAINS } from "@/lib/categories";
import { resolveAppUserId } from "@/lib/recipes/auth";
import {
  getUserPrefs,
  learnCategoriesFromUserRecipes,
  listShareLinks,
} from "@/lib/recipes/queries";
import { DEFAULT_PREFS } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings · Roux",
};

async function publicOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
  } catch {
    /* ignore */
  }
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, "");
  return "";
}

export default async function SettingsPage() {
  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);
  const hasDb = Boolean(process.env.DATABASE_URL && userId);
  const origin = await publicOrigin();

  let prefs = DEFAULT_PREFS;
  let shareLinks: Array<{ slug: string; title: string; url: string }> = [];

  if (hasDb && userId) {
    try {
      // Fold any cuisine/main already on recipes into prefs (LLM labels).
      await learnCategoriesFromUserRecipes(userId).catch(() => null);
      prefs = await getUserPrefs(userId);
      const links = await listShareLinks(userId);
      shareLinks = links.map((l) => ({
        slug: l.slug,
        title: l.title,
        url: origin ? `${origin}/r/${l.slug}` : `/r/${l.slug}`,
      }));
    } catch {
      /* keep defaults */
    }
  }

  const cuisineOptions = categoryOptions(
    CUISINES,
    prefs.customCuisines,
    prefs.hiddenCuisines,
  );
  const mainOptions = categoryOptions(
    MAINS,
    prefs.customMains,
    prefs.hiddenMains,
  );

  return (
    <div
      style={{
        minHeight: "100%",
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          padding: "26.4px 17.6px 70px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div>
          <h1 style={{ fontSize: 34, margin: 0 }}>Settings</h1>
          <div className="text-muted" style={{ fontSize: "13.5px" }}>
            One account for now. Registration opens later without moving
            anything.
          </div>
        </div>

        {session?.user ? (
          <AccountCard />
        ) : (
          <div className="card elev-sm" style={{ padding: 22, gap: "17.6px" }}>
            <h4 style={{ margin: 0 }}>Account</h4>
            <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
              Sign in with Google to load your YouTube playlists and sync.
            </p>
            <a
              href="/login"
              className="btn btn-primary"
              style={{ marginTop: 0, alignSelf: "flex-start" }}
            >
              Continue with Google
            </a>
          </div>
        )}

        <PlaylistPicker />

        <PrefsForm initial={prefs} />

        <div className="card elev-sm" style={{ padding: 22, gap: "8.8px" }}>
          <h4 style={{ margin: 0 }}>When a video disappears</h4>
          <p style={{ margin: 0, fontSize: 14 }}>
            Roux keeps the recipe. Whether you pull the video out of the
            playlist or the uploader takes it down, the write-up, your edits and
            your notes stay — the recipe is just flagged, and the dead link is
            disabled. A lost video is never a lost recipe.
          </p>
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
            Only you can remove a recipe, from its own page. Archived recipes
            wait 30 days and keep a tombstone so a later sync won&apos;t re-add
            them.
          </p>
        </div>

        <ShareLinksList initialLinks={shareLinks} />

        <ExportButtons />

        <CategoriesEditor
          initialCuisines={cuisineOptions}
          initialMains={mainOptions}
          initialHiddenCuisines={prefs.hiddenCuisines ?? []}
          initialHiddenMains={prefs.hiddenMains ?? []}
        />
      </div>
    </div>
  );
}
