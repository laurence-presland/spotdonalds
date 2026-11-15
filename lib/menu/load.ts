import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import menuJson from "@/data/menu/menu.json";
import schema from "@/data/menu/menu.schema.json";
import { assignTagIds } from "@/lib/menu/tags";
import type { Menu, MenuCategory, MenuItem } from "@/lib/menu/types";

export class MenuValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MenuValidationError";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

let cached: Menu | null = null;

/** Validate the menu JSON, attach tag ids, and cache the default menu. */
export function loadMenu(source: unknown = menuJson): Menu {
  if (source === menuJson && cached) return cached;
  if (!validate(source)) {
    const detail = (validate.errors ?? [])
      .slice(0, 5)
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new MenuValidationError(detail || "Menu failed schema validation");
  }
  const raw = source as { metadata: Menu["metadata"]; items: Omit<MenuItem, "tag_ids">[] };
  const menu: Menu = {
    metadata: raw.metadata,
    items: raw.items.map((item) => ({ ...item, tag_ids: assignTagIds(item) })),
  };
  if (source === menuJson) cached = menu;
  return menu;
}

/** Find one menu item by id. */
export function getMenuItem(id: string, menu = loadMenu()): MenuItem | null {
  return menu.items.find((item) => item.id === id) ?? null;
}

/** Return menu items in a category. */
export function filterByCategory(category: MenuCategory, menu = loadMenu()): MenuItem[] {
  return menu.items.filter((item) => item.category === category);
}

/** Return menu items that have energy figures. */
export function itemsWithNutrition(menu = loadMenu()): MenuItem[] {
  return menu.items.filter((item) => item.nutrition_available && item.energy_kcal != null);
}
