import { getSpotifyAccessToken } from "@/lib/auth/tokens";
import { tokenStore } from "@/lib/auth/token-store";
import { countDistinctTracks } from "@/lib/analyse/tracks";
import { loadRun, saveAnalysisRun } from "@/lib/analysis-run";
import { ingestStore } from "@/lib/ingest/store";
import { runIngest } from "@/lib/ingest/run";
import type { IngestCheckpoint, RunRecord } from "@/lib/ingest/types";
import { log } from "@/lib/log";
import { createSpotifyClient } from "@/lib/spotify/client";
import { TERMS } from "@/lib/stream/events";

export const MIN_RESULT_TRACKS = 50;

type CatalogueDeps = {
  now: () => string;
  load: (userId: string, runId: string) => Promise<RunRecord | null>;
  save: (run: RunRecord) => Promise<void>;
  countTracks: (userId: string) => Promise<number>;
  ingest: (userId: string) => Promise<void>;
};

/** Count stored tracks, fetch Spotify when the catalogue is short, and stop below 50. */
export async function pullSpotifyCatalogue(
  userId: string,
  runId: string,
  deps: CatalogueDeps = liveCatalogue(),
): Promise<"continue" | "stop"> {
  const loaded = await deps.load(userId, runId);
  if (!loaded || finished(loaded)) return "stop";
  await deps.save(running(loaded));

  let count = await deps.countTracks(userId);
  const fetch = count < MIN_RESULT_TRACKS && !sourcesDone(loaded.checkpoint);
  if (fetch) {
    await deps.ingest(userId);
    count = await deps.countTracks(userId);
  }

  const current = await deps.load(userId, runId);
  if (!current || finished(current)) return "stop";
  log("info", "analyse.step", {
    run_id: runId,
    user_id: userId,
    step: "ingest",
    skipped: !fetch,
    track_count: count,
  });
  if (count < MIN_RESULT_TRACKS) {
    await deps.save({
      ...current,
      status: "complete",
      stage: "done",
      error: null,
      outcome: "insufficient_data",
      finished_at: deps.now(),
      open: false,
      checkpoint: { ...current.checkpoint, track_count: count },
    });
    log("info", "analyse.finished", {
      run_id: runId,
      user_id: userId,
      outcome: "insufficient_data",
      track_count: count,
    });
    return "stop";
  }
  await deps.save({
    ...running(current),
    checkpoint: { ...current.checkpoint, track_count: count },
  });
  return "continue";
}

/** True when recently played and every top window have been stored. */
export function sourcesDone(checkpoint: IngestCheckpoint): boolean {
  return Boolean(
    checkpoint.recently_played &&
      TERMS.every((term) => checkpoint.top_tracks?.[term]) &&
      TERMS.every((term) => checkpoint.top_artists?.[term]),
  );
}

/** Live database and Spotify dependencies for a catalogue pull. */
function liveCatalogue(): CatalogueDeps {
  return {
    now: () => new Date().toISOString(),
    load: (userId, runId) => loadRun(runId, userId),
    save: (run) => saveAnalysisRun(run),
    countTracks: (userId) => countDistinctTracks(userId),
    async ingest(userId) {
      const token = await getSpotifyAccessToken(userId, { store: tokenStore(), now: Date.now, fetch });
      await runIngest({
        userId,
        client: createSpotifyClient(token),
        store: ingestStore(),
        stayRunning: true,
      });
    },
  };
}

/** True when the run has already stopped with an error or a final outcome. */
function finished(run: RunRecord): boolean {
  if (run.status === "error" || run.outcome === "insufficient_data") return true;
  return run.status === "complete" && run.stage === "done";
}

/** Return a copy of the run marked running at ingest. */
function running(run: RunRecord): RunRecord {
  return { ...run, status: "running", stage: "ingest", error: null, finished_at: null, open: true };
}
