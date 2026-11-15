import { loadLatestRun, saveAnalysisRun } from "@/lib/analysis-run";
import { sql } from "@/lib/db";
import { tracksForProfile } from "@/lib/enrich/priority";
import type { CacheRow, EnrichTrack } from "@/lib/enrich/types";
import type { EnrichStore } from "@/lib/enrich/run";

type CacheQueryRow = Omit<CacheRow, "fetched_at" | "expires_at" | "bpm"> & {
  bpm: number | string | null;
  fetched_at: Date | string;
  expires_at: Date | string | null;
};

/** Postgres-backed store for enrichment cache reads and writes. */
export function enrichStore(): EnrichStore {
  return {
    latestRun: loadLatestRun,
    saveRun: saveAnalysisRun,
    async listTracks(userId) {
      const db = sql();
      const ranked = await db<{ spotify_id: string; rank: number | null; played_at: Date | string | null }[]>`
        with tops as (
          select spotify_id, min(rank) as rank
          from spotdonalds.top_items
          where user_id = ${userId} and kind = 'track'
          group by spotify_id
        ),
        plays as (
          select track_id as spotify_id, max(played_at) as played_at
          from spotdonalds.plays
          where user_id = ${userId}
          group by track_id
        ),
        ids as (
          select spotify_id from tops
          union
          select spotify_id from plays
        )
        select ids.spotify_id, tops.rank, plays.played_at
        from ids
        left join tops on tops.spotify_id = ids.spotify_id
        left join plays on plays.spotify_id = ids.spotify_id
      `;
      const ids = tracksForProfile(ranked.map((row) => ({
        id: row.spotify_id,
        rank: row.rank,
        playedAt: row.played_at == null ? null : row.played_at instanceof Date ? row.played_at.toISOString() : new Date(row.played_at).toISOString(),
      })));
      if (ids.length === 0) return [];
      const tracks = await db<(Omit<EnrichTrack, "artists"> & { spotify_id: string })[]>`
        select spotify_id, isrc, name, album_name, album_image_url
        from spotdonalds.tracks
        where spotify_id in ${db(ids)}
      `;
      const links = await db<{ track_id: string; artist_id: string; position: number }[]>`
        select track_id, artist_id, position
        from spotdonalds.track_artists
        where track_id in ${db(ids)}
      `;
      const artistIds = [...new Set(links.map((row) => row.artist_id))];
      const artists = artistIds.length
        ? await db<{ spotify_id: string; name: string }[]>`
            select spotify_id, name from spotdonalds.artists where spotify_id in ${db(artistIds)}
          `
        : [];
      const names = new Map(artists.map((artist) => [artist.spotify_id, artist.name] as const));
      const byTrack = new Map<string, { name: string; position: number }[]>();
      for (const link of links) {
        const list = byTrack.get(link.track_id) ?? [];
        list.push({ name: names.get(link.artist_id) ?? "", position: link.position });
        byTrack.set(link.track_id, list);
      }
      return tracks.map((track) => ({
        spotify_id: track.spotify_id,
        isrc: track.isrc,
        name: track.name,
        artists: (byTrack.get(track.spotify_id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((artist) => artist.name)
          .filter(Boolean),
        album_name: track.album_name,
        album_image_url: track.album_image_url,
      }));
    },
    async getCache(key) {
      const rows = await sql()<CacheQueryRow[]>`
        select
          cache_key, spotify_track_id, isrc, matched, tags, bpm::float8 as bpm, fields, raw,
          confidence, fetched_at, expires_at
        from spotdonalds.track_enrichment
        where cache_key = ${key}
      `;
      const row = rows[0];
      if (!row || !row.spotify_track_id) return null;
      return {
        ...row,
        bpm: row.bpm == null ? null : Number(row.bpm),
        fetched_at: iso(row.fetched_at),
        expires_at: row.expires_at == null ? null : iso(row.expires_at),
      };
    },
    async saveCache(row) {
      const db = sql();
      await db`
        insert into spotdonalds.track_enrichment (
          cache_key, spotify_track_id, isrc, matched, tags, bpm, fields, raw, confidence, fetched_at, expires_at
        ) values (
          ${row.cache_key},
          ${row.spotify_track_id},
          ${row.isrc},
          ${row.matched},
          ${db.json(row.tags)},
          ${row.bpm},
          ${db.json(row.fields ?? {})},
          ${db.json(row.raw ?? {})},
          ${row.confidence},
          ${row.fetched_at},
          ${row.expires_at}
        )
        on conflict (cache_key) do update set
          spotify_track_id = excluded.spotify_track_id,
          isrc = excluded.isrc,
          matched = excluded.matched,
          tags = excluded.tags,
          bpm = excluded.bpm,
          fields = excluded.fields,
          raw = excluded.raw,
          confidence = excluded.confidence,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
      `;
    },
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
