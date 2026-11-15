import type { RunRecord } from "@/lib/ingest/types";

export const ANALYSIS_STOPPED = "The analysis stopped before it finished. Sign in again to try once more.";

/** True when this workflow still owns a running run that can be failed. */
export function canMarkFailed(
  run: { status: string; stage: string; outcome?: string | null; workflow_id?: string | null },
  workflowRunId: string,
): boolean {
  if (run.status !== "running" || run.stage === "done") return false;
  if (run.outcome === "insufficient_data" || run.outcome === "ready") return false;
  return run.workflow_id === workflowRunId;
}

/** Mark the run failed when this workflow still owns it. */
export function markFailedIfOwned(run: RunRecord, workflowRunId: string, now: string): RunRecord | null {
  if (!canMarkFailed(run, workflowRunId)) return null;
  return {
    ...run,
    status: "error",
    error: ANALYSIS_STOPPED,
    finished_at: run.finished_at ?? now,
    open: false,
    attempts: (run.attempts ?? 0) + 1,
    heartbeat_at: null,
  };
}
