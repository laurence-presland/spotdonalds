import { loadRun } from "@/lib/analysis-run";
import type { Artifacts, WorkStage } from "@/lib/analyse/machine";
import { getSpotifyAccessToken } from "@/lib/auth/tokens";
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

/** Load the run and its saved artifacts, if this worker still owns it. */
export async function loadAnalysisContext(userId: string, runId: string): Promise<{ run: RunRecord; artifacts: Artifacts } | null> {
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

/** Run one live pipeline stage: ingest, enrich, profile, popularity, or order. */
export async function runLiveWork(
  stage: WorkStage,
  userId: string,
  runId: string,
  options?: { stayRunning?: boolean },
): Promise<void> {
  log("info", "analyse.stage", { run_id: runId, user_id: userId, stage: stage === "ingest" ? "ingest" : "analyse", status: "running" });
  if (stage === "ingest") await ingest(userId, options?.stayRunning === true);
  else if (stage === "enrich") await enrich(userId);
  else if (stage === "profile") await runTasteProfile({ userId, store: profileStore(), complete: generateProfile, emit: () => undefined });
  else if (stage === "popularity") await runPopularity({ userId, store: orderStore(), complete: completeOrder, emit: () => undefined });
  else await runOrder({ userId, store: orderStore(), complete: completeOrder, emit: () => undefined });
}

/** Run ingest and leave the run running if later stages will follow. */
async function ingest(userId: string, stayRunning: boolean): Promise<void> {
  const token = await getSpotifyAccessToken(userId, { store: tokenStore(), now: Date.now, fetch });
  await runIngest({
    userId,
    client: createSpotifyClient(token),
    store: ingestStore(),
    emit: () => undefined,
    stayRunning,
  });
}

/** Run enrichment, pacing MusicBrainz to one request a second. */
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

/** Complete a popularity or order model call through the live order runner. */
function completeOrder(call: { kind: "popularity" | "order"; system: string; prompt: string; itemIds?: string[]; tagIds?: string[] }) {
  if (call.kind === "popularity") return generatePopularity(call);
  return generateOrder({
    system: call.system,
    prompt: call.prompt,
    itemIds: call.itemIds ?? [],
    tagIds: call.tagIds ?? [],
  });
}
