import policy from "@/data/menu/candidate-policy.json";
import type { MenuCategory, MenuItem, MenuSize } from "@/lib/menu/types";

const sizeRank: Record<string, number> = { medium: 0, small: 1, large: 2 };

export function candidateSet(items: MenuItem[]): MenuItem[] {
  const eligible = items.filter((item) => {
    if (policy.exclude_categories.includes(item.category)) return false;
    if (policy.require_nutrition && !hasNutrition(item)) return false;
    return true;
  });
  const sized = policy.one_size_per_product ? keepPreferredSize(eligible) : eligible;
  const byCategory = new Map<MenuCategory, MenuItem[]>();
  for (const item of sized) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const picked: MenuItem[] = [];
  for (const [category, group] of byCategory) {
    const cap = policy.max_per_category[category as keyof typeof policy.max_per_category];
    picked.push(...spread(group, cap ?? group.length));
  }
  return picked.sort((a, b) => a.id.localeCompare(b.id));
}

function hasNutrition(item: MenuItem): boolean {
  return item.nutrition_available && item.energy_kcal != null && item.energy_kj != null;
}

function productKey(item: MenuItem): string {
  if (!item.size) return item.id;
  const prefix = `${item.size}-`;
  return item.id.startsWith(prefix) ? item.id.slice(prefix.length) : item.id;
}

function keepPreferredSize(items: MenuItem[]): MenuItem[] {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const key = `${item.category}:${productKey(item)}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.values()].map((group) => {
    return [...group].sort((a, b) => sizeScore(a.size) - sizeScore(b.size) || a.id.localeCompare(b.id))[0]!;
  });
}

function sizeScore(size: MenuSize | undefined): number {
  if (!size) return 3;
  return sizeRank[size] ?? 4;
}

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
