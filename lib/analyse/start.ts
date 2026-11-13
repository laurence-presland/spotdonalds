import { start } from "workflow/api";
import { claimWorker, clearPendingWorkflow, setWorkflowId } from "@/lib/analysis-run";
import { analysisWorkflow } from "@/lib/analyse/workflow";
import { safeDbMessage } from "@/lib/db";
import { log } from "@/lib/log";

export async function ensureAnalysisJob(userId: string, runId: string): Promise<void> {
  const claimed = await claimWorker(runId, userId);
  if (!claimed) return;
  try {
    const handle = await start(analysisWorkflow, [userId, runId]);
    await setWorkflowId(runId, userId, handle.runId);
    log("info", "analyse.started", { run_id: runId, user_id: userId });
  } catch (error) {
    await clearPendingWorkflow(runId, userId).catch(() => undefined);
    log("error", "analyse.start_failed", { run_id: runId, user_id: userId, message: safeDbMessage(error) });
    throw error;
  }
}
