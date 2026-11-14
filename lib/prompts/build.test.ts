import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/prompts/build";

const orderInputs = {
  "calorie_budget.min": "1200",
  "calorie_budget.max": "1450",
  "spend_budget_aud.min": "20",
  "spend_budget_aud.max": "38",
  required_protein: "beef",
  category_constraints: "one main, one side, one drink",
};

describe("prompt builder", () => {
  it("builds each manifest and shares the sacred rules between profile and order", () => {
    const profile = buildPrompt("profile.v1");
    const order = buildPrompt("order.v1", orderInputs);
    const popularity = buildPrompt("popularity.v1");
    expect(profile.text).toContain("You are the SpotDonalds taste reader.");
    expect(order.text).toContain("You are the SpotDonalds order chef.");
    expect(popularity.text).toContain("Don't give numbers or prices.");
    expect(profile.text).toContain("THE SACRED RULES (never break these)");
    expect(order.text).toContain("THE SACRED RULES (never break these)");
    expect(profile.version).toBe("profile.v1");
    expect(profile.hash).toHaveLength(64);
    expect(order.text).toContain("1200-1450 kcal");
    const other = buildPrompt("order.v1", { ...orderInputs, "calorie_budget.min": "900" });
    expect(other.hash).toBe(order.hash);
    expect(other.text).not.toBe(order.text);
    expect(profile.text).toMatchSnapshot();
  });

  it("fails on an unknown block, a missing placeholder, or an unused input", () => {
    const dir = path.join(process.cwd(), "prompts");
    const file = path.join(dir, "unknown-block.v1.json");
    writeFileSync(file, JSON.stringify({ version: "unknown-block.v1", blocks: ["shared/missing"] }));
    try {
      expect(() => buildPrompt("unknown-block.v1")).toThrow(/Unknown prompt block/);
    } finally {
      rmSync(file);
    }
    expect(() => buildPrompt("order.v1", {})).toThrow(/Unfilled prompt placeholder/);
    expect(() => buildPrompt("profile.v1", { extra: "nope" })).toThrow(/Unused prompt input/);
  });
});
