import { FatalError, getWorkflowMetadata } from "workflow";
import { ANALYSIS_STOPPED } from "@/lib/analyse/fail-run";
import { assertWorker, markOwnedRunFailed, markRunFailed } from "@/lib/analysis-run";
import { SpotifyTokenError } from "@/lib/auth/tokens";
import { enrichUserTracks } from "@/lib/enrich/tracks";
import { pullSpotifyCatalogue } from "@/lib/ingest/catalogue";
import { generateUserOrder } from "@/lib/order/generate";
import { analyseTaste } from "@/lib/profile/analyse";

const STEP_RETRIES = 2;

/** Durable workflow: ingest, enrich, analyse, generate, and fail the run if a step dies. */
export async function analysisWorkflow(userId: string, runId: string) {
  "use workflow";
  try {
    if ((await ingestSpotifyData(userId, runId)) === "stop") return;
    await enrichTracks(userId, runId);
    await analyse(userId, runId);
    await generate(userId, runId);
  } catch (error) {
    await failRun(userId, runId);
    throw error;
  }
}

/** Fetch Spotify listening when the stored catalogue is still short. */
async function ingestSpotifyData(userId: string, runId: string) {
  "use step";
  await own(userId, runId);
  try {
    return await pullSpotifyCatalogue(userId, runId);
  } catch (error) {
    if (!spotifyAuthFailure(error)) throw error;
    await markRunFailed(runId, userId, error.message);
    throw new FatalError(error.message);
  }
}
(ingestSpotifyData as { maxRetries?: number }).maxRetries = STEP_RETRIES;

/** Add tags and tempo for the stored tracks. */
async function enrichTracks(userId: string, runId: string) {
  "use step";
  await own(userId, runId);
  await enrichUserTracks(userId);
}
(enrichTracks as { maxRetries?: number }).maxRetries = STEP_RETRIES;

/** Build the taste profile. */
async function analyse(userId: string, runId: string) {
  "use step";
  await own(userId, runId);
  await analyseTaste(userId);
}
(analyse as { maxRetries?: number }).maxRetries = STEP_RETRIES;

/** Build the menu order. */
async function generate(userId: string, runId: string) {
  "use step";
  await own(userId, runId);
  await generateUserOrder(userId);
}
(generate as { maxRetries?: number }).maxRetries = STEP_RETRIES;

/** Mark the run failed when this workflow still owns it. */
async function failRun(userId: string, runId: string) {
  "use step";
  const workflow = getWorkflowMetadata();
  await markOwnedRunFailed(runId, userId, workflow.workflowRunId, ANALYSIS_STOPPED);
}
(failRun as { maxRetries?: number }).maxRetries = STEP_RETRIES;

/** Stop the step when another workflow has taken the run. */
async function own(userId: string, runId: string) {
  const workflow = getWorkflowMetadata();
  const owned = await assertWorker(runId, userId, workflow.workflowRunId);
  if (!owned) throw new FatalError("Another worker owns this analysis");
}

/** True when Spotify needs the person to sign in again. */
function spotifyAuthFailure(error: unknown): error is Error {
  return error instanceof SpotifyTokenError || (error instanceof Error && error.name === "SpotifyTokenError");
}
