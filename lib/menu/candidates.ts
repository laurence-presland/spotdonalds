import { groupBy } from "es-toolkit";
import policy from "@/data/menu/candidate-policy.json";
import type { MenuItem, MenuSize } from "@/lib/menu/types";

const sizeRank: Record<string, number> = { medium: 0, small: 1, large: 2 };

/** Pick a compact, policy-filtered set of menu items for the model. */
export function candidateSet(items: MenuItem[]): MenuItem[] {
  const eligible = items.filter((item) => {
    if (policy.exclude_categories.includes(item.category)) return false;
    if (policy.require_nutrition && !hasNutrition(item)) return false;
    return true;
  });
  const sized = policy.one_size_per_product ? keepPreferredSize(eligible) : eligible;
  const byCategory = groupBy(sized, (item) => item.category);
  const picked: MenuItem[] = [];
  for (const [category, group] of Object.entries(byCategory)) {
    const cap = policy.max_per_category[category as keyof typeof policy.max_per_category];
    picked.push(...spread(group, cap ?? group.length));
  }
  return picked.sort((a, b) => a.id.localeCompare(b.id));
}

/** True when the item has energy figures we can use. */
function hasNutrition(item: MenuItem): boolean {
  return item.nutrition_available && item.energy_kcal != null && item.energy_kj != null;
}

/** Stable id for a product across its size variants. */
function productKey(item: MenuItem): string {
  if (!item.size) return item.id;
  const prefix = `${item.size}-`;
  return item.id.startsWith(prefix) ? item.id.slice(prefix.length) : item.id;
}

/** Keep one preferred size of each product. */
function keepPreferredSize(items: MenuItem[]): MenuItem[] {
  const groups = groupBy(items, (item) => `${item.category}:${productKey(item)}`);
  return Object.values(groups).map((group) => {
    return [...group].sort((a, b) => sizeScore(a.size) - sizeScore(b.size) || a.id.localeCompare(b.id))[0]!;
  });
}

/** Rank a size so medium is preferred, then small, then large. */
function sizeScore(size: MenuSize | undefined): number {
  if (!size) return 3;
  return sizeRank[size] ?? 4;
}

/** Pick up to cap items, spaced evenly through a sorted list. */
function spread(items: MenuItem[], cap: number): MenuItem[] {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  if (sorted.length <= cap) return sorted;
  const picked: MenuItem[] = [];
  for (let index = 0; index < cap; index += 1) {
    const at = Math.round((index * (sorted.length - 1)) / Math.max(cap - 1, 1));
    const item = sorted[at];
    if (item && !picked.includes(item)) picked.push(item);
  }
  return picked;
}
