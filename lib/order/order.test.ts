import { describe, expect, it } from "vitest";
import { orderBudget, requiredProtein } from "@/lib/order/budget";
import { orderCandidates, type OrderCandidate } from "@/lib/order/candidates";
import { indicativePrice } from "@/lib/order/prices";
import { runOrder, type OrderStore, type StoredOrder } from "@/lib/order/run";
import { orderSchema } from "@/lib/order/schema";
import { validateOrder, validatePopularity } from "@/lib/order/validate";
import { buildPrompt } from "@/lib/prompts/build";
import { emptyCounts, type RunRecord } from "@/lib/ingest/types";
import { loadMenu } from "@/lib/menu/load";
import type { StoredProfile } from "@/lib/profile/run";
import type { TasteSignals } from "@/lib/signals/compute";
import type { StreamEvent } from "@/lib/stream/events";

const signals: TasteSignals = {
  "tags.top": [{ tag: "jazz", share: 1 }],
  "tags.diversity": 0.5,
  "bpm.mean": 128,
  "bpm.median": 120,
  "bpm.spread": 10,
  "bpm.sample_size": 4,
  "consistency.artist_overlap": 0.5,
  "consistency.track_overlap": 0.2,
  "consistency.tag_drift": 0.2,
  "concentration.top_artists_share": 0.4,
  "repeat.rate": 0.2,
  "recency.recent_share": 0.4,
  "recency.median_release_year": 2014,
  "explicit.share": 0.1,
  "coverage.tags": 0.9,
  "coverage.bpm": 0.9,
};

const candidates: OrderCandidate[] = [
  { item_id: "big-mac", name: "Big Mac", category: "burgers", kcal: 621, kj: 2600, protein_g: 28, protein: "beef", tag_ids: ["classic"], price_aud: 7.9 },
  { item_id: "mcchicken", name: "McChicken", category: "chicken_and_fish", kcal: 400, kj: 1700, protein_g: 16, protein: "chicken", tag_ids: ["comfort"], price_aud: 7.5 },
  { item_id: "medium-fries", name: "Medium Fries", category: "sides", kcal: 316, kj: 1320, protein_g: 4, protein: "other", tag_ids: ["side"], price_aud: 5.45 },
  { item_id: "coke", name: "Coke", category: "cold_and_frozen_drinks", kcal: 136, kj: 570, protein_g: 0, protein: "other", tag_ids: ["high-energy"], price_aud: 4.55 },
  { item_id: "mcflurry", name: "McFlurry", category: "desserts", kcal: 312, kj: 1300, protein_g: 8, protein: "other", tag_ids: ["sweet"], price_aud: 4.5 },
];

function line(itemId: string, tag: string) {
  return {
    item_id: itemId,
    quantity: 1,
    justification: "Fits a 128 BPM tempo.",
    tag_ids: [tag],
    rule_ids: ["bpm-calories", "x-fizzy"],
    cites: ["bpm.mean"],
  };
}

function validOrder() {
  return {
    items: [line("big-mac", "classic"), line("medium-fries", "side"), line("coke", "high-energy"), line("mcflurry", "sweet")],
    invented_rules: [{ id: "x-fizzy", description: "Fast tempos want something fizzy.", basis: ["bpm.mean"] }],
    summary: "A hearty drive-through for a fast tempo.",
    confidence_note: "The drink could have gone either way.",
    how_we_decided: {
      text: "Average tempo is 128 BPM, so the meal leans hearty.",
      rule_ids: ["bpm-calories"],
      cites: ["bpm.mean"],
    },
  };
}

const budget = orderBudget({ signals, energy: 68, popularity: "mid" });

