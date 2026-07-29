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

  function addCuisine() {
    const name = window.prompt("Add a cuisine tag");
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (cuisines.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
    setCuisines((prev) => [...prev, trimmed]);
  }

  function addMain() {
    const name = window.prompt("Add a main-ingredient tag");
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (mains.some((m) => m.toLowerCase() === trimmed.toLowerCase())) return;
    setMains((prev) => [...prev, trimmed]);
  }

  return (
    <div className="card elev-sm" style={{ padding: 22, gap: "13.2px" }}>
      <h4 style={{ margin: 0 }}>Categories</h4>
      <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
        Cuisine and main-ingredient tags are guessed per recipe and editable on
        the recipe page. Add your own to have them offered as options.
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
