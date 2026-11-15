import type { IngestCheckpoint, RunRecord, RunStage } from "@/lib/ingest/types";

export const WORKER_STALE_MS = 180_000;
export const MIN_RESULT_TRACKS = 50;
export const WORKER_STALE_SECONDS = WORKER_STALE_MS / 1000;

const TERMS = ["short_term", "medium_term", "long_term"] as const;

export const WORK_STAGES = ["ingest", "enrich", "profile", "popularity", "order"] as const;

export type WorkStage = (typeof WORK_STAGES)[number];

export type Artifacts = {
  profile: boolean;
  popularity: boolean;
  order: boolean;
};

export type JobAction =
  | { type: "work"; stage: WorkStage }
  | { type: "finish" }
  | { type: "insufficient"; count: number }
  | { type: "halt" };

export class WorkerLost extends Error {
  constructor() {
    super("Another worker owns this analysis");
    this.name = "WorkerLost";
  }
}

/** True when recently played and every top window have been ingested. */
export function ingestCheckpointDone(checkpoint: IngestCheckpoint): boolean {
  return Boolean(
    checkpoint.recently_played &&
      TERMS.every((term) => checkpoint.top_tracks?.[term]) &&
      TERMS.every((term) => checkpoint.top_artists?.[term]),
  );
}

/** True when a heartbeat is missing or older than the stale window. */
export function heartbeatExpired(at: string | null | undefined, now: number, staleMs = WORKER_STALE_MS): boolean {
  if (!at) return true;
  const parsed = Date.parse(at);
  return !Number.isFinite(parsed) || now - parsed > staleMs;
}

/** Decide the next job action from the run, checkpoint, and saved artifacts. */
export function jobAction(
  run: { status: string; stage: string; checkpoint: IngestCheckpoint; outcome?: string | null },
  artifacts: Artifacts,
): JobAction {
  if (run.outcome === "insufficient_data") return { type: "halt" };
  if (run.status === "error") return { type: "halt" };
  if (run.status === "complete" && run.stage === "done") return { type: "halt" };
  if (artifacts.order) return { type: "finish" };
  if (!ingestCheckpointDone(run.checkpoint)) return { type: "work", stage: "ingest" };
  const count = run.checkpoint.track_count;
  if (typeof count === "number" && count < MIN_RESULT_TRACKS) return { type: "insufficient", count };
  if (!run.checkpoint.enrich) return { type: "work", stage: "enrich" };
  if (!artifacts.profile && !run.checkpoint.profile) return { type: "work", stage: "profile" };
  if (!artifacts.popularity && !run.checkpoint.popularity) return { type: "work", stage: "popularity" };
  return { type: "work", stage: "order" };
}

/** Mark the run complete and ready. */
export function terminalSuccess(run: RunRecord, now: string): RunRecord {
  return {
    ...run,
    status: "complete",
    stage: "done",
    error: null,
    outcome: run.outcome === "insufficient_data" ? "insufficient_data" : "ready",
    finished_at: now,
    open: false,
  };
}

/** Mark the run complete with too few tracks to continue. */
export function terminalInsufficient(run: RunRecord, count: number, now: string): RunRecord {
  return {
    ...run,
    status: "complete",
    stage: "done",
    error: null,
    outcome: "insufficient_data",
    finished_at: now,
    open: false,
    checkpoint: { ...run.checkpoint, track_count: count },
  };
}

/** Mark the run failed with an error message. */
export function terminalFailure(run: RunRecord, message: string, now: string): RunRecord {
  return {
    ...run,
    status: "error",
    error: message.slice(0, 500),
    finished_at: now,
    open: false,
    attempts: (run.attempts ?? 0) + 1,
  };
}

/** True when a running run's worker heartbeat has gone stale. */
export function isDeadWorker(
  run: { status: string; stage: string; heartbeat_at?: string | null; started_at?: string | null },
  now: number,
): boolean {
  if (run.status !== "running" || run.stage === "done") return false;
  if (run.heartbeat_at) return heartbeatExpired(run.heartbeat_at, now);
  return heartbeatExpired(run.started_at, now);
}

/** True when a run needs a worker and none is alive. */
export function shouldStartWorker(
  run: { status: string; stage: string; workflow_id?: string | null; heartbeat_at?: string | null; started_at?: string | null },
  now: number,
): boolean {
  if (run.status !== "running" || run.stage === "done") return false;
  if (!run.workflow_id) return true;
  return isDeadWorker(run, now);
}

/** True when this workflow id still owns the run and the lease is fresh. */
export function ownsRun(
  workflowId: string | null | undefined,
  mine: string,
  heartbeatAt: string | null | undefined,
  now: number,
): boolean {
  if (!workflowId || workflowId === "pending" || workflowId === mine) return true;
  return heartbeatExpired(heartbeatAt, now);
}

/** User-facing message for a worker that stopped mid-stage. */
export function deadWorkerMessage(stage: string): string {
  return `The worker stopped during ${stage}. Try again to resume from this stage.`;
}

/** Plan whether this workflow should run, skip, or stop a step. */
export function planStep(input: {
  run: RunRecord;
  artifacts: Artifacts;
  requested: WorkStage | "any";
  now: string;
}): { kind: "stop"; run: RunRecord } | { kind: "skip" } | { kind: "work"; stage: WorkStage; run: RunRecord } {
  const action = jobAction(input.run, input.artifacts);
  if (action.type === "halt") return { kind: "stop", run: input.run };
  if (action.type === "insufficient") return { kind: "stop", run: terminalInsufficient(input.run, action.count, input.now) };
  if (action.type === "finish") return { kind: "stop", run: terminalSuccess(input.run, input.now) };
  if (input.requested !== "any" && input.requested !== action.stage) return { kind: "skip" };
  return { kind: "work", stage: action.stage, run: input.run };
}

/** Numeric order of a pipeline stage. */
export function stageIndex(stage: RunStage): number {
  if (stage === "done") return WORK_STAGES.length;
  return WORK_STAGES.indexOf(stage as WorkStage);
}
