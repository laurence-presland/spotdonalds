import { randomUUID } from "node:crypto";
import { acquireLease, loadLatestRun, releaseLease, touchLease } from "@/lib/analysis-run";
import { LeaseLost, withLease } from "@/lib/analyse/lease";
import { nextPipelineStep } from "@/lib/analyse/progress";
import { getSpotifyAccessToken, SpotifyTokenError } from "@/lib/auth/tokens";
import { tokenStore } from "@/lib/auth/token-store";
import { createDeezer } from "@/lib/enrich/deezer";
import { createRateLimiter, musicbrainzUserAgent } from "@/lib/enrich/limiter";
import { createMusicBrainz } from "@/lib/enrich/musicbrainz";
import { runEnrich } from "@/lib/enrich/run";
import { enrichStore } from "@/lib/enrich/store";
import { ingestStore } from "@/lib/ingest/store";
import { runIngest } from "@/lib/ingest/run";
import { log } from "@/lib/log";
import { runOrder } from "@/lib/order/run";
import { orderStore } from "@/lib/order/store";
import { generateOrder, generatePopularity } from "@/lib/order/model";
import { generateProfile } from "@/lib/profile/model";
import { runTasteProfile } from "@/lib/profile/run";
import { profileStore } from "@/lib/profile/store";
import { createSpotifyClient } from "@/lib/spotify/client";
import type { StreamEvent } from "@/lib/stream/events";

const TOUCH_MS = 10_000;

export async function takeLease(userId: string, runId: string): Promise<string | null> {
  const token = randomUUID();
  const acquired = await acquireLease(runId, userId, token);
  return acquired ? token : null;
}

export async function runPipeline(input: { userId: string; token: string; emit?: (event: StreamEvent) => void }): Promise<void> {
  const emit = input.emit ?? (() => undefined);
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  try {
    await withLease(input.token, async () => {
      const first = await loadLatestRun(input.userId);
      if (!first) return;
      heartbeat = setInterval(() => {
        void touchLease(first.id, input.token).catch(() => undefined);
      }, TOUCH_MS);
      let guard = 0;
      while (guard < 8) {
        guard += 1;
        const step = await advanceOnce(input.userId, emit);
        if (step !== "continue") return;
      }
    });
  } catch (error) {
    if (error instanceof LeaseLost || error instanceof SpotifyTokenError) return;
    log("error", "analyse.failed", { user_id: input.userId, message: error instanceof Error ? error.message : "failed" });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await releaseLeaseSafe(input.userId, input.token);
  }
}

async function releaseLeaseSafe(userId: string, token: string) {
  const run = await loadLatestRun(userId).catch(() => null);
  if (run) await releaseLease(run.id, token).catch(() => undefined);
}

async function advanceOnce(userId: string, emit: (event: StreamEvent) => void): Promise<"continue" | "done" | "error"> {
  const profiles = profileStore();
  const run = await profiles.latestRun(userId);
  if (!run) return "done";
  const profile = await profiles.getProfile(userId, run.id);
  const step = nextPipelineStep(run, profile != null);
  log("info", "analyse.stage", { run_id: run.id, user_id: userId, stage: run.stage, status: run.status, step });
  if (step === "stop") return run.status === "error" ? "error" : "done";

  if (step === "ingest") {
    try {
      const token = await getSpotifyAccessToken(userId, { store: tokenStore(), now: Date.now, fetch });
      const next = await runIngest({
        userId,
        client: createSpotifyClient(token),
        store: ingestStore(),
        emit,
      });
      return next.status === "error" ? "error" : "continue";
    } catch (error) {
      if (error instanceof SpotifyTokenError) {
        emit({ type: "error", code: error.code, message: "Spotify needs you to log in again." });
        return "error";
      }
      if (error instanceof LeaseLost) throw error;
      throw error;
    }
  }

  if (step === "enrich") {
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    await runEnrich({
      userId,
      store: enrichStore(),
      emit,
      musicbrainz: createMusicBrainz({
        fetch,
        sleep,
        userAgent: musicbrainzUserAgent(),
        wait: createRateLimiter(1000, { now: Date.now, sleep }),
      }),
      deezer: createDeezer({ fetch, sleep }),
    });
    return "continue";
  }

  if (step === "profile") {
    try {
      await runTasteProfile({ userId, store: profiles, complete: generateProfile, emit });
    } catch (error) {
      if (error instanceof LeaseLost) throw error;
      return "error";
    }
    const after = await profiles.latestRun(userId);
    if (!after || after.status === "error") return "error";
    return "continue";
  }

  const fresh = await profiles.latestRun(userId);
  const saved = fresh ? await profiles.getProfile(userId, fresh.id) : null;
  if (!fresh || fresh.status === "error" || !saved) return "error";
  try {
    await runOrder({
      userId,
      store: orderStore(),
      complete: async (call) => (call.kind === "popularity" ? generatePopularity(call) : generateOrder({
        system: call.system,
        prompt: call.prompt,
        itemIds: call.itemIds ?? [],
        tagIds: call.tagIds ?? [],
      })),
      emit,
    });
  } catch (error) {
    if (error instanceof LeaseLost) throw error;
    return "error";
  }
  return "done";
}
