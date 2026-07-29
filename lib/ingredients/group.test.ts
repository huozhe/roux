import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyIngredient, groupIngredients } from "./group";

describe("classifyIngredient", () => {
  it("tags protein", () => {
    assert.equal(classifyIngredient("mock tender beef (shoulder cut)"), "protein");
    assert.equal(classifyIngredient("soft tofu, cubed"), "protein");
  });
  it("tags aromatics and spices", () => {
    assert.equal(classifyIngredient("ginger (for braising)"), "aromatics");
    assert.equal(classifyIngredient("star anise"), "aromatics");
    assert.equal(classifyIngredient("salt"), "spices");
  });
  it("tags sauces and liquids", () => {
    assert.equal(classifyIngredient("light soy sauce"), "sauces");
    assert.equal(classifyIngredient("braising liquid (reserved)"), "liquids");
    assert.equal(classifyIngredient("neutral oil (for searing)"), "liquids");
  });
});

describe("groupIngredients", () => {
  it("one flat list becomes labeled groups, order preserved within group", () => {
    const groups = groupIngredients([
      { qty: "1", name: "pork shoulder", inferred: false },
      { qty: "1", name: "ginger", inferred: false },
      { qty: "1 tbsp", name: "soy sauce", inferred: false },
      { qty: "1 cup", name: "chicken stock", inferred: false },
    ]);
    assert.deepEqual(
      groups.map((g) => g.id),
      ["protein", "aromatics", "sauces", "liquids"],
    );
    assert.equal(groups.find((g) => g.id === "protein")!.items[0]!.name, "pork shoulder");
    assert.equal(groups.find((g) => g.id === "liquids")!.items[0]!.name, "chicken stock");
  });
});
