import { heartbeatExpired, jobAction } from "@/lib/analyse/machine";
import type { IngestCheckpoint, RunRecord } from "@/lib/ingest/types";

export const LEASE_STALE_MS = 30_000;

export type RunClaim = "attach" | "reopen" | "finished" | "idle" | "insert";

export type PipelineStep = "ingest" | "enrich" | "profile" | "popularity" | "order" | "stop";

/** Decide whether to attach, reopen, insert, or leave the latest run alone. */
export function decideClaim(
  run: { status: string; stage: string; open?: boolean } | null,
  retry: boolean,
): RunClaim {
  if (!run) return "insert";
  if (run.open !== false && run.status === "running") return "attach";
  if (run.open !== false && run.status === "complete" && run.stage !== "done") return "attach";
  if (run.status === "error") return retry ? "reopen" : "idle";
  if (run.stage === "done" && run.status === "complete") return "finished";
  if (run.open !== false) return "attach";
  return "insert";
}

/** Next pipeline stage that still has work, or stop. */
export function nextPipelineStep(
  run: { status: string; stage: string; checkpoint: IngestCheckpoint },
  profileSaved: boolean,
): PipelineStep {
  const action = jobAction(run, {
    profile: profileSaved || Boolean(run.checkpoint.profile),
    popularity: Boolean(run.checkpoint.popularity),
    order: false,
  });
  return action.type === "work" ? action.stage : "stop";
}

/** User-facing copy for a stored analysis error. */
export function analysisErrorCopy(error: string | null | undefined): string {
  if (error === "not_allowlisted") return "This Spotify account isn't on the list.";
  if (error === "reauth_required") return "Spotify needs you to log in again.";
  if (!error) return "The analysis stopped before it finished.";
  return error;
}

/** True when a lease heartbeat is older than the stale window. */
export function isHeartbeatStale(heartbeatAt: string | null | undefined, now: number, staleMs = LEASE_STALE_MS): boolean {
  return heartbeatExpired(heartbeatAt, now, staleMs);
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
