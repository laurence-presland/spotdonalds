import orderTags from "@/data/order-tags.json";
import { loadMenu } from "@/lib/menu/load";
import { orderTagIds } from "@/lib/menu/tags";
import { orderBudget, loadOrderRules, proteinPhrase, type OrderBudget, type PopularityTier } from "@/lib/order/budget";
import { orderCandidates, type OrderCandidate } from "@/lib/order/candidates";
import { validateOrder, validatePopularity } from "@/lib/order/validate";
import { buildPrompt } from "@/lib/prompts/build";
import type { StoredProfile } from "@/lib/profile/run";
import { presentSignals, traitScore } from "@/lib/signals/compute";
import { log as writeLog } from "@/lib/log";
import type { RunRecord } from "@/lib/ingest/types";
import type { StreamEvent } from "@/lib/stream/events";

export type StoredOrder = {
  run_id: string;
  user_id: string;
  items: unknown;
  invented_rules: unknown;
  summary: string;
  how_we_decided: unknown;
  confidence_note: string;
  totals: { kcal: number; aud: number };
  budget: OrderBudget;
  popularity: { popularity_tier: PopularityTier; reason: string };
  signals: StoredProfile["signals"];
  inputs: unknown;
  rules_version: string;
  prompt_version: string;
  prompt_hash: string;
  popularity_prompt_hash: string;
  menu_retrieved_at: string;
};

export type OrderStore = {
  latestRun(userId: string): Promise<RunRecord | null>;
  saveRun(run: RunRecord): Promise<void>;
  getProfile(userId: string, runId: string): Promise<StoredProfile | null>;
  getOrder(userId: string, runId: string): Promise<StoredOrder | null>;
  saveOrder(order: StoredOrder): Promise<void>;
  deleteOrder(userId: string, runId: string): Promise<void>;
  getPopularity(tagsKey: string): Promise<{ popularity_tier: PopularityTier; reason: string; prompt_hash: string } | null>;
  savePopularity(row: { tags_key: string; popularity_tier: PopularityTier; reason: string; prompt_hash: string }): Promise<void>;
};

export type OrderCompletion = (input: {
  kind: "popularity" | "order";
  system: string;
  prompt: string;
  itemIds?: string[];
  tagIds?: string[];
}) => Promise<{ object: unknown; usage?: { inputTokens?: number; outputTokens?: number } }>;

const ATTEMPTS = 3;

