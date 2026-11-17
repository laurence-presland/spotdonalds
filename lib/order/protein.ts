export type ProteinKind = "beef" | "chicken" | "fish" | "other";

/** Protein bucket for a menu item, if it is a main. */
export function itemProtein(item: { category: string; name: string }): ProteinKind {
  const name = item.name.toLowerCase();
  if (name.includes("fish") || name.includes("filet")) return "fish";
  if (item.category === "burgers") return "beef";
  if (item.category === "chicken_and_fish" || name.includes("chicken") || name.includes("nugget")) return "chicken";
  return "other";
}
