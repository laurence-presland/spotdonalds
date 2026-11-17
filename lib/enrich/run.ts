import { uniqBy } from "es-toolkit";
import { chooseEnrichment } from "@/lib/enrich/choose";
import {
  cacheKey,
  miss,
  type CacheRow,
  type ChosenEnrichment,
  type EnrichTrack,
  type SourceHit,
} from "@/lib/enrich/types";
import type { RunRecord } from "@/lib/ingest/types";
import { log } from "@/lib/log";

const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 60 * 60 * 1000;

export type EnrichProvider = {
  name: "musicbrainz" | "deezer";
  lookup(track: EnrichTrack): Promise<SourceHit>;
};

export type EnrichStore = {
  latestRun(userId: string): Promise<RunRecord | null>;
  saveRun(run: RunRecord): Promise<void>;
  listTracks(userId: string): Promise<EnrichTrack[]>;
  getCache(key: string): Promise<CacheRow | null>;
  saveCache(row: CacheRow): Promise<void>;
};

/** Look up MusicBrainz tags and Deezer BPM for each track, one provider after the other. */
export async function runEnrich(input: {
  userId: string;
  store: EnrichStore;
  musicbrainz: EnrichProvider;
  deezer: EnrichProvider;
  now?: () => number;
}): Promise<void> {
  const now = input.now ?? Date.now;
  const run = await input.store.latestRun(input.userId);
  if (!run) throw new Error("no_run");
  if (run.checkpoint.enrich === true) return;

  run.stage = "enrich";
  run.status = "running";
  run.error = null;
  run.finished_at = null;
  await input.store.saveRun(run);

  const tracks = uniqBy(await input.store.listTracks(input.userId), cacheKey);
  for (const track of tracks) {
    const key = cacheKey(track);
    const cached = await input.store.getCache(key);
    if (cached && !expired(cached, now())) continue;
    const musicbrainz = await safeLookup("musicbrainz", () => input.musicbrainz.lookup(track));
    const deezer = await safeLookup("deezer", () => input.deezer.lookup(track));
    const fetchedAt = new Date(now()).toISOString();
    const chosen = chooseEnrichment(musicbrainz, deezer, fetchedAt);
    await input.store.saveCache(cacheRow(track, key, chosen, musicbrainz, deezer, fetchedAt, now()));
  }

  run.checkpoint = { ...run.checkpoint, enrich: true };
  await input.store.saveRun(run);
  log("info", "enrich.finished", { user_id: input.userId, run_id: run.id, count: tracks.length });
}

/** True when a negative cache row has passed its expiry. */
function expired(row: CacheRow, now: number): boolean {
  return row.expires_at != null && Date.parse(row.expires_at) <= now;
}

/** Run a provider lookup and turn a thrown error into a miss. */
async function safeLookup(source: "musicbrainz" | "deezer", lookup: () => Promise<SourceHit>): Promise<SourceHit> {
  try {
    return await lookup();
  } catch (error) {
    return miss(source, error instanceof Error ? error.message : "failed");
  }
}

/** Build the cache row, expiring it when a source failed or nothing matched. */
function cacheRow(
  track: EnrichTrack,
  key: string,
  chosen: ChosenEnrichment | null,
  musicbrainz: SourceHit,
  deezer: SourceHit,
  fetchedAt: string,
  nowMs: number,
): CacheRow {
  return {
    cache_key: key,
    spotify_track_id: track.spotify_id,
    isrc: track.isrc,
    matched: Boolean(chosen),
    tags: chosen?.tags ?? [],
    bpm: chosen?.bpm?.value ?? null,
    fields: chosen,
    raw: { musicbrainz: musicbrainz.raw, deezer: deezer.raw },
    confidence: chosen?.confidence ?? null,
    fetched_at: fetchedAt,
    expires_at: cacheExpiry(chosen, musicbrainz, deezer, nowMs),
  };
}

/** Expire quickly after a source error, or after a week for a clean miss. */
function cacheExpiry(
  chosen: ChosenEnrichment | null,
  musicbrainz: SourceHit,
  deezer: SourceHit,
  nowMs: number,
): string | null {
  if (musicbrainz.error || deezer.error) {
    return new Date(nowMs + ERROR_TTL_MS).toISOString();
  }
  if (!chosen) {
    return new Date(nowMs + NEGATIVE_TTL_MS).toISOString();
  }
  return null;
}
