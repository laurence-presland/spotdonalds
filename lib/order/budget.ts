import rulesConfig from "@/config/order-rules.v1.json";
import type { TasteSignals } from "@/lib/signals/compute";

export type PopularityTier = "niche" | "mid" | "mainstream";
export type RequiredProtein = "beef" | "chicken" | "either";

export type OrderRules = typeof rulesConfig;

export type OrderBudget = {
  calorie_budget: { min: number; max: number };
  spend_budget_aud: { min: number; max: number };
  required_protein: RequiredProtein;
  variety: "comfort" | "mixed" | "diverse";
  allow_repeat: boolean;
  widened: boolean;
  category_constraints: string;
};

export function loadOrderRules(): OrderRules {
  return rulesConfig;
}

export function orderBudget(input: {
  signals: TasteSignals;
  energy: number;
  popularity: PopularityTier;
  rules?: OrderRules;
}): OrderBudget {
  const rules = input.rules ?? loadOrderRules();
  const bpm = typeof input.signals["bpm.mean"] === "number" ? input.signals["bpm.mean"] : rules.calories.baseline_bpm;
  const delta = ((bpm - rules.calories.baseline_bpm) / rules.calories.span_bpm) * rules.calories.span_kcal;
  let calorieMin = rules.calories.min + delta;
  let calorieMax = rules.calories.max + delta;
  const spend = rules.spend_aud[input.popularity];
  let spendMin = spend.min;
  let spendMax = spend.max;
  const coverageTags = typeof input.signals["coverage.tags"] === "number" ? input.signals["coverage.tags"] : 1;
  const coverageBpm = typeof input.signals["coverage.bpm"] === "number" ? input.signals["coverage.bpm"] : 1;
  const widened = coverageTags < rules.coverage.widen_below || coverageBpm < rules.coverage.widen_below;
  if (widened) {
    calorieMin -= rules.coverage.calorie_pad;
    calorieMax += rules.coverage.calorie_pad;
    spendMin -= rules.coverage.spend_pad;
    spendMax += rules.coverage.spend_pad;
  }
  const diversity = typeof input.signals["tags.diversity"] === "number" ? input.signals["tags.diversity"] : 0;
  const concentration =
    typeof input.signals["concentration.top_artists_share"] === "number"
      ? input.signals["concentration.top_artists_share"]
      : 0;
  const variety = diversity < rules.variety.narrow_below ? "comfort" : diversity > rules.variety.diverse_above ? "diverse" : "mixed";
  const allowRepeat = concentration > rules.repeat.concentration_above;
  const required = requiredProtein(input.energy, rules);
  return {
    calorie_budget: { min: Math.round(calorieMin), max: Math.round(calorieMax) },
    spend_budget_aud: { min: roundMoney(spendMin), max: roundMoney(spendMax) },
    required_protein: required,
    variety,
    allow_repeat: allowRepeat,
    widened,
    category_constraints: constraintText(allowRepeat, variety, required),
  };
}

export function requiredProtein(energy: number, rules: OrderRules = loadOrderRules()): RequiredProtein {
  if (energy >= rules.energy_protein.beef_at) return "beef";
  if (energy <= rules.energy_protein.chicken_below) return "chicken";
  return "either";
}

export function proteinPhrase(protein: RequiredProtein): string {
  if (protein === "beef") return "beef";
  if (protein === "chicken") return "chicken";
  return "beef or chicken, your call";
}

function constraintText(allowRepeat: boolean, variety: OrderBudget["variety"], protein: RequiredProtein): string {
  const main = allowRepeat ? "one or two mains" : "one main";
  const lean = variety === "comfort" ? " Include a comfort item." : variety === "diverse" ? " Use at least three categories." : "";
  return `${main} (${proteinPhrase(protein)}), at most one side, one drink and one dessert.${lean}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
