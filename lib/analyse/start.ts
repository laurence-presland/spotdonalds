import { start } from "workflow/api";
import { claimWorker, clearPendingWorkflow, markRunFailed, setWorkflowId } from "@/lib/analysis-run";
import { analysisWorkflow } from "@/lib/analyse/workflow";
import { safeDbMessage } from "@/lib/db";
import { log } from "@/lib/log";

const START_FAILED = "The analysis didn't start. Try again.";

/** Claim the run and start the analysis workflow if no worker holds it. */
export async function ensureAnalysisJob(userId: string, runId: string): Promise<void> {
  const claimed = await claimWorker(runId, userId);
  if (!claimed) return;
  try {
    const handle = await start(analysisWorkflow, [userId, runId]);
    await setWorkflowId(runId, userId, handle.runId);
    log("info", "analyse.started", { run_id: runId, user_id: userId, workflow_id: handle.runId });
  } catch (error) {
    await clearPendingWorkflow(runId, userId).catch(() => undefined);
    await markRunFailed(runId, userId, START_FAILED).catch(() => undefined);
    log("error", "analyse.start_failed", { run_id: runId, user_id: userId, message: safeDbMessage(error) });
  }
}
