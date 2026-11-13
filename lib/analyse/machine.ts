import type { IngestCheckpoint, RunRecord, RunStage } from "@/lib/ingest/types";

export const WORKER_STALE_MS = 180_000;
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
  | { type: "halt" };

export class WorkerLost extends Error {
  constructor() {
    super("Another worker owns this analysis");
    this.name = "WorkerLost";
  }
}

export function ingestCheckpointDone(checkpoint: IngestCheckpoint): boolean {
  return Boolean(
    checkpoint.recently_played &&
      TERMS.every((term) => checkpoint.top_tracks?.[term]) &&
      TERMS.every((term) => checkpoint.top_artists?.[term]),
  );
}

export function heartbeatExpired(at: string | null | undefined, now: number, staleMs = WORKER_STALE_MS): boolean {
  if (!at) return true;
  const parsed = Date.parse(at);
  return !Number.isFinite(parsed) || now - parsed > staleMs;
}

export function jobAction(
  run: { status: string; stage: string; checkpoint: IngestCheckpoint },
  artifacts: Artifacts,
): JobAction {
  if (run.status === "error") return { type: "halt" };
  if (run.status === "complete" && run.stage === "done") return { type: "halt" };
  if (artifacts.order) return { type: "finish" };
  if (!ingestCheckpointDone(run.checkpoint)) return { type: "work", stage: "ingest" };
  if (!run.checkpoint.enrich) return { type: "work", stage: "enrich" };
  if (!artifacts.profile && !run.checkpoint.profile) return { type: "work", stage: "profile" };
  if (!artifacts.popularity && !run.checkpoint.popularity) return { type: "work", stage: "popularity" };
  return { type: "work", stage: "order" };
}

export function terminalSuccess(run: RunRecord, now: string): RunRecord {
  return {
    ...run,
    status: "complete",
    stage: "done",
    error: null,
    finished_at: now,
    open: false,
  };
}

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

export function isDeadWorker(
  run: { status: string; stage: string; heartbeat_at?: string | null; started_at?: string | null },
  now: number,
): boolean {
  if (run.status !== "running" || run.stage === "done") return false;
  if (run.heartbeat_at) return heartbeatExpired(run.heartbeat_at, now);
  return heartbeatExpired(run.started_at, now);
}

export function shouldStartWorker(
  run: { status: string; stage: string; workflow_id?: string | null; heartbeat_at?: string | null; started_at?: string | null },
  now: number,
): boolean {
  if (run.status !== "running" || run.stage === "done") return false;
  if (!run.workflow_id) return true;
  return isDeadWorker(run, now);
}

export function ownsRun(
  workflowId: string | null | undefined,
  mine: string,
  heartbeatAt: string | null | undefined,
  now: number,
): boolean {
  if (!workflowId || workflowId === "pending" || workflowId === mine) return true;
  return heartbeatExpired(heartbeatAt, now);
}

export function deadWorkerMessage(stage: string): string {
  return `The worker stopped during ${stage}. Try again to resume from this stage.`;
}

export function planStep(input: {
  run: RunRecord;
  artifacts: Artifacts;
  requested: WorkStage | "any";
  now: string;
}): { kind: "stop"; run: RunRecord } | { kind: "skip" } | { kind: "work"; stage: WorkStage; run: RunRecord } {
  const action = jobAction(input.run, input.artifacts);
  if (action.type === "halt") return { kind: "stop", run: input.run };
  if (action.type === "finish") return { kind: "stop", run: terminalSuccess(input.run, input.now) };
  if (input.requested !== "any" && input.requested !== action.stage) return { kind: "skip" };
  return { kind: "work", stage: action.stage, run: input.run };
}

export function stageIndex(stage: RunStage): number {
  if (stage === "done") return WORK_STAGES.length;
  return WORK_STAGES.indexOf(stage as WorkStage);
}