export async function runOrder(input: {
  userId: string;
  store: OrderStore;
  complete: OrderCompletion;
  emit: (event: StreamEvent) => void;
  log?: typeof writeLog;
  candidates?: OrderCandidate[];
  force?: boolean;
}): Promise<StoredOrder> {
  const record = input.log ?? writeLog;
  const run = await input.store.latestRun(input.userId);
  if (!run) {
    input.emit({ type: "error", code: "no_run", message: "Ingest listening before building an order." });
    throw new Error("no_run");
  }
  if (run.status === "error") {
    input.emit({ type: "error", code: "profile_invalid", message: run.error || "The taste profile didn't pass checking." });
    throw new Error(run.error || "profile_failed");
  }
  const existing = await input.store.getOrder(input.userId, run.id);
  input.emit({ type: "stage", stage: "order" });
  if (existing && !input.force) {
    await finishRun(input, run);
    input.emit({ type: "stage", stage: "done" });
    return existing;
  }
  if (existing) await input.store.deleteOrder(input.userId, run.id);
  const profile = await input.store.getProfile(input.userId, run.id);
  if (!profile) {
    input.emit({ type: "error", code: "no_profile", message: "Build a taste profile before the order." });
    throw new Error("no_profile");
  }

  run.stage = "order";
  run.status = "running";
  run.error = null;
  run.finished_at = null;
  await input.store.saveRun(run);

  const rules = loadOrderRules();
  const candidates = input.candidates ?? orderCandidates();
  let popularity: { popularity_tier: PopularityTier; reason: string; prompt_hash: string };
  try {
    popularity = await resolvePopularity(input, record, run.id, profile);
  } catch (error) {
    run.status = "error";
    run.stage = "popularity";
    run.error = error instanceof Error ? error.message : "popularity_invalid";
    await input.store.saveRun(run);
    input.emit({ type: "error", code: "order_invalid", message: "The order didn't pass checking." });
    throw error;
  }
  const budget = orderBudget({
    signals: profile.signals,
    energy: traitScore("energy", profile.signals),
    popularity: popularity.popularity_tier,
    rules,
  });
  const orderPrompt = buildPrompt("order.v1", {
    "calorie_budget.min": String(budget.calorie_budget.min),
    "calorie_budget.max": String(budget.calorie_budget.max),
    "spend_budget_aud.min": String(budget.spend_budget_aud.min),
    "spend_budget_aud.max": String(budget.spend_budget_aud.max),
    required_protein: proteinPhrase(budget.required_protein),
    category_constraints: budget.category_constraints,
  });
  const payload = {
    profile: {
      persona_name: profile.persona_name,
      tagline: profile.tagline,
      insights: profile.insights,
      traits: profile.traits,
    },
    signals: presentSignals(profile.signals),
    rules: rules.rules.map((rule) => ({ id: rule.id, description: rule.description })),
    constraints: {
      calorie_budget: budget.calorie_budget,
      spend_budget_aud: budget.spend_budget_aud,
      required_protein: budget.required_protein,
      category_constraints: budget.category_constraints,
    },
    candidates,
    tags: orderTags.tags.map((tag) => ({ id: tag.id, label: tag.label, description: tag.description })),
  };
  const user = JSON.stringify(payload);
  let errors: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const started = Date.now();
    try {
      const result = await input.complete({
        kind: "order",
        system: orderPrompt.text,
        prompt: errors.length === 0 ? user : `${user}\n\nFix these and try again:\n${errors.join("\n")}`,
        itemIds: candidates.map((item) => item.item_id),
        tagIds: orderTagIds(),
      });
      const checked = validateOrder(result.object, { candidates, budget, signals: profile.signals });
      record("info", "order.model", {
        user_id: input.userId,
        run_id: run.id,
        attempt,
        retry_count: attempt - 1,
        latency_ms: Date.now() - started,
        input_tokens: result.usage?.inputTokens ?? null,
        output_tokens: result.usage?.outputTokens ?? null,
        ok: checked.ok,
        validation_failures: checked.ok ? [] : checked.issues,
      });
      if (!checked.ok) {
        errors = checked.issues;
        continue;
      }
      const stored: StoredOrder = {
        run_id: run.id,
        user_id: input.userId,
        items: checked.order.draft.items,
        invented_rules: checked.order.draft.invented_rules,
        summary: checked.order.draft.summary,
        how_we_decided: checked.order.draft.how_we_decided,
        confidence_note: checked.order.draft.confidence_note,
        totals: { kcal: checked.order.total_kcal, aud: checked.order.total_aud },
        budget,
        popularity: { popularity_tier: popularity.popularity_tier, reason: popularity.reason },
        signals: profile.signals,
        inputs: payload,
        rules_version: rules.version,
        prompt_version: orderPrompt.version,
        prompt_hash: orderPrompt.hash,
        popularity_prompt_hash: popularity.prompt_hash,
        menu_retrieved_at: loadMenu().metadata.retrieved_at,
      };
      await input.store.saveOrder(stored);
      run.status = "complete";
      run.stage = "done";
      run.finished_at = new Date().toISOString();
      await input.store.saveRun(run);
      input.emit({ type: "stage", stage: "done" });
      return stored;
    } catch (error) {
      errors = [error instanceof Error ? error.message : "The model call failed"];
      record("warn", "order.model", {
        user_id: input.userId,
        attempt,
        retry_count: attempt - 1,
        latency_ms: Date.now() - started,
        ok: false,
        validation_failures: errors,
      });
    }
  }
  run.status = "error";
  run.error = errors.join("; ");
  await input.store.saveRun(run);
  input.emit({ type: "error", code: "order_invalid", message: "The order didn't pass checking." });
  throw new Error(run.error || "order_invalid");
}

