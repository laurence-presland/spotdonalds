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
import type { StreamEvent } from "@/lib/stream/events";

const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEEZER_CONCURRENCY = 6;

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

export async function runEnrich(input: {
  userId: string;
  store: EnrichStore;
  musicbrainz: EnrichProvider;
  deezer: EnrichProvider;
  emit: (event: StreamEvent) => void;
  now?: () => number;
  maxTracks?: number;
  timeBudgetMs?: number;
}): Promise<void> {
  const now = input.now ?? Date.now;
  const started = now();
  input.emit({ type: "stage", stage: "enrich" });
  const run = await input.store.latestRun(input.userId);
  if (!run) {
    input.emit({ type: "error", code: "no_run", message: "Nothing has been ingested yet." });
    return;
  }
  run.stage = "enrich";
  run.status = "running";
  run.error = null;
  await input.store.saveRun(run);

  const tracks = dedupe(await input.store.listTracks(input.userId));
  input.emit({ type: "enrich_start", total: tracks.length });
  run.checkpoint = { ...run.checkpoint, enrich_done: 0, enrich_total: tracks.length };
  let processed = 0;
  const pending: EnrichTrack[] = [];
  for (const track of tracks) {
    if (input.maxTracks != null && processed + pending.length >= input.maxTracks) break;
    if (input.timeBudgetMs != null && processed > 0 && now() - started >= input.timeBudgetMs) break;
    const key = cacheKey(track);
    const cached = await input.store.getCache(key);
    if (cached && !expired(cached, now())) {
      if (cached.matched) emitMatch(input.emit, track, []);
      processed += 1;
      input.emit({ type: "progress", done: processed, total: tracks.length, endpoint: "enrich" });
      continue;
    }
    pending.push(track);
  }
  const deezerTasks = new Map<string, Promise<SourceHit>>();
  const startDeezer = (track: EnrichTrack | undefined) => {
    if (!track || deezerTasks.has(track.spotify_id)) return;
    deezerTasks.set(track.spotify_id, safeLookup("deezer", () => input.deezer.lookup(track)));
  };
  for (const track of pending.slice(0, DEEZER_CONCURRENCY)) startDeezer(track);
  for (let index = 0; index < pending.length; index += 1) {
    const track = pending[index];
    if (!track) continue;
    if (input.timeBudgetMs != null && processed > 0 && now() - started >= input.timeBudgetMs) break;
    startDeezer(pending[index + DEEZER_CONCURRENCY]);
    const musicbrainz = await safeLookup("musicbrainz", () => input.musicbrainz.lookup(track));
    const deezer = await (deezerTasks.get(track.spotify_id) ?? safeLookup("deezer", () => input.deezer.lookup(track)));
    const fetchedAt = new Date(now()).toISOString();
    const chosen = chooseEnrichment(musicbrainz, deezer, fetchedAt);
    if (!musicbrainz.matched || !deezer.matched) {
      log("info", "enrich.source", {
        user_id: input.userId,
        run_id: run.id,
        track_id: track.spotify_id,
        musicbrainz: musicbrainz.error ?? (musicbrainz.matched ? "match" : "miss"),
        deezer: deezer.error ?? (deezer.matched ? "match" : "miss"),
      });
    }
    await input.store.saveCache(cacheRow(track, cacheKey(track), chosen, musicbrainz, deezer, fetchedAt, now()));
    if (chosen) emitMatch(input.emit, track, chosen.failures);
    processed += 1;
    run.checkpoint = { ...run.checkpoint, enrich_done: processed, enrich_total: tracks.length };
    await input.store.saveRun(run);
    input.emit({ type: "progress", done: processed, total: tracks.length, endpoint: "enrich" });
  }

  if (processed >= tracks.length) {
    run.status = "complete";
    run.checkpoint = { ...run.checkpoint, enrich: true };
    run.finished_at = new Date(now()).toISOString();
    await input.store.saveRun(run);
    input.emit({ type: "done", stage: "enrich" });
    log("info", "enrich.finished", { user_id: input.userId, run_id: run.id, count: tracks.length });
  } else {
    await input.store.saveRun(run);
    log("info", "enrich.partial", { user_id: input.userId, run_id: run.id, processed, total: tracks.length });
  }
}

function dedupe(tracks: EnrichTrack[]): EnrichTrack[] {
  const byKey = new Map<string, EnrichTrack>();
  for (const track of tracks) {
    const key = cacheKey(track);
    if (!byKey.has(key)) byKey.set(key, track);
  }
  return [...byKey.values()];
}

function expired(row: CacheRow, now: number): boolean {
  return row.expires_at != null && Date.parse(row.expires_at) <= now;
}

async function safeLookup(source: "musicbrainz" | "deezer", lookup: () => Promise<SourceHit>): Promise<SourceHit> {
  try {
    return await lookup();
  } catch (error) {
    return miss(source, error instanceof Error ? error.message : "failed");
  }
}

function emitMatch(emit: (event: StreamEvent) => void, track: EnrichTrack, failures: string[]) {
  emit({
    type: "enrich_result",
    id: track.spotify_id,
    name: track.name,
    artists: track.artists,
    album: track.album_name,
    image: track.album_image_url,
    failures,
  });
}

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
    expires_at: chosen ? null : new Date(nowMs + NEGATIVE_TTL_MS).toISOString(),
  };
}
