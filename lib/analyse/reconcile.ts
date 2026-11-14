import { shouldStartWorker } from "@/lib/analyse/machine";
import { ensureAnalysisJob } from "@/lib/analyse/start";
import { loadRun } from "@/lib/analysis-run";
import { safeDbMessage } from "@/lib/db";
import type { RunRecord } from "@/lib/ingest/types";
import { log } from "@/lib/log";

export async function reviveOrClose(run: RunRecord | null, now = Date.now()): Promise<RunRecord | null> {
  if (!run || run.status !== "running" || run.stage === "done") return run;
  if (!shouldStartWorker(run, now)) return run;
  log("warn", "analyse.recover", { run_id: run.id, user_id: run.user_id, stage: run.stage });
  try {
    await ensureAnalysisJob(run.user_id, run.id);
  } catch (error) {
    log("error", "analyse.recover_failed", { run_id: run.id, user_id: run.user_id, message: safeDbMessage(error) });
  }
  return (await loadRun(run.id, run.user_id)) ?? run;
}

export async function reconcileStaleRun(run: RunRecord | null, now = Date.now()): Promise<RunRecord | null> {
  return reviveOrClose(run, now);
}