export async function runPopularity(input: {
  userId: string;
  store: OrderStore;
  complete: OrderCompletion;
  emit: (event: StreamEvent) => void;
  log?: typeof writeLog;
}): Promise<void> {
  const record = input.log ?? writeLog;
  const run = await input.store.latestRun(input.userId);
  if (!run) throw new Error("no_run");
  if (run.status === "error") throw new Error(run.error || "profile_failed");
  if (run.checkpoint.popularity) return;
  const profile = await input.store.getProfile(input.userId, run.id);
  if (!profile) throw new Error("no_profile");
  run.stage = "popularity";
  run.status = "running";
  run.error = null;
  run.finished_at = null;
  await input.store.saveRun(run);
  try {
    await resolvePopularity(input, record, run.id, profile);
  } catch (error) {
    run.status = "error";
    run.stage = "popularity";
    run.error = error instanceof Error ? error.message : "popularity_invalid";
    await input.store.saveRun(run);
    throw error;
  }
  run.checkpoint = { ...run.checkpoint, popularity: true };
  run.status = "running";
  run.finished_at = null;
  await input.store.saveRun(run);
}

async function finishRun(input: { store: OrderStore }, run: RunRecord): Promise<void> {
  if (run.stage === "done" && run.status === "complete" && run.finished_at) return;
  run.stage = "done";
  run.status = "complete";
  run.error = null;
  run.finished_at = new Date().toISOString();
  await input.store.saveRun(run);
}

async function resolvePopularity(
  input: { userId: string; store: OrderStore; complete: OrderCompletion },
  record: typeof writeLog,
  runId: string,
  profile: StoredProfile,
): Promise<{ popularity_tier: PopularityTier; reason: string; prompt_hash: string }> {
  const popularityPrompt = buildPrompt("popularity.v1");
  const tagsKey = JSON.stringify(profile.signals["tags.top"]);
  const cached = await input.store.getPopularity(tagsKey);
  if (cached && cached.prompt_hash === popularityPrompt.hash) return cached;
  return callPopularity(input, record, popularityPrompt.text, popularityPrompt.hash, tagsKey, profile, runId);
}

async function callPopularity(
  input: { userId: string; store: OrderStore; complete: OrderCompletion },
  record: typeof writeLog,
  system: string,
  hash: string,
  tagsKey: string,
  profile: StoredProfile,
  runId: string,
): Promise<{ popularity_tier: PopularityTier; reason: string; prompt_hash: string }> {
  let errors: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const started = Date.now();
    const result = await input.complete({
      kind: "popularity",
      system,
      prompt: errors.length === 0 ? JSON.stringify({ tags: profile.signals["tags.top"] }) : `${JSON.stringify({ tags: profile.signals["tags.top"] })}\n\n${errors.join("\n")}`,
    });
    const checked = validatePopularity(result.object);
    record("info", "order.popularity", {
      user_id: input.userId,
      run_id: runId,
      attempt,
      retry_count: attempt - 1,
      latency_ms: Date.now() - started,
      input_tokens: result.usage?.inputTokens ?? null,
      output_tokens: result.usage?.outputTokens ?? null,
      ok: checked.ok,
      validation_failures: checked.ok ? [] : checked.issues,
    });
    if (!checked.ok) {
      errors = checked.issues;
      continue;
    }
    const row = { tags_key: tagsKey, ...checked.popularity, prompt_hash: hash };
    await input.store.savePopularity(row);
    return row;
  }
  throw new Error(errors.join("; ") || "popularity_invalid");
}
