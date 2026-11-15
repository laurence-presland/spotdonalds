import { insertRun, loadLatestRun, loadOpenRun, saveAnalysisRun } from "@/lib/analysis-run";
import { sql } from "@/lib/db";
import type { IngestStore, RunRecord } from "@/lib/ingest/types";
import type { ArtistRow, TrackRow } from "@/lib/spotify/normalise";

/** Postgres-backed store for ingest writes. */
export function ingestStore(): IngestStore {
  return {
    async resumeOrCreate(userId, now) {
      const open = await loadOpenRun(userId);
      if (open) return open;
      const latest = await loadLatestRun(userId);
      if (latest && latest.stage === "ingest" && latest.status !== "complete") return latest;
      return insertRun(userId, now);
    },
    async save(run) {
      await saveAnalysisRun(run);
    },
    async upsertArtists(artists) {
      const rows = dedupeArtists(artists);
      if (rows.length === 0) return;
      const db = sql();
      const payload = rows.map((artist) => ({
        spotify_id: artist.spotify_id,
        name: artist.name,
        external_url: artist.external_url,
        genres: db.json(artist.genres),
        popularity: artist.popularity,
        raw: db.json(artist.raw ?? {}),
      }));
      await db`
        insert into spotdonalds.artists ${db(payload, "spotify_id", "name", "external_url", "genres", "popularity", "raw")}
        on conflict (spotify_id) do update set
          name = excluded.name,
          external_url = excluded.external_url,
          genres = excluded.genres,
          popularity = excluded.popularity,
          raw = excluded.raw
      `;
    },
    async upsertTracks(tracks) {
      const rows = dedupeTracks(tracks);
      if (rows.length === 0) return;
      const db = sql();
      const payload = rows.map((track) => ({
        spotify_id: track.spotify_id,
        isrc: track.isrc,
        name: track.name,
        album_name: track.album_name,
        album_image_url: track.album_image_url,
        release_date: track.release_date,
        duration_ms: track.duration_ms,
        explicit: track.explicit,
        external_url: track.external_url,
        raw: db.json(track.raw ?? {}),
      }));
      const links = dedupeLinks(
        rows.flatMap((track) =>
          track.artists.map((artist) => ({
            track_id: track.spotify_id,
            artist_id: artist.spotify_id,
            position: artist.position,
          })),
        ),
      );
      await db.begin(async (tx) => {
        await tx`
          insert into spotdonalds.tracks ${tx(payload, "spotify_id", "isrc", "name", "album_name", "album_image_url", "release_date", "duration_ms", "explicit", "external_url", "raw")}
          on conflict (spotify_id) do update set
            isrc = excluded.isrc,
            name = excluded.name,
            album_name = excluded.album_name,
            album_image_url = excluded.album_image_url,
            release_date = excluded.release_date,
            duration_ms = excluded.duration_ms,
            explicit = excluded.explicit,
            external_url = excluded.external_url,
            raw = excluded.raw
        `;
        if (links.length === 0) return;
        await tx`
          insert into spotdonalds.track_artists ${tx(links, "track_id", "artist_id", "position")}
          on conflict (track_id, artist_id) do update set position = excluded.position
        `;
      });
    },
    async upsertPlays(userId, plays) {
      if (plays.length === 0) return;
      const db = sql();
      const payload = plays.map((play) => ({
        user_id: userId,
        track_id: play.track.spotify_id,
        played_at: play.played_at,
        raw: db.json(play.raw ?? {}),
      }));
      await db`
        insert into spotdonalds.plays ${db(payload, "user_id", "track_id", "played_at", "raw")}
        on conflict (user_id, track_id, played_at) do update set raw = excluded.raw
      `;
    },
    async replaceTop(userId, kind, timeRange, rows) {
      const db = sql();
      const payload = rows.flatMap((row) => {
        const spotifyId = row.track?.spotify_id ?? row.artist?.spotify_id;
        if (!spotifyId) return [];
        return [
          {
            user_id: userId,
            kind: row.kind,
            time_range: row.time_range,
            rank: row.rank,
            spotify_id: spotifyId,
            raw: db.json(row.raw ?? {}),
          },
        ];
      });
      await db.begin(async (tx) => {
        await tx`
          delete from spotdonalds.top_items
          where user_id = ${userId} and kind = ${kind} and time_range = ${timeRange}
        `;
        if (payload.length === 0) return;
        await tx`
          insert into spotdonalds.top_items ${tx(payload, "user_id", "kind", "time_range", "rank", "spotify_id", "raw")}
        `;
      });
    },
  };
}

export async function latestRun(userId: string): Promise<RunRecord | null> {
  return loadLatestRun(userId);
}

/** Keep the last artist row for each Spotify id, so upserts stay unique. */
function dedupeArtists(artists: ArtistRow[]): ArtistRow[] {
  const byId = new Map<string, ArtistRow>();
  for (const artist of artists) byId.set(artist.spotify_id, artist);
  return [...byId.values()];
}

/** Keep the last track row for each Spotify id, so upserts stay unique. */
function dedupeTracks(tracks: TrackRow[]): TrackRow[] {
  const byId = new Map<string, TrackRow>();
  for (const track of tracks) byId.set(track.spotify_id, track);
  return [...byId.values()];
}

/** Keep the last track–artist link for each pair. */
function dedupeLinks(links: { track_id: string; artist_id: string; position: number }[]) {
  const byKey = new Map<string, { track_id: string; artist_id: string; position: number }>();
  for (const link of links) byKey.set(`${link.track_id}:${link.artist_id}`, link);
  return [...byKey.values()];
}
