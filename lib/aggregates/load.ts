import { buildAggregates, type AggregateTrack, type Aggregates } from "@/lib/aggregates";
import type { WindowArtist } from "@/lib/aggregates/artists";
import type { TagInput } from "@/lib/aggregates/tags";
import { sql } from "@/lib/db";
import { log } from "@/lib/log";
import type { Term } from "@/lib/stream/events";

type StoredTag = {
  name?: string;
  count?: number;
  provenance?: { source?: string; source_url?: string };
};

export async function loadAggregates(userId: string): Promise<Aggregates> {
  const db = sql();
  const plays = await db<{ track_id: string }[]>`
    select track_id from spotdonalds.plays where user_id = ${userId}
  `;
  const tops = await db<{ kind: string; time_range: Term; rank: number; spotify_id: string }[]>`
    select kind, time_range, rank, spotify_id from spotdonalds.top_items where user_id = ${userId}
  `;
  const trackIds = [
    ...new Set([
      ...plays.map((row) => row.track_id),
      ...tops.filter((row) => row.kind === "track").map((row) => row.spotify_id),
    ]),
  ];
  const enriched = trackIds.length
    ? await db<
        {
          spotify_track_id: string | null;
          tags: StoredTag[] | null;
          bpm: number | string | null;
          fields: { failures?: ("musicbrainz" | "deezer")[] } | null;
        }[]
      >`
        select spotify_track_id, tags, bpm::float8 as bpm, fields
        from spotdonalds.track_enrichment
        where matched = true and spotify_track_id in ${db(trackIds)}
      `
    : [];
  const artistTops = tops.filter((row) => row.kind === "artist");
  const artistIds = artistTops.map((row) => row.spotify_id);
  const artists = artistIds.length
    ? await db<{ spotify_id: string; name: string }[]>`
        select spotify_id, name from spotdonalds.artists where spotify_id in ${db(artistIds)}
      `
    : [];
  const names = new Map(artists.map((artist) => [artist.spotify_id, artist.name] as const));

  const tracks: AggregateTrack[] = enriched.flatMap((item) => {
    if (!item.spotify_track_id) return [];
    const tags: TagInput[] = (item.tags ?? []).flatMap((tag) => {
      if (!tag.name) return [];
      return [
        {
          name: tag.name,
          count: tag.count ?? 1,
          source: tag.provenance?.source ?? "musicbrainz",
          source_url: tag.provenance?.source_url ?? "https://musicbrainz.org",
        },
      ];
    });
    return [
      {
        id: item.spotify_track_id,
        tags,
        bpm: item.bpm == null ? null : Number(item.bpm),
        failures: item.fields?.failures ?? [],
      },
    ];
  });

  const windowArtists: WindowArtist[] = artistTops.map((item) => ({
    id: item.spotify_id,
    name: names.get(item.spotify_id) ?? "Artist",
    time_range: item.time_range,
    rank: item.rank,
  }));
  const topTracks = tops
    .filter((row) => row.kind === "track")
    .map((item) => ({ id: item.spotify_id, time_range: item.time_range }));

  const aggregates = buildAggregates({ tracks, artists: windowArtists, topTracks });
  if (aggregates.tags.unmapped.length > 0) {
    log("info", "tags.unmapped", { user_id: userId, tags: aggregates.tags.unmapped.slice(0, 40) });
  }
  return aggregates;
}
