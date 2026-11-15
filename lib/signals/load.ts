import type { TagInput } from "@/lib/aggregates/tags";
import { sql } from "@/lib/db";
import type { ListeningInput, ListeningTrack } from "@/lib/signals/compute";
import type { Term } from "@/lib/stream/events";

type StoredTag = {
  name?: string;
  count?: number;
  origin?: "recording" | "artist" | "release";
  provenance?: { source?: string; source_url?: string; confidence?: "high" | "low"; origin?: "recording" | "artist" | "release" };
};

type EnrichmentRow = {
  spotify_track_id: string;
  matched: boolean;
  tags: StoredTag[] | null;
  bpm: number | string | null;
  fields: { failures?: ("musicbrainz" | "deezer")[] } | null;
};

export async function loadListening(userId: string): Promise<ListeningInput> {
  const db = sql();
  const plays = await db<{ track_id: string }[]>`
    select track_id from spotdonalds.plays where user_id = ${userId}
  `;
  const tops = await db<{ kind: string; time_range: Term; spotify_id: string }[]>`
    select kind, time_range, spotify_id from spotdonalds.top_items where user_id = ${userId}
  `;
  const playRows = plays.map((play) => ({ trackId: play.track_id }));
  const topTracks = tops.filter((row) => row.kind === "track");
  const trackIds = [...new Set([...playRows.map((play) => play.trackId), ...topTracks.map((row) => row.spotify_id)])];
  const windowsByTrack = new Map<string, Term[]>();
  for (const item of topTracks) {
    const list = windowsByTrack.get(item.spotify_id) ?? [];
    list.push(item.time_range);
    windowsByTrack.set(item.spotify_id, list);
  }

  const tracks = trackIds.length
    ? await db<{ spotify_id: string; release_date: string | null; explicit: boolean }[]>`
        select spotify_id, release_date, explicit from spotdonalds.tracks where spotify_id in ${db(trackIds)}
      `
    : [];
  const links = trackIds.length
    ? await db<{ track_id: string; artist_id: string; position: number }[]>`
        select track_id, artist_id, position from spotdonalds.track_artists where track_id in ${db(trackIds)}
      `
    : [];
  const enriched = trackIds.length
    ? await db<EnrichmentRow[]>`
        select spotify_track_id, matched, tags, bpm::float8 as bpm, fields
        from spotdonalds.track_enrichment
        where spotify_track_id in ${db(trackIds)}
      `
    : [];

  const artistsByTrack = new Map<string, { id: string; position: number }[]>();
  for (const link of links) {
    const list = artistsByTrack.get(link.track_id) ?? [];
    list.push({ id: link.artist_id, position: link.position });
    artistsByTrack.set(link.track_id, list);
  }
  const enrichment = new Map(enriched.map((item) => [item.spotify_track_id, item] as const));

  const listeningTracks: ListeningTrack[] = tracks.map((track) => {
    const extra = enrichment.get(track.spotify_id);
    const tags: TagInput[] =
      extra?.matched === true
        ? (extra.tags ?? []).flatMap((tag) =>
            tag.name
              ? [
                  {
                    name: tag.name,
                    count: tag.count ?? 1,
                    source: tag.provenance?.source ?? "musicbrainz",
                    source_url: tag.provenance?.source_url ?? "https://musicbrainz.org",
                    origin: tag.origin ?? tag.provenance?.origin,
                    confidence: tag.provenance?.confidence,
                  },
                ]
              : [],
          )
        : [];
    return {
      id: track.spotify_id,
      artistIds: (artistsByTrack.get(track.spotify_id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((artist) => artist.id),
      releaseDate: track.release_date,
      explicit: Boolean(track.explicit),
      tags,
      bpm: extra?.matched && extra.bpm != null ? Number(extra.bpm) : null,
      windows: windowsByTrack.get(track.spotify_id) ?? [],
      failures: extra?.fields?.failures ?? [],
    };
  });

  return {
    tracks: listeningTracks,
    plays: playRows,
    topArtists: tops
      .filter((row) => row.kind === "artist")
      .map((item) => ({ id: item.spotify_id, time_range: item.time_range })),
  };
}
