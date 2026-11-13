import type { IngestCheckpoint, RunRecord } from "@/lib/ingest/types";

export const LEASE_STALE_MS = 30_000;

export type RunClaim = "attach" | "reopen" | "finished" | "idle" | "insert";

export type PipelineStep = "ingest" | "enrich" | "profile" | "order" | "stop";

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

export function nextPipelineStep(
  run: { status: string; stage: string; checkpoint: Pick<IngestCheckpoint, "enrich"> },
  profileSaved: boolean,
): PipelineStep {
  if (run.status === "error" || run.stage === "done") return "stop";
  if (run.stage === "ingest" && run.status !== "complete") return "ingest";
  if (!run.checkpoint.enrich) return "enrich";
  if (!profileSaved) return "profile";
  return "order";
}

export function analysisErrorCopy(error: string | null | undefined): string {
  if (error === "not_allowlisted") return "This Spotify account isn't on the list.";
  if (error === "reauth_required") return "Spotify needs you to log in again.";
  if (!error) return "The analysis stopped before it finished.";
  return error;
}

export function isHeartbeatStale(heartbeatAt: string | null | undefined, now: number, staleMs = LEASE_STALE_MS): boolean {
  if (!heartbeatAt) return true;
  const at = Date.parse(heartbeatAt);
  return !Number.isFinite(at) || now - at > staleMs;
}

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
      progress: {
        done: run.checkpoint.enrich_done ?? 0,
        total: run.checkpoint.enrich_total ?? 0,
      },
    },
  };
}
