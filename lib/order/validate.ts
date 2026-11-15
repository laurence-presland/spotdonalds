import { orderTagIds } from "@/lib/menu/tags";
import type { OrderBudget } from "@/lib/order/budget";
import type { OrderCandidate } from "@/lib/order/candidates";
import { itemGroup } from "@/lib/order/protein";
import { orderSchema, popularitySchema, type OrderDraft } from "@/lib/order/schema";
import { quotedNumberIssues } from "@/lib/profile/numbers";
import type { TasteSignals } from "@/lib/signals/compute";

const GAP = /coverage|missing data|unlabeled|sample size|uncertain/i;

export type CheckedOrder = {
  draft: OrderDraft;
  total_kcal: number;
  total_aud: number;
};

/** Validate a model popularity payload against the schema. */
export function validatePopularity(value: unknown): { ok: true; popularity: { popularity_tier: "niche" | "mid" | "mainstream"; reason: string } } | { ok: false; issues: string[] } {
  const parsed = popularitySchema.safeParse(value);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) };
  if (/[$€£]|\d/.test(parsed.data.reason)) {
    return { ok: false, issues: ["Popularity reason must not include a number or a price"] };
  }
  return { ok: true, popularity: parsed.data };
}

/** Validate a model order against the schema, budget, and menu rules. */
export function validateOrder(value: unknown, input: {
  candidates: OrderCandidate[];
  budget: OrderBudget;
  signals: TasteSignals;
}): { ok: true; order: CheckedOrder } | { ok: false; issues: string[] } {
  const parsed = orderSchema(
    input.candidates.map((item) => item.item_id),
    orderTagIds(),
  ).safeParse(value);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) };
  const draft = parsed.data;
  const issues: string[] = [];
  const byId = new Map(input.candidates.map((item) => [item.item_id, item]));
  let totalKcal = 0;
  let totalAud = 0;
  const groups = new Map<string, number>();
  const categories = new Set<string>();
  for (const line of draft.items) {
    const item = byId.get(line.item_id);
    if (!item) {
      issues.push(`Unknown item: ${line.item_id}`);
      continue;
    }
    totalKcal += item.kcal * line.quantity;
    totalAud += item.price_aud * line.quantity;
    const group = itemGroup(item.category);
    groups.set(group, (groups.get(group) ?? 0) + line.quantity);
    categories.add(item.category);
    if (input.budget.required_protein !== "either" && group === "main" && item.protein !== input.budget.required_protein) {
      issues.push(`Main ${item.item_id} is ${item.protein}, not ${input.budget.required_protein}`);
    }
    checkNumbers(line.justification, line.cites, input.signals, issues);
  }
  if (totalKcal < input.budget.calorie_budget.min || totalKcal > input.budget.calorie_budget.max) {
    issues.push(`Calories ${totalKcal} are outside ${input.budget.calorie_budget.min}-${input.budget.calorie_budget.max}`);
  }
  const spend = Math.round(totalAud * 100) / 100;
  if (spend < input.budget.spend_budget_aud.min || spend > input.budget.spend_budget_aud.max) {
    issues.push(`Spend ${spend} is outside ${input.budget.spend_budget_aud.min}-${input.budget.spend_budget_aud.max}`);
  }
  const mains = groups.get("main") ?? 0;
  if (mains < 1 || mains > (input.budget.allow_repeat ? 2 : 1)) issues.push("The main count breaks the category limits");
  if ((groups.get("side") ?? 0) > 1) issues.push("Too many sides");
  if ((groups.get("drink") ?? 0) > 1) issues.push("Too many drinks");
  if ((groups.get("dessert") ?? 0) > 1) issues.push("Too many desserts");
  if (input.budget.variety === "comfort" && !draft.items.some((line) => line.tag_ids.includes("comfort"))) {
    issues.push("A narrow mix needs a comfort item");
  }
  if (input.budget.variety === "diverse" && categories.size < 3) issues.push("A diverse mix needs three categories");
  if (input.budget.allow_repeat && ![...groups.values()].some((count) => count >= 2)) {
    issues.push("A concentrated catalogue should repeat a category");
  }
  const publicText = [draft.summary, draft.how_we_decided.text, ...draft.items.map((line) => line.justification)];
  if (publicText.some((text) => GAP.test(text))) issues.push("Public copy mentions a gap the person should not see");
  checkNumbers(draft.how_we_decided.text, draft.how_we_decided.cites, input.signals, issues);
  return issues.length === 0 ? { ok: true, order: { draft, total_kcal: totalKcal, total_aud: spend } } : { ok: false, issues };
}

/** Check that quoted prices and calories match the candidate items. */
function checkNumbers(text: string, cites: string[], signals: TasteSignals, issues: string[]) {
  issues.push(...quotedNumberIssues(text, cites, signals));
}
