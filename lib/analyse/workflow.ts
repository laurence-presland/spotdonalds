import { FatalError, getStepMetadata, getWorkflowMetadata, RetryableError } from "workflow";
import { executeFlowStep } from "@/lib/analyse/flow-live";
import type { FlowStep } from "@/lib/analyse/flow";

const STEP_RETRIES = 2;

export async function analysisWorkflow(userId: string, runId: string) {
  "use workflow";
  if ((await tracksStep(userId, runId)) !== "continue") return;
  if ((await enrichStep(userId, runId)) !== "continue") return;
  if ((await profileStep(userId, runId)) !== "continue") return;
  if ((await popularityStep(userId, runId)) !== "continue") return;
  if ((await orderStep(userId, runId)) !== "continue") return;
  await finishStep(userId, runId);
}

async function tracksStep(userId: string, runId: string) {
  "use step";
  return bound(userId, runId, "tracks");
}
(tracksStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function enrichStep(userId: string, runId: string) {
  "use step";
  return bound(userId, runId, "enrich");
}
(enrichStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function profileStep(userId: string, runId: string) {
  "use step";
  return bound(userId, runId, "profile");
}
(profileStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function popularityStep(userId: string, runId: string) {
  "use step";
  return bound(userId, runId, "popularity");
}
(popularityStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function orderStep(userId: string, runId: string) {
  "use step";
  return bound(userId, runId, "order");
}
(orderStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function finishStep(userId: string, runId: string) {
  "use step";
  return bound(userId, runId, "finish");
}
(finishStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function bound(userId: string, runId: string, step: FlowStep): Promise<"continue" | "stop"> {
  const stepMeta = getStepMetadata();
  const workflow = getWorkflowMetadata();
  const outcome = await executeFlowStep({
    userId,
    runId,
    workflowRunId: workflow.workflowRunId,
    attempt: stepMeta.attempt,
    maxAttempts: stepMeta.maxAttempts,
    step,
  });
  if (outcome.type === "retry") throw new RetryableError(outcome.message, { retryAfter: "15s" });
  if (outcome.type === "failed" || outcome.type === "lost") throw new FatalError(outcome.message);
  return outcome.type;
}