describe("order budget", () => {
  it("maps tempo, energy and popularity, and stays stable", () => {
    expect(orderBudget({ signals, energy: 80, popularity: "mid" }).calorie_budget).toEqual({ min: 1200, max: 1450 });
    expect(orderBudget({ signals: { ...signals, "bpm.mean": 100 }, energy: 50, popularity: "mid" }).calorie_budget).toEqual({
      min: 1000,
      max: 1250,
    });
    expect(orderBudget({ signals: { ...signals, "coverage.tags": 0.2 }, energy: 80, popularity: "mid" }).calorie_budget).toEqual({
      min: 1050,
      max: 1600,
    });
    expect(requiredProtein(80)).toBe("beef");
    expect(requiredProtein(30)).toBe("chicken");
    expect(requiredProtein(50)).toBe("either");
    expect(orderBudget({ signals, energy: 50, popularity: "niche" }).spend_budget_aud).toEqual({ min: 12, max: 24 });
    expect(orderBudget({ signals, energy: 50, popularity: "mid" }).spend_budget_aud).toEqual({ min: 16, max: 30 });
    expect(orderBudget({ signals, energy: 50, popularity: "mainstream" }).spend_budget_aud).toEqual({ min: 20, max: 38 });
    expect(orderBudget({ signals, energy: 68, popularity: "mid" })).toEqual(budget);
    expect(indicativePrice({ id: "big-mac", category: "burgers", size: "medium" })).toBe(7.9);
  });
});

describe("order validation", () => {
  it("accepts a sacred-rule order and rejects broken ones", () => {
    const ok = validateOrder(validOrder(), { candidates, budget, signals });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.order.total_kcal).toBe(1385);
      expect(ok.order.total_aud).toBe(22.4);
    }
    const invented = validOrder();
    invented.items[0]!.rule_ids = ["x-missing"];
    expect(validateOrder(invented, { candidates, budget, signals }).ok).toBe(false);
    expect(orderSchema(candidates.map((item) => item.item_id), ["classic", "side", "sweet", "high-energy"]).safeParse({
      ...validOrder(),
      items: [{ ...line("not-on-menu", "classic") }],
    }).success).toBe(false);
    expect(validateOrder({ ...validOrder(), items: [line("big-mac", "not-a-tag"), ...validOrder().items.slice(1)] }, { candidates, budget, signals }).ok).toBe(false);
    const heavy = validOrder();
    heavy.items[1] = { ...heavy.items[1]!, quantity: 1 };
    const heavyCandidates = candidates.map((item) => (item.item_id === "medium-fries" ? { ...item, kcal: 1200 } : item));
    expect(validateOrder(heavy, { candidates: heavyCandidates, budget, signals }).ok).toBe(false);
    const chicken = validOrder();
    chicken.items[0] = line("mcchicken", "comfort");
    expect(validateOrder(chicken, { candidates, budget, signals }).ok).toBe(false);
    const low = orderBudget({ signals: { ...signals, "bpm.mean": 70 }, energy: 10, popularity: "mid" });
    expect(validateOrder(validOrder(), { candidates, budget: low, signals: { ...signals, "bpm.mean": 70 } }).ok).toBe(false);
    const pricey = candidates.map((item) => ({ ...item, price_aud: item.item_id === "big-mac" ? 20 : 3 }));
    const niche = orderBudget({ signals, energy: 68, popularity: "niche" });
    expect(validateOrder(validOrder(), { candidates: pricey, budget: niche, signals }).ok).toBe(false);
    const wrong = validOrder();
    wrong.how_we_decided = { ...wrong.how_we_decided, text: "Average tempo is 999 BPM." };
    expect(validateOrder(wrong, { candidates, budget, signals }).ok).toBe(false);
    const gap = validOrder();
    gap.summary = "There is missing data in this order.";
    expect(validateOrder(gap, { candidates, budget, signals }).ok).toBe(false);
    expect(validatePopularity({ popularity_tier: "mid", reason: "Jazz sits in the middle." }).ok).toBe(true);
    expect(validatePopularity({ popularity_tier: "mid", reason: "About $12." }).ok).toBe(false);
    expect(validatePopularity({ popularity_tier: "superstar", reason: "No." }).ok).toBe(false);
  });

  it("gives the model compact candidates, not menu descriptions", () => {
    const compact = orderCandidates();
    expect(compact.length).toBeGreaterThan(10);
    expect(compact[0]).not.toHaveProperty("description");
    expect(JSON.stringify(compact)).not.toContain("nutrition_note");
    expect(loadMenu().metadata.retrieved_at).toContain("2026-11-13");
  });
});

