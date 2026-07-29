"use client";

import { FIXTURE_RECIPES } from "@/lib/fixtures/recipes";
import { recipesToJson } from "@/lib/export/json";
import { recipeToMarkdown } from "@/lib/export/markdown";

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons() {
  function downloadJson() {
    downloadBlob(
      "roux-library.json",
      recipesToJson(FIXTURE_RECIPES),
      "application/json",
    );
  }

  function downloadMarkdown() {
    // Client-side multi-file zip needs a dep; join into one .md for fixtures.
    const parts = FIXTURE_RECIPES.map(recipeToMarkdown);
    const body = parts.join("\n---\n\n");
    downloadBlob("roux-library.md", body, "text/markdown");
  }

  return (
    <div className="card elev-sm" style={{ padding: 22, gap: "13.2px" }}>
      <h4 style={{ margin: 0 }}>Export your library</h4>
      <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
        Everything you&apos;ve written up, including your notes — yours to keep,
        no lock-in.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8.8px" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={downloadJson}
        >
          Download JSON
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={downloadMarkdown}
        >
          Download Markdown
        </button>
      </div>
    </div>
  );
}
