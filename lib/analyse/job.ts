import {
  WorkerLost,
  planStep,
  terminalFailure,
  terminalSuccess,
  type Artifacts,
  type WorkStage,
} from "@/lib/analyse/machine";
import type { RunRecord } from "@/lib/ingest/types";

export type SettleResult = {
  result: "continue" | "stop" | "retry";
  reason: "finished" | "failed" | "idle" | "lost";
  message?: string;
};

/** Decide whether this attempt should continue, stop, or retry. */
export async function settleAttempt(input: {
  run: RunRecord;
  artifacts: Artifacts;
  requested: WorkStage | "any";
  attempt: number;
  maxAttempts: number;
  now: string;
  reload: () => Promise<{ run: RunRecord; artifacts: Artifacts } | null>;
  save: (run: RunRecord) => Promise<void>;
  prepare?: (stage: WorkStage) => Promise<boolean>;
  work: (stage: WorkStage, run: RunRecord) => Promise<RunRecord>;
}): Promise<SettleResult> {
  if (input.run.status === "error") return sealFailure(input, input.run);
  if (input.run.status === "complete" && input.run.stage === "done") return { result: "stop", reason: "finished" };

  const plan = planStep({
    run: input.run,
    artifacts: input.artifacts,
    requested: input.requested,
    now: input.now,
  });
  if (plan.kind === "stop") {
    if (plan.run.status === "complete" && plan.run.stage === "done" && !sameTerminal(input.run, plan.run)) {
      await input.save(plan.run);
    }
    return { result: "stop", reason: plan.run.stage === "done" && plan.run.status === "complete" ? "finished" : "idle" };
  }
  if (plan.kind === "skip") return { result: "continue", reason: "idle" };

  if (input.prepare && !(await input.prepare(plan.stage))) return { result: "stop", reason: "lost" };

  const staged: RunRecord = {
    ...plan.run,
    stage: plan.stage,
    status: "running",
    error: null,
    finished_at: null,
    open: true,
  };
  await input.save(staged);

  try {
    const next = await input.work(plan.stage, staged);
    if (next.status === "error") return sealFailure(input, { ...next, stage: plan.stage });
    if (next.stage === "done" && next.status === "complete") {
      await input.save(terminalSuccess(next, input.now));
      return { result: "stop", reason: "finished" };
    }
    const running: RunRecord = next.status === "running" && next.finished_at == null
      ? { ...next, open: true }
      : { ...next, status: "running", finished_at: null, error: null, open: true };
    await input.save(running);
    return { result: "continue", reason: "idle" };
  } catch (error) {
    if (error instanceof WorkerLost) return { result: "stop", reason: "lost" };
    const message = error instanceof Error && error.message ? error.message : "The stage failed";
    if (input.attempt < input.maxAttempts) return { result: "retry", reason: "failed", message };
    const latest = await input.reload();
    const failed = terminalFailure({ ...(latest?.run ?? staged), stage: plan.stage }, message, input.now);
    await input.save(failed);
    return { result: "stop", reason: "failed", message };
  }
}

/** Persist a terminal failure, unless the run is already in that state. */
async function sealFailure(
  input: { now: string; save: (run: RunRecord) => Promise<void> },
  run: RunRecord,
): Promise<SettleResult> {
  if (run.finished_at && run.open === false) {
    return { result: "stop", reason: "failed", message: run.error ?? undefined };
  }
  const failed = terminalFailure(run, run.error || "The stage failed", input.now);
  await input.save(failed);
  return { result: "stop", reason: "failed", message: failed.error ?? undefined };
}

/** True when two records already share the same terminal status and error. */
function sameTerminal(current: RunRecord, next: RunRecord): boolean {
  return (
    current.status === next.status &&
    current.stage === next.stage &&
    current.finished_at === next.finished_at &&
    current.open === next.open &&
    current.outcome === next.outcome
  );
}
