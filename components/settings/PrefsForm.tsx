"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { publishPrefs } from "@/lib/prefs/client";
import { DEFAULT_PREFS } from "@/lib/types";
import type { RecipeLayout, UserPrefs } from "@/lib/types";

type PrefsFormProps = {
  initial?: UserPrefs;
  /** Optional extra hook after local update (e.g. parent state). */
  onChange?: (prefs: UserPrefs) => void;
};

export function PrefsForm({
  initial = DEFAULT_PREFS,
  onChange,
}: PrefsFormProps) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<UserPrefs>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(patch: Partial<UserPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      onChange?.(next);
      if (timer.current) clearTimeout(timer.current);
      setStatus("Saving…");
      timer.current = setTimeout(() => {
        void persist(next);
      }, 400);
      return next;
    });
  }

  async function persist(next: UserPrefs) {
    try {
      const res = await fetch("/api/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout: next.layout,
          timestamps: next.timestamps,
          newShelf: next.newShelf,
          syncMarkVerified: next.syncMarkVerified,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(body.error ?? "Couldn’t save");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { prefs?: UserPrefs };
      if (body.prefs) {
        publishPrefs(body.prefs);
        setPrefs(body.prefs);
      } else {
        publishPrefs(next);
      }
      setStatus("Saved");
      // Soft-refresh current route; cross-route consumers use publishPrefs.
      router.refresh();
    } catch {
      setStatus("Couldn’t save");
    }
  }

  return (
    <div className="card elev-sm" style={{ padding: 22, gap: "17.6px" }}>
      <h4 style={{ margin: 0 }}>Reading preferences</h4>

      <div className="field">
        <label>Recipe page layout</label>
        <div className="seg">
          <label className="seg-opt">
            <input
              type="radio"
              name="preflayout"
              checked={prefs.layout === "single"}
              onChange={() => update({ layout: "single" as RecipeLayout })}
            />
            <span>Single scroll</span>
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="preflayout"
              checked={prefs.layout === "split"}
              onChange={() => update({ layout: "split" as RecipeLayout })}
            />
            <span>Ingredients pinned</span>
          </label>
        </div>
      </div>

      <div className="field">
        <label>Show the video timestamp on each step</label>
        <div className="seg">
          <label className="seg-opt">
            <input
              type="radio"
              name="prefts"
              checked={prefs.timestamps}
              onChange={() => update({ timestamps: true })}
            />
            <span>Show</span>
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="prefts"
              checked={!prefs.timestamps}
              onChange={() => update({ timestamps: false })}
            />
            <span>Hide</span>
          </label>
        </div>
      </div>

      <div className="field">
        <label>“Newly added” shelf at the top of the library</label>
        <div className="seg">
          <label className="seg-opt">
            <input
              type="radio"
              name="prefnew"
              checked={prefs.newShelf}
              onChange={() => update({ newShelf: true })}
            />
            <span>Show</span>
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="prefnew"
              checked={!prefs.newShelf}
              onChange={() => update({ newShelf: false })}
            />
            <span>Hide</span>
          </label>
        </div>
      </div>

      <div className="field">
        <label>New recipes from sync</label>
        <div className="seg">
          <label className="seg-opt">
            <input
              type="radio"
              name="prefsyncver"
              checked={!prefs.syncMarkVerified}
              onChange={() => update({ syncMarkVerified: false })}
            />
            <span>Pending verification</span>
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="prefsyncver"
              checked={prefs.syncMarkVerified}
              onChange={() => update({ syncMarkVerified: true })}
            />
            <span>Mark verified</span>
          </label>
        </div>
        <p className="text-muted" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
          Verified recipes are never overwritten by a later sync. Pending ones
          may be re-written until you mark them verified.
        </p>
      </div>

      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        Saved to your account, so the phone in the kitchen and the laptop agree.
        {status ? ` · ${status}` : ""}
      </p>
    </div>
  );
}
