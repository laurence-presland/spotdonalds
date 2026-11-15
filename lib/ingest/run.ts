import type { ListeningClient } from "@/lib/spotify/client";
import { SpotifyApiError } from "@/lib/spotify/http";
import {
  artistsFromTrack,
  normaliseRecentPlays,
  normaliseTopArtists,
  normaliseTopTracks,
  type TrackRow,
} from "@/lib/spotify/normalise";
import { TERMS, type StreamEvent, type Term } from "@/lib/stream/events";
import { log } from "@/lib/log";
import { emptyCounts, type IngestStore, type RunRecord } from "@/lib/ingest/types";

const ENDPOINT_TOTAL = 1 + TERMS.length * 2;

/** Pull recently played and top items from Spotify and save them. */
export async function runIngest(input: {
  userId: string;
  client: ListeningClient;
  store: IngestStore;
  emit: (event: StreamEvent) => void;
  now?: () => number;
  stayRunning?: boolean;
}): Promise<RunRecord> {
  const now = input.now ?? Date.now;
  const started = now();
  input.emit({ type: "stage", stage: "ingest" });
  const run = await input.store.resumeOrCreate(input.userId, new Date(started).toISOString());
  run.status = "running";
  run.stage = "ingest";
  run.error = null;
  run.counts = {
    ...emptyCounts(),
    ...run.counts,
    top_tracks: { ...emptyCounts().top_tracks, ...run.counts?.top_tracks },
    top_artists: { ...emptyCounts().top_artists, ...run.counts?.top_artists },
  };
  run.checkpoint = run.checkpoint ?? {};
  let done = 0;
  try {
    if (!run.checkpoint.recently_played) {
      const payload = await input.client.recentlyPlayed();
      const plays = normaliseRecentPlays(payload);
      for (const play of plays) {
        await persistTracks(input.store, [play.track]);
        await input.store.upsertPlays(input.userId, [play]);
        input.emit(trackEvent(play.track, { source: "recent", played_at: play.played_at }));
      }
      run.counts.recently_played = plays.length;
      run.checkpoint.recently_played = true;
      await input.store.save(run);
    }
    done += 1;
    input.emit({ type: "progress", done, total: ENDPOINT_TOTAL, endpoint: "recently-played" });

    for (const term of TERMS) {
      if (!run.checkpoint.top_tracks?.[term]) {
        const payload = await input.client.topTracks(term);
        const rows = normaliseTopTracks(payload, term);
        const stored: typeof rows = [];
        for (const row of rows) {
          if (!row.track) continue;
          await persistTracks(input.store, [row.track]);
          stored.push(row);
          await input.store.replaceTop(input.userId, "track", term, stored);
          input.emit(trackEvent(row.track, { source: "top", time_range: term, rank: row.rank }));
        }
        run.counts.top_tracks[term] = rows.length;
        run.checkpoint.top_tracks = { ...run.checkpoint.top_tracks, [term]: true };
        await input.store.save(run);
      }
      done += 1;
      input.emit({ type: "progress", done, total: ENDPOINT_TOTAL, endpoint: `top-tracks:${term}` });
    }

    for (const term of TERMS) {
      if (!run.checkpoint.top_artists?.[term]) {
        const payload = await input.client.topArtists(term);
        const rows = normaliseTopArtists(payload, term);
        await input.store.upsertArtists(rows.flatMap((row) => (row.artist ? [row.artist] : [])));
        await input.store.replaceTop(input.userId, "artist", term, rows);
        run.counts.top_artists[term] = rows.length;
        run.checkpoint.top_artists = { ...run.checkpoint.top_artists, [term]: true };
        await input.store.save(run);
        for (const row of rows) {
          if (!row.artist) continue;
          input.emit({
            type: "artist",
            id: row.artist.spotify_id,
            name: row.artist.name,
            source: "top",
            time_range: term,
            rank: row.rank,
          });
        }
      }
      done += 1;
      input.emit({ type: "progress", done, total: ENDPOINT_TOTAL, endpoint: `top-artists:${term}` });
    }

    if (!input.stayRunning) {
      run.status = "complete";
      run.finished_at = new Date(now()).toISOString();
    }
    await input.store.save(run);
    input.emit({ type: "done", stage: "ingest" });
    log("info", "ingest.finished", {
      user_id: input.userId,
      run_id: run.id,
      duration_ms: now() - started,
      counts: run.counts,
    });
    return run;
  } catch (error) {
    if (input.stayRunning) {
      if (error instanceof SpotifyApiError && error.code === "not_allowlisted") {
        const fatal = new Error("not_allowlisted");
        fatal.name = "SpotifyTokenError";
        throw fatal;
      }
      throw error;
    }
    const code = error instanceof SpotifyApiError ? error.code : "internal";
    const message = error instanceof SpotifyApiError ? error.message : "Ingestion failed";
    run.status = "error";
    run.error = code;
    run.finished_at = null;
    await input.store.save(run);
    input.emit({ type: "error", code, message });
    log("error", "ingest.failed", {
      user_id: input.userId,
      run_id: run.id,
      duration_ms: now() - started,
      code,
      counts: run.counts,
    });
    return run;
  }
}

/** Save tracks and their artists from one ingest page. */
async function persistTracks(store: IngestStore, tracks: TrackRow[]) {
  const artists = tracks.flatMap(artistsFromTrack);
  await store.upsertArtists(artists);
  await store.upsertTracks(tracks);
}

/** Build the stream event for one ingested track. */
function trackEvent(
  track: TrackRow,
  extra: { source: "recent" | "top"; played_at?: string; time_range?: Term; rank?: number },
): StreamEvent {
  return {
    type: "track",
    id: track.spotify_id,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: track.album_name,
    image: track.album_image_url,
    ...extra,
  };
}
