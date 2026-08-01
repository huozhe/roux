"use client";

/** Owner-only notes card (CQ-1 seam from RecipeDetail). */
export function RecipeNotes({
  notes,
  onNotes,
  notesStatus,
}: {
  notes: string;
  onNotes: (v: string) => void;
  notesStatus: string;
}) {
  return (
    <div
      className="card"
      style={{
        gap: 8.8,
        padding: 22,
        background: "var(--color-accent-2-100)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 20 }}>My notes</h2>
      <textarea
        className="input"
        placeholder="Substitutions, what went wrong, what to do differently…"
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
        style={{
          background: "var(--color-bg)",
          borderRadius: 20,
          fontSize: 15,
          minHeight: 96,
        }}
      />
      <div className="text-muted" style={{ fontSize: 12 }}>
        {notesStatus}
      </div>
    </div>
  );
}
