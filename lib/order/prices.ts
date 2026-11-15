// Official menu prices are null. These bands are indicative AUD amounts so a
// receipt and a spend budget can still be checked. They are not McDonald's prices.
const CATEGORY_PRICE: Record<string, number> = {
  burgers: 7.9,
  chicken_and_fish: 7.5,
  breakfast: 6.5,
  sides: 4.7,
  desserts: 4.5,
  mccafe_drinks: 4.2,
  mccafe_food: 5.5,
  cold_and_frozen_drinks: 4.55,
  shakes_and_frappes: 5.2,
};

const SIZE_FACTOR: Record<string, number> = {
  small: 0.85,
  medium: 1,
  large: 1.2,
};

/** Look up an indicative AUD price for a menu item. */
export function indicativePrice(item: { id: string; category: string; size?: string | null }): number {
  const base = CATEGORY_PRICE[item.category] ?? 5;
  const factor = item.size ? SIZE_FACTOR[item.size] ?? 1 : 1;
  return Math.round(base * factor * 100) / 100;
}
