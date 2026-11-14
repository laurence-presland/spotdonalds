import { describe, expect, it } from "vitest";
import { candidateSet } from "@/lib/menu/candidates";
import { loadMenu, MenuValidationError } from "@/lib/menu/load";
import { assignTagIds, orderTagIds } from "@/lib/menu/tags";
const menu = loadMenu();
const allowed = new Set(orderTagIds());

describe("menu data", () => {
  it("matches the committed metadata for count and nutrition share", () => {
    expect(menu.items.length).toBe(menu.metadata.item_count);
    const ids = new Set(menu.items.map((item) => item.id));
    expect(ids.size).toBe(menu.items.length);
    const withKcal = menu.items.filter((item) => item.energy_kcal != null).length;
    expect(withKcal).toBe(menu.metadata.nutrition_coverage?.energy_kcal?.present);
    expect(menu.metadata.item_count).toBe(327);
  });

  it("keeps published kcal roughly consistent with kJ and never derived", () => {
    let outsideUsualConversion = 0;
    for (const item of menu.items) {
      if (item.energy_kcal == null) continue;
      expect(item.energy_kcal_derived).toBe(false);
      expect(item.energy_kcal).toBeLessThan(2500);
      if (item.energy_kj == null || item.energy_kcal < 20) continue;
      const ratio = item.energy_kj / item.energy_kcal;
      if (ratio < 3.2 || ratio > 4.6) outsideUsualConversion += 1;
    }
    // A few published breakfast items don't sit on 4.184. They stay as printed.
    expect(outsideUsualConversion).toBeLessThanOrEqual(5);
  });

  it("fails loudly on invalid data", () => {
    expect(() => loadMenu({ metadata: {}, items: [{ id: "nope" }] })).toThrow(MenuValidationError);
  });

  it("assigns only known tags, stably, and gives every candidate at least one", () => {
    const first = menu.items.map((item) => assignTagIds(item).join(","));
    const second = menu.items.map((item) => assignTagIds(item).join(","));
    expect(second).toEqual(first);
    for (const item of menu.items) {
      for (const tag of item.tag_ids) expect(allowed.has(tag)).toBe(true);
    }
    const candidates = candidateSet(menu.items);
    expect(candidates.length).toBeGreaterThan(0);
    for (const item of candidates) expect(item.tag_ids.length).toBeGreaterThan(0);
  });

  it("drops items without nutrition, drops condiments, caps drinks, and stays stable", () => {
    const once = candidateSet(menu.items).map((item) => item.id);
    const twice = candidateSet(menu.items).map((item) => item.id);
    expect(twice).toEqual(once);
    const byId = new Map(menu.items.map((item) => [item.id, item]));
    const chosen = once.map((id) => byId.get(id)!);
    expect(chosen.some((item) => item.category === "condiments")).toBe(false);
    expect(chosen.every((item) => item.energy_kcal != null)).toBe(true);
    const drinks = chosen.filter((item) =>
      ["mccafe_drinks", "cold_and_frozen_drinks", "shakes_and_frappes"].includes(item.category),
    );
    expect(drinks.length).toBeLessThanOrEqual(8);
    expect(drinks.length).toBeGreaterThan(0);
    const fries = chosen.filter((item) => item.id.endsWith("fries") || item.id.includes("-fries"));
    const families = new Set(fries.map((item) => item.id.replace(/^(small|medium|large)-/, "")));
    expect(fries.length).toBe(families.size);
  });
});
