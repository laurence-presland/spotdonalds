export type ProteinKind = "beef" | "chicken" | "fish" | "other";

/** Protein bucket for a menu item, if it is a main. */
export function itemProtein(item: { category: string; name: string }): ProteinKind {
  const name = item.name.toLowerCase();
  if (name.includes("fish") || name.includes("filet")) return "fish";
  if (item.category === "burgers") return "beef";
  if (item.category === "chicken_and_fish" || name.includes("chicken") || name.includes("nugget")) return "chicken";
  return "other";
}

/** True when the item is in a main-meal category. */
export function isMain(category: string): boolean {
  return category === "burgers" || category === "chicken_and_fish";
}

/** Grouping used to stop the order repeating the same kind of item. */
export function itemGroup(category: string): "main" | "side" | "drink" | "dessert" | "other" {
  if (isMain(category)) return "main";
  if (category === "sides") return "side";
  if (category === "desserts") return "dessert";
  if (category === "mccafe_drinks" || category === "cold_and_frozen_drinks" || category === "shakes_and_frappes") {
    return "drink";
  }
  return "other";
}