describe("runOrder", () => {
  it("retries a bad id, stores hashes, and skips the model when cached", async () => {
    const events: StreamEvent[] = [];
    const stages: string[] = [];
    let calls = 0;
    let stored: StoredOrder | null = null;
    const run: RunRecord = {
      id: "run-1",
      user_id: "user-1",
      status: "complete",
      stage: "profile",
      started_at: "2026-11-13T00:00:00Z",
      finished_at: null,
      counts: emptyCounts(),
      error: null,
      checkpoint: {},
    };
    const profile = {
      run_id: "run-1",
      user_id: "user-1",
      persona_name: "Repeat-Button Romantic",
      tagline: "Fast and loyal.",
      insights: [],
      traits: [],
      caveats: [],
      signals,
      prompt_version: "profile.v1",
      prompt_hash: "abc",
    } as StoredProfile;
    const store: OrderStore = {
      async latestRun() {
        return run;
      },
      async saveRun(next) {
        stages.push(`${next.stage}:${next.status}`);
        Object.assign(run, next);
      },
      async getProfile() {
        return profile;
      },
      async getOrder() {
        return stored;
      },
      async saveOrder(order) {
        stored = order;
      },
      async getPopularity() {
        return null;
      },
      async savePopularity() {
        return undefined;
      },
    };
    const saved = await runOrder({
      userId: "user-1",
      store,
      candidates,
      emit: (event) => events.push(event),
      log: () => undefined,
      complete: async (call) => {
        calls += 1;
        if (call.kind === "popularity") return { object: { popularity_tier: "mid", reason: "Jazz sits in the middle." }, usage: { inputTokens: 5, outputTokens: 2 } };
        expect(call.prompt).not.toContain("nutrition_note");
        expect(call.prompt).toContain("big-mac");
        if (calls === 2) return { object: { ...validOrder(), items: [line("not-on-menu", "classic")] }, usage: { inputTokens: 8, outputTokens: 3 } };
        return { object: validOrder(), usage: { inputTokens: 9, outputTokens: 4 } };
      },
    });
    expect(saved.totals).toEqual({ kcal: 1385, aud: 22.4 });
    expect(saved.prompt_hash).toBe(buildPrompt("order.v1", {
      "calorie_budget.min": "1200",
      "calorie_budget.max": "1450",
      "spend_budget_aud.min": "16",
      "spend_budget_aud.max": "30",
      required_protein: "beef",
      category_constraints: budget.category_constraints,
    }).hash);
    expect(saved.popularity_prompt_hash).toBe(buildPrompt("popularity.v1").hash);
    expect(saved.rules_version).toBe("order-rules.v1");
    expect(saved.menu_retrieved_at).toContain("2026");
    expect(saved.summary).not.toMatch(/coverage|missing data|unlabeled|uncertain/i);
    expect(stages.at(-1)).toBe("done:complete");
    expect(events.some((event) => event.type === "stage" && event.stage === "done")).toBe(true);
    const before = calls;
    await runOrder({ userId: "user-1", store, candidates, emit: () => undefined, complete: async () => { calls += 1; return { object: {} }; } });
    expect(calls).toBe(before);
  });

  it("stores nothing when every attempt fails", async () => {
    const events: StreamEvent[] = [];
    const run: RunRecord = {
      id: "run-2",
      user_id: "user-1",
      status: "complete",
      stage: "profile",
      started_at: "2026-11-13T00:00:00Z",
      finished_at: null,
      counts: emptyCounts(),
      error: null,
      checkpoint: {},
    };
    let saved = false;
    const store: OrderStore = {
      async latestRun() {
        return run;
      },
      async saveRun(next) {
        Object.assign(run, next);
      },
      async getProfile() {
        return { signals, traits: [], persona_name: "A", tagline: "B", insights: [], caveats: [], run_id: "run-2", user_id: "user-1", prompt_version: "profile.v1", prompt_hash: "x" } as StoredProfile;
      },
      async getOrder() {
        return null;
      },
      async saveOrder() {
        saved = true;
      },
      async getPopularity() {
        return { popularity_tier: "mid", reason: "Jazz sits in the middle.", prompt_hash: buildPrompt("popularity.v1").hash };
      },
      async savePopularity() {
        return undefined;
      },
    };
    await expect(
      runOrder({
        userId: "user-1",
        store,
        candidates,
        emit: (event) => events.push(event),
        log: () => undefined,
        complete: async () => { throw new Error("malformed"); },
      }),
    ).rejects.toThrow();
    expect(saved).toBe(false);
    expect(events.some((event) => event.type === "error" && event.code === "order_invalid")).toBe(true);
    expect(run.status).toBe("error");
  });
});
