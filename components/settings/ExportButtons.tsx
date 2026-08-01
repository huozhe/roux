"use client";

import { useState } from "react";
import { recipesToJson } from "@/lib/export/json";
import { recipeToMarkdown } from "@/lib/export/markdown";
import type { Recipe } from "@/lib/types";

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchAllRecipes(): Promise<Recipe[]> {
  const [libRes, archRes] = await Promise.all([
    fetch("/api/recipes?view=library"),
    fetch("/api/recipes?view=archive"),
  ]);
  if (!libRes.ok) {
    const body = (await libRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to load library");
  }
  if (!archRes.ok) {
    const body = (await archRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to load archive");
  }
  const lib = (await libRes.json()) as { recipes: Recipe[] };
  const arch = (await archRes.json()) as { recipes: Recipe[] };
  return [...(lib.recipes ?? []), ...(arch.recipes ?? [])];
}

export function ExportButtons() {
  const [busy, setBusy] = useState<"json" | "md" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadJson() {
    setBusy("json");
    setError(null);
    try {
      const recipes = await fetchAllRecipes();
      downloadBlob(
        "roux-library.json",
        recipesToJson(recipes),
        "application/json",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function downloadMarkdown() {
    setBusy("md");
    setError(null);
    try {
      const recipes = await fetchAllRecipes();
      const parts = recipes.map(recipeToMarkdown);
      const body = parts.join("\n---\n\n");
      downloadBlob("roux-library.md", body, "text/markdown");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card elev-sm" style={{ padding: 22, gap: "13.2px" }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>Export your library</h2>
      <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
        Everything you&apos;ve written up, including your notes — yours to keep,
        no lock-in.
      </p>
      {error ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-700)" }}>
          {error}
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8.8px" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void downloadJson()}
          disabled={busy !== null}
        >
          {busy === "json" ? "Preparing…" : "Download JSON"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void downloadMarkdown()}
          disabled={busy !== null}
        >
          {busy === "md" ? "Preparing…" : "Download Markdown"}
        </button>
      </div>
    </div>
  );
}
