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
import { runOrder } from "@/lib/order/run";
import { orderStore } from "@/lib/order/store";
import { generateOrder, generatePopularity } from "@/lib/order/model";
import { generateProfile } from "@/lib/profile/model";
import { runTasteProfile } from "@/lib/profile/run";
import { profileStore } from "@/lib/profile/store";
import { createSpotifyClient } from "@/lib/spotify/client";
import type { StreamEvent } from "@/lib/stream/events";

export async function runAnalyse(input: { userId: string; emit: (event: StreamEvent) => void }): Promise<void> {
  const profiles = profileStore();
  const read = () => profiles.latestRun(input.userId);
  let run = await read();
  if (run?.stage === "done" && run.status === "complete") {
    input.emit({ type: "stage", stage: "done" });
    return;
  }

  if (!run || (run.stage === "ingest" && run.status !== "complete")) {
    try {
      const token = await getSpotifyAccessToken(input.userId, { store: tokenStore(), now: Date.now, fetch });
      run = await runIngest({
        userId: input.userId,
        client: createSpotifyClient(token),
        store: ingestStore(),
        emit: input.emit,
      });
    } catch (error) {
      if (error instanceof SpotifyTokenError) {
        input.emit({ type: "error", code: error.code, message: "Spotify needs you to log in again." });
        return;
      }
      throw error;
    }
    if (!run || run.status === "error") return;
  }

  run = await finishEnrich(input.userId, input.emit, await read());
  if (!run || run.status === "error" || run.stage === "ingest") return;

  if (run.stage === "enrich" || (run.stage === "profile" && run.status !== "complete")) {
    try {
      await runTasteProfile({
        userId: input.userId,
        store: profiles,
        complete: generateProfile,
        emit: input.emit,
      });
    } catch {
      return;
    }
    run = await read();
  }
  if (!run || run.status === "error") return;

  if (run.stage === "profile" || (run.stage === "order" && run.status !== "complete")) {
    try {
      await runOrder({
        userId: input.userId,
        store: orderStore(),
        complete: async (call) => (call.kind === "popularity" ? generatePopularity(call) : generateOrder({
          system: call.system,
          prompt: call.prompt,
          itemIds: call.itemIds ?? [],
          tagIds: call.tagIds ?? [],
        })),
        emit: input.emit,
      });
    } catch {
      return;
    }
  }
}

async function finishEnrich(
  userId: string,
  emit: (event: StreamEvent) => void,
  run: RunRecord | null,
): Promise<RunRecord | null> {
  const store = enrichStore();
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  let current = run;
  for (let pass = 0; pass < 8; pass += 1) {
    if (!current) return null;
    const needsEnrich = current.stage === "ingest" || (current.stage === "enrich" && !current.checkpoint.enrich);
    if (!needsEnrich) return current;
    await runEnrich({
      userId,
      store,
      emit,
      musicbrainz: createMusicBrainz({
        fetch,
        sleep,
        userAgent: musicbrainzUserAgent(),
        wait: createRateLimiter(1000, { now: Date.now, sleep }),
      }),
      deezer: createDeezer({ fetch, sleep }),
      timeBudgetMs: 45_000,
    });
    current = await store.latestRun(userId);
    if (!current || current.status === "error" || current.checkpoint.enrich) return current;
  }
  return current;
}
