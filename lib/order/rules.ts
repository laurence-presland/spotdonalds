import rulesConfig from "@/config/order-rules.v1.json";

export type PopularityTier = "niche" | "mid" | "mainstream";

export type OrderRules = typeof rulesConfig;

export type OrderScales = OrderRules["scales"];

/** Load the versioned order rules and their little/lot scales. */
export function loadOrderRules(): OrderRules {
  return rulesConfig;
}

/** Render the written rules and scales for the order prompt. */
export function renderOrderRules(rules: OrderRules = loadOrderRules()): string {
  const lines = rules.rules.map((rule) => `${rule.id} (${rule.signal}): ${rule.description}`);
  const scales = rules.scales;
  const scaleLines = [
    `calories: a little is ${scales.calories_kcal.a_little} kcal, a lot is ${scales.calories_kcal.a_lot} kcal`,
    `spend: a little is $${scales.spend_aud.a_little}, a lot is $${scales.spend_aud.a_lot}`,
    `bpm: a little is ${scales.bpm.a_little}, a lot is ${scales.bpm.a_lot}`,
    `energy: a little is ${scales.energy.a_little}, a lot is ${scales.energy.a_lot}`,
    `genre diversity: a little is ${scales.diversity.a_little}, a lot is ${scales.diversity.a_lot}`,
    `artist concentration: a lot is ${scales.artist_concentration.a_lot}`,
    `coverage: a little is ${scales.coverage.a_little}`,
  ];
  return `${lines.join("\n")}\n\nA little and a lot:\n${scaleLines.map((line) => `- ${line}`).join("\n")}`;
}
