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

/**
 * Guest export. The recipes are already on the page, so this needs no
 * unauthenticated API — nothing here can reach data the shelf didn't show.
 */
export function SharedExportButtons({ recipes }: { recipes: Recipe[] }) {
  const [done, setDone] = useState<"json" | "md" | null>(null);

  function onDownload(kind: "json" | "md") {
    if (kind === "json") {
      downloadBlob(
        "shared-library.json",
        recipesToJson(recipes),
        "application/json",
      );
    } else {
      downloadBlob(
        "shared-library.md",
        recipes.map(recipeToMarkdown).join("\n\n---\n\n"),
        "text/markdown",
      );
    }
    setDone(kind);
  }

  return (
    <div style={{ display: "flex", gap: 8.8, flex: "none" }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: 0 }}
        onClick={() => onDownload("md")}
      >
        {done === "md" ? "Saved .md" : "Download .md"}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: 0 }}
        onClick={() => onDownload("json")}
      >
        {done === "json" ? "Saved .json" : "Download .json"}
      </button>
    </div>
  );
}
