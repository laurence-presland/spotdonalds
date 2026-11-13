import { loadAnalysisContext } from "@/lib/analyse/execute";
import { jobAction, terminalInsufficient, terminalSuccess } from "@/lib/analyse/machine";
import { enqueueAnalysis, stageIdempotencyKey } from "@/lib/analyse/queue";
import { claimWorker, clearPendingWorkflow, markRunFailed, saveAnalysisRun } from "@/lib/analysis-run";
import { safeDbMessage } from "@/lib/db";
import { log } from "@/lib/log";

const START_FAILED = "The analysis didn't start. Try again.";

export async function ensureAnalysisJob(userId: string, runId: string): Promise<void> {
  const claimed = await claimWorker(runId, userId);
  if (!claimed) return;
  try {
    const loaded = await loadAnalysisContext(userId, runId);
    if (!loaded) {
      await clearPendingWorkflow(runId, userId);
      return;
    }
    const action = jobAction(loaded.run, loaded.artifacts);
    const now = new Date().toISOString();
    if (action.type === "finish") {
      await saveAnalysisRun(terminalSuccess(loaded.run, now));
      return;
    }
    if (action.type === "insufficient") {
      await saveAnalysisRun(terminalInsufficient(loaded.run, action.count, now));
      return;
    }
    if (action.type !== "work") {
      await clearPendingWorkflow(runId, userId);
      return;
    }
    await enqueueAnalysis(
      { userId, runId, stage: action.stage },
      stageIdempotencyKey(runId, action.stage, loaded.run.attempts ?? 0),
    );
    log("info", "analyse.started", { run_id: runId, user_id: userId, stage: action.stage });
  } catch (error) {
    await clearPendingWorkflow(runId, userId).catch(() => undefined);
    await markRunFailed(runId, userId, START_FAILED).catch(() => undefined);
    log("error", "analyse.start_failed", { run_id: runId, user_id: userId, message: safeDbMessage(error) });
  }
}
