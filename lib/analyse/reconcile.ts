import { markRunFailed } from "@/lib/analysis-run";
import { deadWorkerMessage, isDeadWorker } from "@/lib/analyse/machine";
import type { RunRecord } from "@/lib/ingest/types";
import { log } from "@/lib/log";

export async function reconcileStaleRun(run: RunRecord | null, now = Date.now()): Promise<RunRecord | null> {
  if (!run || !isDeadWorker(run, now)) return run;
  const message = deadWorkerMessage(run.stage);
  log("warn", "analyse.stale", { run_id: run.id, user_id: run.user_id, stage: run.stage });
  return (await markRunFailed(run.id, run.user_id, message)) ?? run;
}
