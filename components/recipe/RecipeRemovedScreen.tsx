import Link from "next/link";
import type { RemoveMode } from "@/components/recipe/RecipeRemoveDialog";

/** Post-archive/delete confirmation (CQ-1 shell residual). */
export function RecipeRemovedScreen({ mode }: { mode: RemoveMode }) {
  return (
    <div
      style={{
        maxWidth: 780,
        margin: "0 auto",
        padding: "35.2px 17.6px",
        display: "flex",
        flexDirection: "column",
        gap: 13.2,
      }}
    >
      <h2 style={{ margin: 0 }}>
        {mode === "archive" ? "Recipe archived" : "Recipe deleted"}
      </h2>
      <p className="text-muted" style={{ margin: 0 }}>
        {mode === "archive"
          ? "It’ll sit in Archive for 30 days. You can restore it from the library."
          : "Gone for good. A later sync won’t re-add this video."}
      </p>
      <Link href="/" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
        Back to Library
      </Link>
    </div>
  );
}
