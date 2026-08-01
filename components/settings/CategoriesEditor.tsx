"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  categoryOptions,
  CUISINES,
  isBaseCuisine,
  isBaseMain,
  MAINS,
} from "@/lib/categories";
import { publishPrefs } from "@/lib/prefs/client";
import type { UserPrefs } from "@/lib/types";

type CategoriesEditorProps = {
  initialCuisines?: string[];
  initialMains?: string[];
  initialHiddenCuisines?: string[];
  initialHiddenMains?: string[];
};

export function CategoriesEditor({
  initialCuisines = [...CUISINES],
  initialMains = [...MAINS],
  initialHiddenCuisines = [],
  initialHiddenMains = [],
}: CategoriesEditorProps) {
  const router = useRouter();
  const [cuisines, setCuisines] = useState(initialCuisines);
  const [mains, setMains] = useState(initialMains);
  const [hiddenCuisines, setHiddenCuisines] = useState(initialHiddenCuisines);
  const [hiddenMains, setHiddenMains] = useState(initialHiddenMains);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function persist(next: {
    cuisines: string[];
    mains: string[];
    hiddenCuisines: string[];
    hiddenMains: string[];
  }) {
    setBusy(true);
    setStatus("Saving…");
    try {
      const customCuisines = next.cuisines.filter((c) => !isBaseCuisine(c));
      const customMains = next.mains.filter((m) => !isBaseMain(m));
      const res = await fetch("/api/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customCuisines,
          customMains,
          hiddenCuisines: next.hiddenCuisines,
          hiddenMains: next.hiddenMains,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(body.error ?? "Couldn’t save");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { prefs?: UserPrefs };
      if (body.prefs) publishPrefs(body.prefs);
      setStatus("Saved");
      router.refresh();
    } catch {
      setStatus("Couldn’t save");
    } finally {
      setBusy(false);
    }
  }

  function addCuisine() {
    const name = window.prompt("Add a cuisine tag");
    const trimmed = name?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    // Unhide if previously removed built-in / label
    const nextHidden = hiddenCuisines.filter((h) => h.toLowerCase() !== key);
    if (cuisines.some((c) => c.toLowerCase() === key)) {
      if (nextHidden.length !== hiddenCuisines.length) {
        setHiddenCuisines(nextHidden);
        void persist({
          cuisines,
          mains,
          hiddenCuisines: nextHidden,
          hiddenMains,
        });
      }
      return;
    }
    const next = [...cuisines, trimmed];
    setCuisines(next);
    setHiddenCuisines(nextHidden);
    void persist({
      cuisines: next,
      mains,
      hiddenCuisines: nextHidden,
      hiddenMains,
    });
  }

  function addMain() {
    const name = window.prompt("Add a main-ingredient tag");
    const trimmed = name?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    const nextHidden = hiddenMains.filter((h) => h.toLowerCase() !== key);
    if (mains.some((m) => m.toLowerCase() === key)) {
      if (nextHidden.length !== hiddenMains.length) {
        setHiddenMains(nextHidden);
        void persist({
          cuisines,
          mains,
          hiddenCuisines,
          hiddenMains: nextHidden,
        });
      }
      return;
    }
    const next = [...mains, trimmed];
    setMains(next);
    setHiddenMains(nextHidden);
    void persist({
      cuisines,
      mains: next,
      hiddenCuisines,
      hiddenMains: nextHidden,
    });
  }

  function removeCuisine(label: string) {
    const key = label.toLowerCase();
    if (isBaseCuisine(label)) {
      if (hiddenCuisines.some((h) => h.toLowerCase() === key)) return;
      // Keep canonical base spelling in hide list
      const canonical =
        (CUISINES as readonly string[]).find((c) => c.toLowerCase() === key) ??
        label;
      const nextHidden = [...hiddenCuisines, canonical];
      setHiddenCuisines(nextHidden);
      setCuisines((prev) => prev.filter((c) => c.toLowerCase() !== key));
      void persist({
        cuisines: cuisines.filter((c) => c.toLowerCase() !== key),
        mains,
        hiddenCuisines: nextHidden,
        hiddenMains,
      });
      return;
    }
    const next = cuisines.filter((c) => c.toLowerCase() !== key);
    setCuisines(next);
    void persist({
      cuisines: next,
      mains,
      hiddenCuisines,
      hiddenMains,
    });
  }

  function removeMain(label: string) {
    const key = label.toLowerCase();
    if (isBaseMain(label)) {
      if (hiddenMains.some((h) => h.toLowerCase() === key)) return;
      const canonical =
        (MAINS as readonly string[]).find((m) => m.toLowerCase() === key) ??
        label;
      const nextHidden = [...hiddenMains, canonical];
      setHiddenMains(nextHidden);
      setMains((prev) => prev.filter((m) => m.toLowerCase() !== key));
      void persist({
        cuisines,
        mains: mains.filter((m) => m.toLowerCase() !== key),
        hiddenCuisines,
        hiddenMains: nextHidden,
      });
      return;
    }
    const next = mains.filter((m) => m.toLowerCase() !== key);
    setMains(next);
    void persist({
      cuisines,
      mains: next,
      hiddenCuisines,
      hiddenMains,
    });
  }

  const visibleCuisines = categoryOptions(CUISINES, cuisines, hiddenCuisines);
  const visibleMains = categoryOptions(MAINS, mains, hiddenMains);

  return (
    <div className="card elev-sm" style={{ padding: 22, gap: "13.2px" }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>Categories</h2>
      <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
        Library filter chips. Add your own, or remove any tag (×). Built-ins can
        be restored with + Add using the same name. Model-guessed tags are
        learned automatically on sync.
        {status ? ` · ${status}` : ""}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="text-muted" style={{ fontSize: "12.5px" }}>
          Cuisines
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {visibleCuisines.map((c) => (
            <CategoryChip
              key={c}
              label={c}
              variant="cuisine"
              disabled={busy}
              onRemove={() => removeCuisine(c)}
            />
          ))}
          <button
            type="button"
            className="tag tag-outline"
            style={{
              cursor: busy ? "wait" : "pointer",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 11,
            }}
            onClick={addCuisine}
            disabled={busy}
          >
            + Add
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="text-muted" style={{ fontSize: "12.5px" }}>
          Main ingredients
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {visibleMains.map((m) => (
            <CategoryChip
              key={m}
              label={m}
              variant="main"
              disabled={busy}
              onRemove={() => removeMain(m)}
            />
          ))}
          <button
            type="button"
            className="tag tag-outline"
            style={{
              cursor: busy ? "wait" : "pointer",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 11,
            }}
            onClick={addMain}
            disabled={busy}
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  variant,
  disabled,
  onRemove,
}: {
  label: string;
  variant: "cuisine" | "main";
  disabled?: boolean;
  onRemove: () => void;
}) {
  const tagCls = variant === "cuisine" ? "tag tag-accent" : "tag tag-accent-2";
  return (
    <span
      className={tagCls}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        paddingRight: 8,
      }}
    >
      {label}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        title="Remove"
        disabled={disabled}
        onClick={onRemove}
        style={{
          border: 0,
          background: "transparent",
          cursor: disabled ? "wait" : "pointer",
          padding: 0,
          margin: 0,
          lineHeight: 1,
          fontSize: 14,
          fontWeight: 700,
          color: "inherit",
          opacity: 0.75,
          fontFamily: "inherit",
        }}
      >
        ×
      </button>
    </span>
  );
}
