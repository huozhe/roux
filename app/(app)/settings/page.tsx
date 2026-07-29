import { CategoriesEditor } from "@/components/settings/CategoriesEditor";
import { ExportButtons } from "@/components/settings/ExportButtons";
import { PrefsForm } from "@/components/settings/PrefsForm";
import { ShareLinksList } from "@/components/settings/ShareLinksList";

export const metadata = {
  title: "Settings · Roux",
};

export default function SettingsPage() {
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

        {/* Account — T1 / auth */}
        <div className="card elev-sm" style={{ padding: 22, gap: "17.6px" }}>
          <h4 style={{ margin: 0 }}>Account</h4>
          <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
            Sign in required
          </p>
        </div>

        {/* Playlists — T4 */}
        <div className="card elev-sm" style={{ padding: 22, gap: "13.2px" }}>
          <h4 style={{ margin: 0 }}>Source playlists</h4>
          <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
            Playlists load after auth
          </p>
        </div>

        <PrefsForm />

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

        <ShareLinksList />

        <ExportButtons />

        <CategoriesEditor />
      </div>
    </div>
  );
}
