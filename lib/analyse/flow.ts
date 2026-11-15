import {
  ingestCheckpointDone,
  MIN_RESULT_TRACKS,
  terminalInsufficient,
  terminalSuccess,
  WorkerLost,
  type Artifacts,
} from "@/lib/analyse/machine";
import type { RunRecord, RunStage } from "@/lib/ingest/types";
import { log } from "@/lib/log";

export type FlowDeps = {
  now: () => string;
  load: (userId: string, runId: string) => Promise<{ run: RunRecord; artifacts: Artifacts } | null>;
  save: (run: RunRecord) => Promise<void>;
  countTracks: (userId: string) => Promise<number>;
  ingest: (userId: string) => Promise<void>;
  enrich: (userId: string) => Promise<void>;
  profile: (userId: string) => Promise<void>;
  popularity: (userId: string) => Promise<void>;
  order: (userId: string) => Promise<void>;
  fail: (userId: string, runId: string, message: string) => Promise<void>;
};

export type FlowStep = "ingest" | "analyse";

export type StepResult = "continue" | "stop";

export type Tracked =
  | { type: "continue" }
  | { type: "stop" }
  | { type: "retry"; message: string }
  | { type: "failed"; message: string }
  | { type: "lost"; message: string };

type StageStep = "enrich" | "profile" | "popularity" | "order";

/** Run ingest, then analysis, then finish, stopping if a step says so. */
export async function runUserFlow(deps: FlowDeps, userId: string, runId: string): Promise<void> {
  if ((await ensureTracks(deps, userId, runId)) === "stop") return;
  await runAnalyseStep(deps, userId, runId);
}

/** Make sure ingest has finished, then check there are enough tracks. */
export async function ensureTracks(deps: FlowDeps, userId: string, runId: string): Promise<StepResult> {
  const loaded = await deps.load(userId, runId);
  if (!loaded || halted(loaded.run)) return "stop";
  await deps.save(running(loaded.run, "ingest"));
  const count = await deps.countTracks(userId);
  if (count >= MIN_RESULT_TRACKS) {
    await rememberCount(deps, userId, runId, count);
    log("info", "analyse.step", { run_id: runId, user_id: userId, step: "ingest", skipped: true, track_count: count });
    return "continue";
  }

  const current = await deps.load(userId, runId);
  if (!current || halted(current.run)) return "stop";
  if (!ingestCheckpointDone(current.run.checkpoint)) {
    log("info", "analyse.step", { run_id: runId, user_id: userId, step: "ingest", skipped: false, track_count: count });
    await deps.ingest(userId);
  } else {
    log("info", "analyse.step", { run_id: runId, user_id: userId, step: "ingest", skipped: true, track_count: count });
  }

  const after = await deps.countTracks(userId);
  const latest = await deps.load(userId, runId);
  if (!latest || halted(latest.run)) return "stop";
  if (after < MIN_RESULT_TRACKS) {
    await deps.save(terminalInsufficient(latest.run, after, deps.now()));
    log("info", "analyse.finished", { run_id: runId, user_id: userId, outcome: "insufficient_data", track_count: after });
    return "stop";
  }
  await rememberCount(deps, userId, runId, after);
  return "continue";
}

/** Run enrich, profile, popularity, and order, skipping work already done. */
export async function runAnalyseStep(deps: FlowDeps, userId: string, runId: string): Promise<StepResult> {
  const loaded = await deps.load(userId, runId);
  if (!loaded || halted(loaded.run)) return "stop";
  await deps.save(running(loaded.run, "analyse"));
  for (const piece of ["enrich", "profile", "popularity", "order"] as const) {
    const current = await deps.load(userId, runId);
    if (!current || halted(current.run)) return "stop";
    const skipped = stageDone(current, piece);
    log("info", "analyse.step", { run_id: runId, user_id: userId, step: "analyse", piece, skipped });
    if (skipped) continue;
    if (piece === "enrich") await deps.enrich(userId);
    else if (piece === "profile") await deps.profile(userId);
    else if (piece === "popularity") await deps.popularity(userId);
    else await deps.order(userId);
    const after = await deps.load(userId, runId);
    if (!after || halted(after.run)) return "stop";
  }
  return finishFlow(deps, userId, runId);
}

/** Mark the run successfully complete. */
export async function finishFlow(deps: FlowDeps, userId: string, runId: string): Promise<StepResult> {
  const loaded = await deps.load(userId, runId);
  if (!loaded || halted(loaded.run)) return "stop";
  const finished = terminalSuccess(loaded.run, deps.now());
  await deps.save(finished);
  log("info", "analyse.finished", { run_id: runId, user_id: userId, outcome: finished.outcome ?? "ready" });
  return "stop";
}

/** Run a step, record progress, and decide whether to continue, stop, or retry. */
export async function runTrackedStep(
  deps: FlowDeps,
  input: { userId: string; runId: string; attempt: number; maxAttempts: number; step: FlowStep; work: () => Promise<StepResult> },
): Promise<Tracked> {
  try {
    const result = await input.work();
    return { type: result };
  } catch (error) {
    if (error instanceof WorkerLost) {
      log("warn", "analyse.lost", { run_id: input.runId, user_id: input.userId, step: input.step });
      return { type: "lost", message: error.message };
    }
    const message = (error instanceof Error && error.message ? error.message : "The stage failed").slice(0, 500);
    const final = (error instanceof Error && error.name === "SpotifyTokenError") || input.attempt >= input.maxAttempts;
    if (!final) {
      log("warn", "analyse.retry", { run_id: input.runId, user_id: input.userId, step: input.step, attempt: input.attempt, message });
      return { type: "retry", message };
    }
    log("error", "analyse.step_failed", {
      run_id: input.runId,
      user_id: input.userId,
      step: input.step,
      attempt: input.attempt,
      message,
    });
    await deps.fail(input.userId, input.runId, message);
    return { type: "failed", message };
  }
}

/** True when the run has already stopped with an error or a final outcome. */
function halted(run: RunRecord): boolean {
  if (run.status === "error" || run.outcome === "insufficient_data") return true;
  return run.status === "complete" && run.stage === "done";
}

/** Return a copy of the run marked running at this stage. */
function running(run: RunRecord, stage: RunStage): RunRecord {
  return { ...run, status: "running", stage, error: null, finished_at: null, open: true };
}

/** True when this stage's work is already saved on the run. */
function stageDone(loaded: { run: RunRecord; artifacts: Artifacts }, stage: StageStep): boolean {
  if (stage === "enrich") return loaded.run.checkpoint.enrich === true;
  if (stage === "profile") return loaded.artifacts.profile;
  if (stage === "popularity") return loaded.artifacts.popularity || loaded.run.checkpoint.popularity === true;
  return loaded.artifacts.order;
}

/** Store the distinct track count on the run checkpoint. */
async function rememberCount(deps: FlowDeps, userId: string, runId: string, count: number): Promise<void> {
  const loaded = await deps.load(userId, runId);
  if (!loaded || halted(loaded.run)) return;
  await deps.save({
    ...running(loaded.run, "ingest"),
    checkpoint: { ...loaded.run.checkpoint, track_count: count },
  });
}
