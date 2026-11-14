import { FatalError, getStepMetadata, getWorkflowMetadata, RetryableError } from "workflow";
import { executeFlowStep } from "@/lib/analyse/flow-live";
import type { FlowStep } from "@/lib/analyse/flow";

const STEP_RETRIES = 2;

export async function analysisWorkflow(userId: string, runId: string) {
  "use workflow";
  if ((await ingestStep(userId, runId)) !== "continue") return;
  await analyseStep(userId, runId);
}

async function ingestStep(userId: string, runId: string) {
  "use step";
  return bound(userId, runId, "ingest");
}
(ingestStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

async function analyseStep(userId: string, runId: string) {
  "use step";
  return bound(userId, runId, "analyse");
}
(analyseStep as { maxRetries?: number }).maxRetries = STEP_RETRIES;

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
