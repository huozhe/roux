"use client";

import { useCallback } from "react";
import { formatTimestamp } from "@/lib/format";
import type { Ingredient, Step } from "@/lib/types";

export type RecipeDraft = {
  title: string;
  ingredients: Ingredient[];
  steps: Step[];
};

export function RecipeEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy = false,
}: {
  draft: RecipeDraft;
  setDraft: React.Dispatch<React.SetStateAction<RecipeDraft | null>>;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const patch = useCallback(
    (fn: (d: RecipeDraft) => void) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next: RecipeDraft = {
          title: prev.title,
          ingredients: prev.ingredients.map((i) => ({ ...i })),
          steps: prev.steps.map((s) => ({ ...s })),
        };
        fn(next);
        return next;
      });
    },
    [setDraft],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 17.6,
        maxWidth: 780,
      }}
    >
      <div className="card elev-sm" style={{ padding: 22, gap: 13.2 }}>
        <div className="field">
          <label htmlFor="recipe-title">Recipe title</label>
          <input
            id="recipe-title"
            className="input"
            value={draft.title}
            onChange={(e) => patch((d) => { d.title = e.target.value; })}
            style={{ minHeight: 44, fontSize: 16 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <h4 style={{ margin: 0 }}>Ingredients</h4>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            quantities in brackets were inferred
          </span>
        </div>
        {draft.ingredients.map((ing, i) => (
          <div
            key={i}
            style={{ display: "flex", gap: 8.8, alignItems: "center" }}
          >
            <input
              className="input"
              value={ing.inferred ? `[${ing.qty}]` : ing.qty}
              onChange={(e) =>
                patch((d) => {
                  const raw = e.target.value;
                  const inferred = raw.startsWith("[") && raw.endsWith("]");
                  d.ingredients[i] = {
                    ...d.ingredients[i]!,
                    qty: inferred ? raw.slice(1, -1) : raw,
                    inferred,
                  };
                })
              }
              style={{ width: 110, flex: "none", minHeight: 40 }}
            />
            <input
              className="input"
              value={ing.name}
              onChange={(e) =>
                patch((d) => {
                  d.ingredients[i] = {
                    ...d.ingredients[i]!,
                    name: e.target.value,
                  };
                })
              }
              style={{ flex: 1, minHeight: 40 }}
            />
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              title="Remove"
              onClick={() =>
                patch((d) => {
                  d.ingredients.splice(i, 1);
                })
              }
              style={{ flex: "none" }}
            >
              <MinusIcon />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            patch((d) => {
              d.ingredients.push({
                qty: "",
                name: "",
                inferred: false,
                group: "Other",
              });
            })
          }
          style={{ alignSelf: "flex-start", marginTop: 0 }}
        >
          Add ingredient
        </button>
      </div>

      <div className="card elev-sm" style={{ padding: 22, gap: 13.2 }}>
        <h4 style={{ margin: 0 }}>Steps</h4>
        {draft.steps.map((s, i) => (
          <div
            key={i}
            style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                flex: "none",
                borderRadius: 999,
                background: "var(--color-accent-200)",
                color: "var(--color-accent-900)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {i + 1}
            </div>
            <textarea
              className="input"
              value={s.text}
              onChange={(e) =>
                patch((d) => {
                  d.steps[i] = { ...d.steps[i]!, text: e.target.value };
                })
              }
              style={{
                flex: 1,
                borderRadius: 20,
                minHeight: 72,
                fontSize: 15,
              }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: "none",
                alignItems: "center",
              }}
            >
              <div className="text-muted" style={{ fontSize: 12 }}>
                {formatTimestamp(s.t_seconds)}
              </div>
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                title="Remove"
                onClick={() =>
                  patch((d) => {
                    d.steps.splice(i, 1);
                  })
                }
              >
                <MinusIcon />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            patch((d) => {
              d.steps.push({
                n: d.steps.length + 1,
                text: "",
                t_seconds: 0,
              });
            })
          }
          style={{ alignSelf: "flex-start", marginTop: 0 }}
        >
          Add step
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          position: "sticky",
          bottom: 0,
          padding: "13.2px 0",
          background: "var(--color-bg)",
        }}
      >
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={busy}
          style={{ minHeight: 44, marginTop: 0 }}
        >
          {busy ? "Saving…" : "Save & mark verified"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={busy}
          style={{ minHeight: 44 }}
        >
          Discard changes
        </button>
        <div className="text-muted" style={{ fontSize: 12.5 }}>
          Your edits win over the next sync — the transcript never overwrites a
          verified recipe.
        </div>
      </div>
    </div>
  );
}

function MinusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}
