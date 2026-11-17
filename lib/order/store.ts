import { loadLatestRun, saveAnalysisRun } from "@/lib/analysis-run";
import { sql } from "@/lib/db";
import type { PopularityTier } from "@/lib/order/rules";
import type { OrderStore, StoredOrder } from "@/lib/order/run";
import type { StoredProfile } from "@/lib/profile/run";

type PopularityRow = { popularity_tier: PopularityTier; reason: string; prompt_hash: string };

/** Postgres-backed store for orders and genre popularity. */
export function orderStore(): OrderStore {
  return {
    latestRun: loadLatestRun,
    saveRun: saveAnalysisRun,
    async getProfile(userId, runId) {
      const rows = await sql()<StoredProfile[]>`
        select run_id, user_id, persona_name, tagline, insights, traits, caveats, signals, prompt_version, prompt_hash
        from spotdonalds.taste_profiles
        where run_id = ${runId} and user_id = ${userId}
      `;
      return rows[0] ?? null;
    },
    async getOrder(userId, runId) {
      const rows = await sql()<StoredOrder[]>`
        select
          run_id, user_id, items, invented_rules, summary, how_we_decided, confidence_note,
          totals, budget, popularity, signals, inputs, rules_version, prompt_version, prompt_hash,
          popularity_prompt_hash, menu_retrieved_at
        from spotdonalds.orders
        where run_id = ${runId} and user_id = ${userId}
      `;
      return rows[0] ?? null;
    },
    async saveOrder(order) {
      const db = sql();
      const result = await db`
        insert into spotdonalds.orders (
          run_id, user_id, items, invented_rules, summary, how_we_decided, confidence_note,
          totals, budget, popularity, signals, inputs, rules_version, prompt_version, prompt_hash,
          popularity_prompt_hash, menu_retrieved_at
        ) values (
          ${order.run_id},
          ${order.user_id},
          ${db.json(order.items as Parameters<typeof db.json>[0])},
          ${db.json(order.invented_rules as Parameters<typeof db.json>[0])},
          ${order.summary},
          ${db.json(order.how_we_decided as Parameters<typeof db.json>[0])},
          ${order.confidence_note},
          ${db.json(order.totals)},
          ${db.json(order.budget)},
          ${db.json(order.popularity)},
          ${db.json(order.signals)},
          ${db.json(order.inputs as Parameters<typeof db.json>[0])},
          ${order.rules_version},
          ${order.prompt_version},
          ${order.prompt_hash},
          ${order.popularity_prompt_hash},
          ${order.menu_retrieved_at}
        )
        on conflict (run_id) do update set
          items = excluded.items,
          invented_rules = excluded.invented_rules,
          summary = excluded.summary,
          how_we_decided = excluded.how_we_decided,
          confidence_note = excluded.confidence_note,
          totals = excluded.totals,
          budget = excluded.budget,
          popularity = excluded.popularity,
          signals = excluded.signals,
          inputs = excluded.inputs,
          rules_version = excluded.rules_version,
          prompt_version = excluded.prompt_version,
          prompt_hash = excluded.prompt_hash,
          popularity_prompt_hash = excluded.popularity_prompt_hash,
          menu_retrieved_at = excluded.menu_retrieved_at
        where spotdonalds.orders.user_id = ${order.user_id}
      `;
      if (result.count !== 1) throw new Error("order was not saved");
    },
    async deleteOrder(userId, runId) {
      await sql()`
        delete from spotdonalds.orders
        where run_id = ${runId} and user_id = ${userId}
      `;
    },
    async getPopularity(tagsKey) {
      const rows = await sql()<PopularityRow[]>`
        select popularity_tier, reason, prompt_hash
        from spotdonalds.genre_popularity
        where tags_key = ${tagsKey}
      `;
      return rows[0] ?? null;
    },
    async savePopularity(row) {
      await sql()`
        insert into spotdonalds.genre_popularity (tags_key, popularity_tier, reason, prompt_hash)
        values (${row.tags_key}, ${row.popularity_tier}, ${row.reason}, ${row.prompt_hash})
        on conflict (tags_key) do update set
          popularity_tier = excluded.popularity_tier,
          reason = excluded.reason,
          prompt_hash = excluded.prompt_hash
      `;
    },
  };
}
