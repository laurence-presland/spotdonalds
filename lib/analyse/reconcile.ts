import { loadAnalysisContext } from "@/lib/analyse/execute";
import { deadWorkerMessage, ingestCheckpointDone, jobAction, terminalInsufficient, terminalSuccess } from "@/lib/analyse/machine";
import { countDistinctTracks } from "@/lib/analyse/tracks";
import { enqueueAnalysis, recoveryIdempotencyKey, staleDecision } from "@/lib/analyse/queue";
import { markRunFailed, noteRecovery, saveAnalysisRun } from "@/lib/analysis-run";
import { safeDbMessage } from "@/lib/db";
import type { RunRecord } from "@/lib/ingest/types";
import { log } from "@/lib/log";

export async function reviveOrClose(run: RunRecord | null, now = Date.now()): Promise<RunRecord | null> {
  if (!run) return null;
  const decision = staleDecision(run, now);
  if (decision === "alive" || decision === "wait") return run;
  if (decision === "close") {
    log("warn", "analyse.stale", { run_id: run.id, user_id: run.user_id, stage: run.stage });
    return (await markRunFailed(run.id, run.user_id, deadWorkerMessage(run.stage))) ?? run;
  }

  try {
    const loaded = await loadAnalysisContext(run.user_id, run.id);
    let current = loaded?.run ?? run;
    if (ingestCheckpointDone(current.checkpoint) && typeof current.checkpoint.track_count !== "number") {
      const count = await countDistinctTracks(current.user_id);
      current = { ...current, checkpoint: { ...current.checkpoint, track_count: count } };
    }
    const artifacts = loaded?.artifacts ?? {
      profile: Boolean(current.checkpoint.profile),
      popularity: Boolean(current.checkpoint.popularity),
      order: false,
    };
    const action = jobAction(current, artifacts);
    const at = new Date(now).toISOString();
    if (action.type === "finish") {
      const finished = terminalSuccess(current, at);
      await saveAnalysisRun(finished);
      return finished;
    }
    if (action.type === "insufficient") {
      const finished = terminalInsufficient(current, action.count, at);
      await saveAnalysisRun(finished);
      return finished;
    }
    if (action.type !== "work") return current;
    await enqueueAnalysis(
      { userId: current.user_id, runId: current.id, stage: action.stage },
      recoveryIdempotencyKey(current.id, action.stage, current.attempts ?? 0, current.heartbeat_at ?? current.started_at ?? null),
    );
    await noteRecovery(current.id, current.user_id, at);
    log("info", "analyse.recover", { run_id: current.id, user_id: current.user_id, stage: action.stage });
    return { ...current, checkpoint: { ...current.checkpoint, recovery_at: at } };
  } catch (error) {
    log("error", "analyse.recover_failed", { run_id: run.id, user_id: run.user_id, message: safeDbMessage(error) });
    return (await markRunFailed(run.id, run.user_id, deadWorkerMessage(run.stage))) ?? run;
  }
}

export async function reconcileStaleRun(run: RunRecord | null, now = Date.now()): Promise<RunRecord | null> {
  return reviveOrClose(run, now);
}
