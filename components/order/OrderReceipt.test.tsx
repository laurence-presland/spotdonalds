import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderReceipt, orderLines } from "@/components/order/OrderReceipt";
import type { StoredOrder } from "@/lib/order/run";
import type { TasteSignals } from "@/lib/signals/compute";

const menu = [
  { id: "big-mac", name: "Big Mac", category: "burgers", size: null, kcal: 621 },
  { id: "medium-fries", name: "Medium Fries", category: "sides", size: "medium", kcal: 316 },
  { id: "coke", name: "Coke", category: "cold_and_frozen_drinks", size: "medium", kcal: 136 },
  { id: "mcflurry", name: "McFlurry", category: "desserts", size: null, kcal: 312 },
];

const order = {
  run_id: "run-1",
  user_id: "user-1",
  items: [
    { item_id: "big-mac", quantity: 1, justification: "A classic for a steady tempo.", tag_ids: ["classic"] },
    { item_id: "medium-fries", quantity: 1, justification: "The side that goes with it.", tag_ids: ["side"] },
    { item_id: "coke", quantity: 1, justification: "Something cold.", tag_ids: ["high-energy"] },
    { item_id: "mcflurry", quantity: 1, justification: "A sweet finish.", tag_ids: ["sweet", "not-a-real-tag"] },
    { item_id: "gone", quantity: 1, tag_ids: ["invented-label"] },
  ],
  invented_rules: [{ id: "x-fizzy", description: "Fast tempos want something fizzy.", basis: [] }],
  summary: "A hearty drive-through.",
  how_we_decided: { text: "The tempo pointed at a hearty meal.", rule_ids: ["bpm-calories"], cites: ["bpm.mean"] },
  confidence_note: "SECRET CONFIDENCE NOTE",
  totals: { kcal: 1, aud: 1 },
  budget: {
    calorie_budget: { min: 1200, max: 1450 },
    spend_budget_aud: { min: 16, max: 30 },
    required_protein: "beef",
    variety: "mixed",
    allow_repeat: false,
    widened: false,
    category_constraints: "one main",
  },
  popularity: { popularity_tier: "mid", reason: "Middle of the road." },
  signals: {} as TasteSignals,
  inputs: {},
  rules_version: "order-rules.v1",
  prompt_version: "order.v1",
  prompt_hash: "abc",
  popularity_prompt_hash: "def",
  menu_retrieved_at: "2026-11-13T18:05:48+11:00",
} as StoredOrder;

describe("OrderReceipt", () => {
  it("sums the lines, shows the explanation, and hides the confidence note", () => {
    const html = renderToStaticMarkup(<OrderReceipt order={order} menu={menu} />);
    const lines = orderLines(order, menu);
    const dollars = lines.reduce((sum, line) => sum + (line.price ?? 0), 0);
    const calories = lines.reduce((sum, line) => sum + (line.kcal ?? 0), 0);
    expect(html).toContain(`$${dollars.toFixed(2)}`);
    expect(html).toContain(`${calories} kcal`);
    expect(html).toContain("Big Mac");
    expect(html).toContain("Why this was chosen");
    expect(html).toContain("A classic for a steady tempo.");
    expect(html).toContain("Classic");
    expect(html).toContain("The tempo pointed at a hearty meal.");
    expect(html).toContain("Higher average BPM means more calories.");
    expect(html).toContain("2026-11-13T18:05:48+11:00");
    expect(html).toContain("Not affiliated");
    expect(html).toContain("House rules, invented by the AI");
    expect(html).toContain("Fast tempos want something fizzy.");
    expect(html).toContain("gone");
    expect(html).not.toContain("not-a-real-tag");
    expect(html).not.toContain("invented-label");
    expect(html).not.toContain("SECRET CONFIDENCE");
    expect(html).not.toContain("signal-chip");
    expect(html.match(/class="receipt"/g)).toHaveLength(1);
    expect(html).toContain("Regenerate order");
  });

  it("shows loading and error without a second receipt", () => {
    expect(renderToStaticMarkup(<OrderReceipt order={null} menu={[]} status="loading" />)).toContain("Building your order.");
    const error = renderToStaticMarkup(<OrderReceipt order={order} menu={menu} status="error" />);
    expect(error).toContain("did not come together");
    expect(error).not.toContain("Big Mac");
  });
});
