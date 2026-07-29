import { formatQty } from "@/lib/format";
import { groupIngredients } from "@/lib/ingredients/group";
import type { Ingredient } from "@/lib/types";

export function IngredientsList({
  ingredients,
}: {
  ingredients: Ingredient[];
}) {
  const groups = groupIngredients(ingredients);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 17.6 }}>
      {groups.map((group) => (
        <div
          key={group.id}
          style={{ display: "flex", flexDirection: "column", gap: 0 }}
        >
          {group.label ? (
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-neutral-600)",
                marginBottom: 6,
              }}
            >
              {group.label}
            </div>
          ) : null}
          {group.items.map((ing) => (
            <div
              key={`${group.id}-${ing.index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(88px, 28%) 1fr",
                gap: 12,
                fontSize: 15,
                padding: "10px 0",
                borderBottom: "1px solid var(--color-divider)",
                alignItems: "baseline",
              }}
            >
              <span style={{ fontWeight: 700 }}>{formatQty(ing)}</span>
              <span style={{ textWrap: "pretty" }}>{ing.name}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
