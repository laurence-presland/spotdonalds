import { emptyCounts, type RunRecord } from "@/lib/ingest/types";
import type { ProfileStore, StoredProfile } from "@/lib/profile/run";
import { loadListening } from "@/lib/signals/load";
import { createAdminClient } from "@/lib/supabase/admin";

export function supabaseProfileStore(): ProfileStore {
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
        .update({
          status: run.status,
          stage: run.stage,
          finished_at: run.finished_at,
          error: run.error,
        })
        .eq("id", run.id)
        .eq("user_id", run.user_id);
      if (error) throw new Error(error.message);
    },
    async getProfile(runId) {
      const { data, error } = await db().from("taste_profiles").select("*").eq("run_id", runId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as StoredProfile | null) ?? null;
    },
    async saveProfile(profile) {
      const { error } = await db().from("taste_profiles").upsert(profile);
      if (error) throw new Error(error.message);
    },
    async deleteProfile(runId) {
      const { error } = await db().from("taste_profiles").delete().eq("run_id", runId);
      if (error) throw new Error(error.message);
    },
    loadListening,
  };
}
