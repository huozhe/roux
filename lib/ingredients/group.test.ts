import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupIngredients } from "./group";

describe("groupIngredients", () => {
  it("respects LLM group labels and order", () => {
    const groups = groupIngredients([
      { qty: "400 g", name: "beef", inferred: false, group: "Protein" },
      { qty: "2", name: "star anise", inferred: false, group: "Aromatics" },
      { qty: "1 tbsp", name: "soy sauce", inferred: false, group: "Sauces & condiments" },
      { qty: "1 tsp", name: "dark soy", inferred: true, group: "Sauces & condiments" },
    ]);
    assert.equal(groups.length, 3);
    assert.equal(groups[0]!.label, "Protein");
    assert.equal(groups[1]!.label, "Aromatics");
    assert.equal(groups[2]!.label, "Sauces & condiments");
    assert.equal(groups[2]!.items.length, 2);
  });

  it("legacy ingredients without group stay one list, original order", () => {
    const groups = groupIngredients([
      { qty: "1", name: "beef", inferred: false },
      { qty: "1", name: "ginger", inferred: false },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.label, "");
    assert.equal(groups[0]!.items[0]!.name, "beef");
    assert.equal(groups[0]!.items[1]!.name, "ginger");
  });
});
