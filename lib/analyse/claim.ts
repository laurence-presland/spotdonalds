import { closeOpenRun, insertOpenRun, loadLatestRun, reopenRun } from "@/lib/analysis-run";
import { decideClaim } from "@/lib/analyse/progress";
import type { RunRecord } from "@/lib/ingest/types";

/** Attach to the current run, reopen a failed one, or start a new one. */
export async function claimAnalysis(userId: string, retry: boolean, now = new Date().toISOString()): Promise<RunRecord | null> {
  const latest = await loadLatestRun(userId);
  const decision = decideClaim(latest, retry);
  if (decision === "reopen" && latest) return reopenRun(latest);
  if (decision === "insert") return insertOpenRun(userId, now);
  return latest;
}

/** Close any open run and insert a new one. */
export async function startFreshAnalysis(userId: string, now = new Date().toISOString()): Promise<RunRecord> {
  await closeOpenRun(userId);
  return insertOpenRun(userId, now);
}
