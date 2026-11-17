import { orderTagIds } from "@/lib/menu/tags";
import type { OrderCandidate } from "@/lib/order/candidates";
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

/** Validate a model order against the schema, the menu, and its citations. */
export function validateOrder(value: unknown, input: {
  candidates: OrderCandidate[];
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
  for (const line of draft.items) {
    const item = byId.get(line.item_id);
    if (!item) {
      issues.push(`Unknown item: ${line.item_id}`);
      continue;
    }
    totalKcal += item.kcal * line.quantity;
    totalAud += item.price_aud * line.quantity;
    checkNumbers(line.justification, line.cites, input.signals, issues);
  }
  const spend = Math.round(totalAud * 100) / 100;
  const publicText = [draft.summary, draft.how_we_decided.text, ...draft.items.map((line) => line.justification)];
  if (publicText.some((text) => GAP.test(text))) issues.push("Public copy mentions a gap the person should not see");
  checkNumbers(draft.how_we_decided.text, draft.how_we_decided.cites, input.signals, issues);
  return issues.length === 0 ? { ok: true, order: { draft, total_kcal: totalKcal, total_aud: spend } } : { ok: false, issues };
}

/** Check that quoted prices and calories match the candidate items. */
function checkNumbers(text: string, cites: string[], signals: TasteSignals, issues: string[]) {
  issues.push(...quotedNumberIssues(text, cites, signals));
}
