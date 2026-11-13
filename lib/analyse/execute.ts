import { assertWorker, loadRun, saveAnalysisRun } from "@/lib/analysis-run";
import { settleAttempt, type SettleResult } from "@/lib/analyse/job";
import { WorkerLost, type Artifacts, type WorkStage } from "@/lib/analyse/machine";
import { getSpotifyAccessToken, SpotifyTokenError } from "@/lib/auth/tokens";
import { tokenStore } from "@/lib/auth/token-store";
import { createDeezer } from "@/lib/enrich/deezer";
import { createRateLimiter, musicbrainzUserAgent } from "@/lib/enrich/limiter";
import { createMusicBrainz } from "@/lib/enrich/musicbrainz";
import { runEnrich } from "@/lib/enrich/run";
import { enrichStore } from "@/lib/enrich/store";
import { ingestStore } from "@/lib/ingest/store";
import { runIngest } from "@/lib/ingest/run";
import type { RunRecord } from "@/lib/ingest/types";
import { log } from "@/lib/log";
import { generateOrder, generatePopularity } from "@/lib/order/model";
import { runOrder, runPopularity } from "@/lib/order/run";
import { orderStore } from "@/lib/order/store";
import { generateProfile } from "@/lib/profile/model";
import { runTasteProfile } from "@/lib/profile/run";
import { profileStore } from "@/lib/profile/store";
import { createSpotifyClient } from "@/lib/spotify/client";

export async function performStage(
  stage: WorkStage,
  userId: string,
  runId: string,
  workflowRunId: string,
  attempt: number,
  maxAttempts: number,
): Promise<SettleResult["result"]> {
  const loaded = await loadContext(userId, runId);
  if (!loaded) return "stop";
  const outcome = await settleAttempt({
    ...loaded,
    requested: stage,
    attempt,
    maxAttempts,
    now: new Date().toISOString(),
    reload: () => loadContext(userId, runId),
    save: (run) => saveAnalysisRun(run),
    prepare: async () => assertWorker(runId, userId, workflowRunId),
    work: (nextStage, run) => runStage(nextStage, userId, run, workflowRunId),
  });
  if (outcome.result === "retry") {
    log("warn", "analyse.retry", { run_id: runId, user_id: userId, stage, attempt, message: outcome.message ?? null });
  } else if (outcome.reason === "failed") {
    log("error", "analyse.failed", { run_id: runId, user_id: userId, stage, message: outcome.message ?? null });
  } else if (outcome.reason === "finished") {
    log("info", "analyse.finished", { run_id: runId, user_id: userId, stage: "done" });
  }
  return outcome.result;
}

async function loadContext(userId: string, runId: string): Promise<{ run: RunRecord; artifacts: Artifacts } | null> {
  const run = await loadRun(runId, userId);
  if (!run) return null;
  const [profile, order] = await Promise.all([
    profileStore().getProfile(userId, run.id),
    orderStore().getOrder(userId, run.id),
  ]);
  return {
    run,
    artifacts: {
      profile: profile != null || run.checkpoint.profile === true,
      popularity: run.checkpoint.popularity === true,
      order: order != null,
    },
  };
}

async function runStage(stage: WorkStage, userId: string, run: RunRecord, workflowRunId: string): Promise<RunRecord> {
  const owned = await assertWorker(run.id, userId, workflowRunId);
  if (!owned) throw new WorkerLost();
  log("info", "analyse.stage", { run_id: run.id, user_id: userId, stage, status: "running" });
  try {
    if (stage === "ingest") await ingest(userId);
    else if (stage === "enrich") await enrich(userId);
    else if (stage === "profile") await runTasteProfile({ userId, store: profileStore(), complete: generateProfile, emit: () => undefined });
    else if (stage === "popularity") await runPopularity({ userId, store: orderStore(), complete: completeOrder, emit: () => undefined });
    else await runOrder({ userId, store: orderStore(), complete: completeOrder, emit: () => undefined });
  } catch (error) {
    if (error instanceof WorkerLost || error instanceof SpotifyTokenError) {
      if (error instanceof SpotifyTokenError) {
        const failed: RunRecord = { ...run, status: "error", stage, error: error.code, finished_at: null };
        await saveAnalysisRun(failed);
        return failed;
      }
      throw error;
    }
    const latest = await loadRun(run.id, userId);
    if (latest?.status === "error") return latest;
    throw error;
  }
  return (await loadRun(run.id, userId)) ?? run;
}

async function ingest(userId: string): Promise<void> {
  const token = await getSpotifyAccessToken(userId, { store: tokenStore(), now: Date.now, fetch });
  await runIngest({
    userId,
    client: createSpotifyClient(token),
    store: ingestStore(),
    emit: () => undefined,
  });
}

async function enrich(userId: string): Promise<void> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  await runEnrich({
    userId,
    store: enrichStore(),
    emit: () => undefined,
    musicbrainz: createMusicBrainz({
      fetch,
      sleep,
      userAgent: musicbrainzUserAgent(),
      wait: createRateLimiter(1000, { now: Date.now, sleep }),
    }),
    deezer: createDeezer({ fetch, sleep }),
  });
}

function completeOrder(call: { kind: "popularity" | "order"; system: string; prompt: string; itemIds?: string[]; tagIds?: string[] }) {
  if (call.kind === "popularity") return generatePopularity(call);
  return generateOrder({
    system: call.system,
    prompt: call.prompt,
    itemIds: call.itemIds ?? [],
    tagIds: call.tagIds ?? [],
  });
}
