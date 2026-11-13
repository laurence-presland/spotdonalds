import { send } from "@vercel/queue";
import {
  ingestCheckpointDone,
  isDeadWorker,
  jobAction,
  terminalInsufficient,
  terminalSuccess,
  WORKER_STALE_MS,
  type Artifacts,
  type JobAction,
  type WorkStage,
} from "@/lib/analyse/machine";
import type { RunRecord } from "@/lib/ingest/types";

export const ANALYSIS_TOPIC = "analysis";
export const QUEUE_MAX_DELIVERIES = 3;

export type AnalysisMessage = {
  userId: string;
  runId: string;
  stage: WorkStage;
};

export type StaleDecision = "alive" | "recover" | "wait" | "close";

type Sender = (
  topic: string,
  message: AnalysisMessage,
  options: { idempotencyKey: string },
) => Promise<{ messageId: string | null }>;

let sender: Sender | null = null;

export function setAnalysisSender(next: Sender | null): void {
  sender = next;
}

export function stageIdempotencyKey(runId: string, stage: string, attempts: number): string {
  return `${runId}:${stage}:${attempts}`;
}

export function recoveryIdempotencyKey(
  runId: string,
  stage: string,
  attempts: number,
  heartbeat: string | null,
): string {
  return `${runId}:${stage}:${attempts}:recover:${heartbeat ?? "none"}`;
}

export function staleDecision(
  run: {
    status: string;
    stage: string;
    heartbeat_at?: string | null;
    started_at?: string | null;
    checkpoint: { recovery_at?: string };
  },
  now: number,
): StaleDecision {
  if (!isDeadWorker(run, now)) return "alive";
  const recoveryAt = run.checkpoint.recovery_at;
  if (!recoveryAt) return "recover";
  const parsed = Date.parse(recoveryAt);
  if (!Number.isFinite(parsed)) return "recover";
  if (now - parsed >= WORKER_STALE_MS) return "close";
  return "wait";
}

export function deliveryDecision(
  result: "continue" | "stop" | "retry",
  deliveryCount: number,
  maxDeliveries = QUEUE_MAX_DELIVERIES,
): "ack" | "retry" | "fail" {
  if (result !== "retry") return "ack";
  return deliveryCount >= maxDeliveries ? "fail" : "retry";
}

export function followUp(action: JobAction): "enqueue" | "seal" | "finish" | "ack" {
  if (action.type === "work") return "enqueue";
  if (action.type === "insufficient") return "seal";
  if (action.type === "finish") return "finish";
  return "ack";
}

export async function enqueueAnalysis(message: AnalysisMessage, idempotencyKey: string): Promise<{ messageId: string | null }> {
  const publish = sender ?? send;
  const published = await publish(ANALYSIS_TOPIC, message, { idempotencyKey });
  return { messageId: published.messageId };
}

export async function handleAnalysisDelivery(input: {
  message: AnalysisMessage;
  messageId: string;
  deliveryCount: number;
  perform: (
    stage: WorkStage,
    userId: string,
    runId: string,
    messageId: string,
    attempt: number,
    maxAttempts: number,
  ) => Promise<"continue" | "stop" | "retry">;
  load: (userId: string, runId: string) => Promise<{ run: RunRecord; artifacts: Artifacts } | null>;
  enqueue: (message: AnalysisMessage, idempotencyKey: string) => Promise<void>;
  save: (run: RunRecord) => Promise<void>;
  fail: (runId: string, userId: string, message: string) => Promise<void>;
  countTracks?: (userId: string) => Promise<number>;
  now?: string;
}): Promise<void> {
  const { message } = input;
  let result: "continue" | "stop" | "retry";
  try {
    result = await input.perform(
      message.stage,
      message.userId,
      message.runId,
      input.messageId,
      input.deliveryCount,
      QUEUE_MAX_DELIVERIES,
    );
  } catch (error) {
    const text = error instanceof Error && error.message ? error.message : "The stage failed";
    if (input.deliveryCount >= QUEUE_MAX_DELIVERIES) {
      await input.fail(message.runId, message.userId, text);
      return;
    }
    throw error;
  }

  const decision = deliveryDecision(result, input.deliveryCount);
  if (decision === "fail") {
    await input.fail(message.runId, message.userId, "The stage failed after retries.");
    return;
  }
  if (decision === "retry") throw new Error("The stage will be retried");
  if (result !== "continue") return;

  let loaded = await input.load(message.userId, message.runId);
  if (!loaded || loaded.run.status === "error" || loaded.run.outcome === "insufficient_data") return;
  if (loaded.run.status === "complete" && loaded.run.stage === "done") return;
  let countedNow = false;
  if (
    input.countTracks &&
    ingestCheckpointDone(loaded.run.checkpoint) &&
    typeof loaded.run.checkpoint.track_count !== "number"
  ) {
    const count = await input.countTracks(loaded.run.user_id);
    countedNow = true;
    loaded = { ...loaded, run: { ...loaded.run, checkpoint: { ...loaded.run.checkpoint, track_count: count } } };
  }

  const action = jobAction(loaded.run, loaded.artifacts);
  const next = followUp(action);
  const now = input.now ?? new Date().toISOString();
  if (next === "seal" && action.type === "insufficient") {
    await input.save(terminalInsufficient(loaded.run, action.count, now));
    return;
  }
  if (next === "finish") {
    await input.save(terminalSuccess(loaded.run, now));
    return;
  }
  if (next === "enqueue" && action.type === "work") {
    if (countedNow) await input.save({ ...loaded.run, status: "running", open: true });
    await input.enqueue(
      { userId: message.userId, runId: message.runId, stage: action.stage },
      stageIdempotencyKey(message.runId, action.stage, loaded.run.attempts ?? 0),
    );
  }
}
