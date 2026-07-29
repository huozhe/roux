"use client";

import { useState } from "react";
import { DEFAULT_PREFS } from "@/lib/types";
import type { RecipeLayout, UserPrefs } from "@/lib/types";

type PrefsFormProps = {
  initial?: UserPrefs;
  /** Optional persist hook; local-only until /api/prefs lands. */
  onChange?: (prefs: UserPrefs) => void;
};

export function PrefsForm({
  initial = DEFAULT_PREFS,
  onChange,
}: PrefsFormProps) {
  const [prefs, setPrefs] = useState<UserPrefs>(initial);

  function update(patch: Partial<UserPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      onChange?.(next);
      return next;
    });
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

      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        Saved to your account, so the phone in the kitchen and the laptop agree.
      </p>
    </div>
  );
}
