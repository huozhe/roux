"use client";

import { useState } from "react";
import { CUISINES, MAINS } from "@/lib/categories";

type CategoriesEditorProps = {
  initialCuisines?: string[];
  initialMains?: string[];
};

export function CategoriesEditor({
  initialCuisines = [...CUISINES],
  initialMains = [...MAINS],
}: CategoriesEditorProps) {
  const [cuisines, setCuisines] = useState(initialCuisines);
  const [mains, setMains] = useState(initialMains);
  const [status, setStatus] = useState<string | null>(null);

  async function persist(
    nextCuisines: string[],
    nextMains: string[],
  ) {
    setStatus("Saving…");
    try {
      const baseCuisines = CUISINES as readonly string[];
      const baseMains = MAINS as readonly string[];
      const res = await fetch("/api/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customCuisines: nextCuisines.filter((c) => !baseCuisines.includes(c)),
          customMains: nextMains.filter((m) => !baseMains.includes(m)),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(body.error ?? "Couldn’t save");
        return;
      }
      setStatus("Saved");
    } catch {
      setStatus("Couldn’t save");
    }
  }

  function addCuisine() {
    const name = window.prompt("Add a cuisine tag");
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (cuisines.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
    const next = [...cuisines, trimmed];
    setCuisines(next);
    void persist(next, mains);
  }

  function addMain() {
    const name = window.prompt("Add a main-ingredient tag");
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (mains.some((m) => m.toLowerCase() === trimmed.toLowerCase())) return;
    const next = [...mains, trimmed];
    setMains(next);
    void persist(cuisines, next);
  }

  return (
    <div className="card elev-sm" style={{ padding: 22, gap: "13.2px" }}>
      <h4 style={{ margin: 0 }}>Categories</h4>
      <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
        Cuisine and main-ingredient tags are guessed per recipe and editable on
        the recipe page. Add your own to have them offered as options.
        {status ? ` · ${status}` : ""}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="text-muted" style={{ fontSize: "12.5px" }}>
          Cuisines
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {cuisines.map((c) => (
            <span key={c} className="tag tag-accent">
              {c}
            </span>
          ))}
          <button
            type="button"
            className="tag tag-outline"
            style={{
              cursor: "pointer",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 11,
            }}
            onClick={addCuisine}
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
          {mains.map((m) => (
            <span key={m} className="tag tag-accent-2">
              {m}
            </span>
          ))}
          <button
            type="button"
            className="tag tag-outline"
            style={{
              cursor: "pointer",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 11,
            }}
            onClick={addMain}
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}
