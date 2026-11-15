import { loadLatestRun, saveAnalysisRun } from "@/lib/analysis-run";
import { sql } from "@/lib/db";
import type { ProfileStore, StoredProfile } from "@/lib/profile/run";
import { loadListening } from "@/lib/signals/load";

/** Postgres-backed store for the saved taste profile. */
export function profileStore(): ProfileStore {
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
    async saveProfile(profile) {
      const db = sql();
      const result = await db`
        insert into spotdonalds.taste_profiles (
          run_id, user_id, persona_name, tagline, insights, traits, caveats, signals, prompt_version, prompt_hash
        ) values (
          ${profile.run_id},
          ${profile.user_id},
          ${profile.persona_name},
          ${profile.tagline},
          ${db.json(profile.insights)},
          ${db.json(profile.traits)},
          ${db.json(profile.caveats)},
          ${db.json(profile.signals)},
          ${profile.prompt_version},
          ${profile.prompt_hash}
        )
        on conflict (run_id) do update set
          persona_name = excluded.persona_name,
          tagline = excluded.tagline,
          insights = excluded.insights,
          traits = excluded.traits,
          caveats = excluded.caveats,
          signals = excluded.signals,
          prompt_version = excluded.prompt_version,
          prompt_hash = excluded.prompt_hash
        where spotdonalds.taste_profiles.user_id = ${profile.user_id}
      `;
      if (result.count !== 1) throw new Error("taste profile was not saved");
    },
    async deleteProfile(userId, runId) {
      await sql()`
        delete from spotdonalds.taste_profiles
        where run_id = ${runId} and user_id = ${userId}
      `;
    },
    loadListening,
  };
}
