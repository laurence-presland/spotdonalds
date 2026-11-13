import { emptyCounts, type RunRecord } from "@/lib/ingest/types";
import type { OrderStore, StoredOrder } from "@/lib/order/run";
import type { PopularityTier } from "@/lib/order/budget";
import type { StoredProfile } from "@/lib/profile/run";
import { createAdminClient } from "@/lib/supabase/admin";

export function supabaseOrderStore(): OrderStore {
  const db = () => createAdminClient();
  return {
    async latestRun(userId) {
      const { data, error } = await db()
        .from("analysis_runs")
        .select("*")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const run = data as RunRecord;
      return { ...run, counts: { ...emptyCounts(), ...run.counts }, checkpoint: run.checkpoint ?? {} };
    },
    async saveRun(run) {
      const { error } = await db()
        .from("analysis_runs")
        .update({ status: run.status, stage: run.stage, finished_at: run.finished_at, error: run.error })
        .eq("id", run.id)
        .eq("user_id", run.user_id);
      if (error) throw new Error(error.message);
    },
    async getProfile(runId) {
      const { data, error } = await db().from("taste_profiles").select("*").eq("run_id", runId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as StoredProfile | null) ?? null;
    },
    async getOrder(runId) {
      const { data, error } = await db().from("orders").select("*").eq("run_id", runId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as StoredOrder | null) ?? null;
    },
    async saveOrder(order) {
      const { error } = await db().from("orders").upsert(order);
      if (error) throw new Error(error.message);
    },
    async deleteOrder(runId) {
      const { error } = await db().from("orders").delete().eq("run_id", runId);
      if (error) throw new Error(error.message);
    },
    async getPopularity(tagsKey) {
      const { data, error } = await db().from("genre_popularity").select("*").eq("tags_key", tagsKey).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as { popularity_tier: PopularityTier; reason: string; prompt_hash: string };
      return row;
    },
    async savePopularity(row) {
      const { error } = await db().from("genre_popularity").upsert(row);
      if (error) throw new Error(error.message);
    },
  };
}
