import type { RunRecord } from "@/lib/ingest/types";

/** User-facing copy for a stored analysis error. */
export function analysisErrorCopy(error: string | null | undefined): string {
  if (error === "not_allowlisted") return "This Spotify account isn't on the list.";
  if (error === "reauth_required") return "Spotify needs you to log in again.";
  if (!error) return "The analysis stopped before it finished.";
  return error;
}

/** Public status payload for a run, used by the client. */
export function runStatus(run: RunRecord | null) {
  if (!run) return { run: null };
  return {
    run: {
      id: run.id,
      status: run.status,
      stage: run.stage,
      error: run.error,
      counts: run.counts,
      heartbeat_at: run.heartbeat_at ?? null,
      outcome: run.outcome ?? null,
      track_count: run.checkpoint.track_count ?? null,
      progress: {
        done: run.checkpoint.enrich_done ?? 0,
        total: run.checkpoint.enrich_total ?? 0,
      },
    },
  };
}
