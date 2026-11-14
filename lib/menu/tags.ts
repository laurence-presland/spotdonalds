import orderTags from "@/data/order-tags.json";
import tagRules from "@/data/menu/tag-rules.json";
import type { MenuItem } from "@/lib/menu/types";

const tagOrder = orderTags.tags.map((tag) => tag.id);

export function orderTagIds(): string[] {
  return [...tagOrder];
}

export function orderTagLabel(id: string): string | null {
  return orderTags.tags.find((tag) => tag.id === id)?.label ?? null;
}

export function assignTagIds(item: Pick<MenuItem, "category" | "name">): string[] {
  const chosen = new Set<string>();
  for (const rule of tagRules.rules) {
    if (rule.category === item.category) {
      for (const tag of rule.tags) chosen.add(tag);
    }
  }
  const name = item.name.toLowerCase();
  for (const rule of tagRules.name_rules) {
    if (name.includes(rule.includes)) {
      for (const tag of rule.tags) chosen.add(tag);
    }
  }
  if (chosen.size === 0) {
    for (const tag of tagRules.fallback) chosen.add(tag);
  }
  return tagOrder.filter((id) => chosen.has(id));
}
