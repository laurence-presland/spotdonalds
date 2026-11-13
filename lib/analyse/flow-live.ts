import { assertWorker, markRunFailed, saveAnalysisRun } from "@/lib/analysis-run";
import { loadAnalysisContext, runLiveWork } from "@/lib/analyse/execute";
import { ensureTracks, finishFlow, runStageStep, runTrackedStep, type FlowDeps, type FlowStep, type Tracked } from "@/lib/analyse/flow";
import { countDistinctTracks } from "@/lib/analyse/tracks";

export async function executeFlowStep(input: {
  userId: string;
  runId: string;
  workflowRunId: string;
  attempt: number;
  maxAttempts: number;
  step: FlowStep;
}): Promise<Tracked> {
  const owned = await assertWorker(input.runId, input.userId, input.workflowRunId);
  if (!owned) return { type: "lost", message: "Another worker owns this analysis" };
  const deps = liveDeps(input.runId);
  return runTrackedStep(deps, {
    userId: input.userId,
    runId: input.runId,
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    step: input.step,
    work: () => dispatch(deps, input.step, input.userId, input.runId),
  });
}

function dispatch(deps: FlowDeps, step: FlowStep, userId: string, runId: string) {
  if (step === "tracks") return ensureTracks(deps, userId, runId);
  if (step === "finish") return finishFlow(deps, userId, runId);
  return runStageStep(deps, userId, runId, step);
}

function liveDeps(runId: string): FlowDeps {
  return {
    now: () => new Date().toISOString(),
    load: (userId, id) => loadAnalysisContext(userId, id),
    save: (run) => saveAnalysisRun(run),
    countTracks: (userId) => countDistinctTracks(userId),
    ingest: (userId) => runLiveWork("ingest", userId, runId),
    enrich: (userId) => runLiveWork("enrich", userId, runId),
    profile: (userId) => runLiveWork("profile", userId, runId),
    popularity: (userId) => runLiveWork("popularity", userId, runId),
    order: (userId) => runLiveWork("order", userId, runId),
    fail: async (userId, id, message) => {
      await markRunFailed(id, userId, message);
    },
  };
}
