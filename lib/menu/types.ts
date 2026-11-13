export const MENU_CATEGORIES = [
  "burgers",
  "chicken_and_fish",
  "breakfast",
  "sides",
  "desserts",
  "mccafe_drinks",
  "mccafe_food",
  "cold_and_frozen_drinks",
  "shakes_and_frappes",
  "condiments",
  "happy_meal",
  "bundle_meals",
] as const;

export type MenuCategory = (typeof MENU_CATEGORIES)[number];
export type MenuSize = "small" | "medium" | "large" | null;

export type NutritionPanel = {
  energy_kj?: number | null;
  energy_kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  saturated_fat_g?: number | null;
  carbs_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
};

export type MenuItem = {
  id: string;
  name: string;
  size?: MenuSize;
  category: MenuCategory;
  source_category?: string;
  description?: string | null;
  url: string;
  nutrition_available: boolean;
  nutrition_source?: "official_product_page" | "official_nutrition_pdf" | null;
  energy_kj: number | null;
  energy_kcal: number | null;
  energy_kcal_derived: boolean;
  protein_g: number | null;
  fat_g: number | null;
  saturated_fat_g?: number | null;
  carbs_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  per_100?: NutritionPanel | null;
  serving_size_g?: number | null;
  serving_size_derived?: boolean;
  serving_size_note?: string | null;
  availability_notes?: string[];
  tags: string[];
  tags_inferred: boolean;
  price_aud: null;
  nutrition_pdf_url?: string | null;
  nutrition_pdf_dated?: string | null;
  nutrition_note?: string | null;
  tag_ids: string[];
};

export type MenuMetadata = {
  project: string;
  market: string;
  retrieved_at: string;
  retrieved_at_timezone: string;
  sources: { title: string; url: string; type: string; dated?: string | null; notes?: string | null }[];
  notes: string[];
  coverage_gaps: string[];
  item_count?: number;
  item_count_by_category?: Record<string, number>;
  nutrition_coverage?: Record<string, { present: number; missing: number }>;
};

export type Menu = {
  metadata: MenuMetadata;
  items: MenuItem[];
};
