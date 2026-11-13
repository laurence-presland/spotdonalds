import { FatalError, getStepMetadata, getWorkflowMetadata, RetryableError } from "workflow";
import { markRunFailed } from "@/lib/analysis-run";
import { performStage } from "@/lib/analyse/execute";
import type { WorkStage } from "@/lib/analyse/machine";

const STEP_RETRIES = 2;

export async function analysisWorkflow(userId: string, runId: string) {
  "use workflow";
  if ((await ingestStep(userId, runId)) === "stop") return;
  if ((await enrichStep(userId, runId)) === "stop") return;
  if ((await profileStep(userId, runId)) === "stop") return;
  if ((await popularityStep(userId, runId)) === "stop") return;
  await orderStep(userId, runId);
}

async function ingestStep(userId: string, runId: string) {
  "use step";
  return runBound("ingest", userId, runId);
}
(ingestStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function enrichStep(userId: string, runId: string) {
  "use step";
  return runBound("enrich", userId, runId);
}
(enrichStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function profileStep(userId: string, runId: string) {
  "use step";
  return runBound("profile", userId, runId);
}
(profileStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function popularityStep(userId: string, runId: string) {
  "use step";
  return runBound("popularity", userId, runId);
}
(popularityStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function orderStep(userId: string, runId: string) {
  "use step";
  return runBound("order", userId, runId);
}
(orderStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function runBound(stage: WorkStage, userId: string, runId: string): Promise<"continue" | "stop"> {
  const step = getStepMetadata();
  const workflow = getWorkflowMetadata();
  try {
    const outcome = await performStage(stage, userId, runId, workflow.workflowRunId, step.attempt, step.maxAttempts);
    if (outcome === "retry") throw new RetryableError(`The ${stage} stage will be tried again`, { retryAfter: "15s" });
    return outcome;
  } catch (error) {
    if (RetryableError.is(error) || FatalError.is(error)) throw error;
    const message = error instanceof Error && error.message ? error.message : "The stage failed";
    if (step.attempt >= step.maxAttempts) {
      await markRunFailed(runId, userId, message).catch(() => undefined);
      throw new FatalError(message);
    }
    throw new RetryableError(message, { retryAfter: "15s" });
  }
}
