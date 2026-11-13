import { insertOpenRun, loadLatestRun, reopenRun } from "@/lib/analysis-run";
import { decideClaim } from "@/lib/analyse/progress";
import type { RunRecord } from "@/lib/ingest/types";

export async function claimAnalysis(userId: string, retry: boolean, now = new Date().toISOString()): Promise<RunRecord | null> {
  const latest = await loadLatestRun(userId);
  const decision = decideClaim(latest, retry);
  if (decision === "reopen" && latest) return reopenRun(latest);
  if (decision === "insert") return insertOpenRun(userId, now);
  return latest;
}
