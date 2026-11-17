import { closeOpenRun, insertOpenRun, loadLatestRun, reopenRun } from "@/lib/analysis-run";
import type { RunRecord } from "@/lib/ingest/types";

export type Claim = "insert" | "reopen" | "attach" | "leave";

/** Decide whether to start, reopen, attach, or leave the latest run. */
export function claimDecision(
  run: { status: string; stage: string; open?: boolean } | null,
  retry: boolean,
): Claim {
  if (!run) return "insert";
  if (run.status === "error") return retry ? "reopen" : "leave";
  if (run.status === "complete" && run.stage === "done") return "leave";
  if (run.open !== false && run.status === "running") return "attach";
  return "insert";
}

/** Attach to the current run, reopen a failed one, or start a new one. */
export async function claimAnalysis(userId: string, retry: boolean, now = new Date().toISOString()): Promise<RunRecord | null> {
  const latest = await loadLatestRun(userId);
  const decision = claimDecision(latest, retry);
  if (decision === "reopen" && latest) return reopenRun(latest);
  if (decision === "insert") return insertOpenRun(userId, now);
  return latest;
}

/** Close any open run and insert a new one. */
export async function startFreshAnalysis(userId: string, now = new Date().toISOString()): Promise<RunRecord> {
  await closeOpenRun(userId);
  return insertOpenRun(userId, now);
}
