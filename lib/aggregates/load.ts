import { buildAggregates, type AggregateTrack, type Aggregates } from "@/lib/aggregates";
import type { WindowArtist } from "@/lib/aggregates/artists";
import type { TagInput } from "@/lib/aggregates/tags";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import type { Term } from "@/lib/stream/events";

type StoredTag = {
  name?: string;
  count?: number;
  provenance?: { source?: string; source_url?: string };
};

export async function loadAggregates(userId: string): Promise<Aggregates> {
  const db = createAdminClient();
  const plays = await db.from("plays").select("track_id").eq("user_id", userId);
  if (plays.error) throw new Error(plays.error.message);
  const tops = await db.from("top_items").select("kind, time_range, rank, spotify_id").eq("user_id", userId);
  if (tops.error) throw new Error(tops.error.message);

  const trackIds = [
    ...new Set([
      ...(plays.data ?? []).map((row) => String((row as { track_id: string }).track_id)),
      ...(tops.data ?? [])
        .filter((row) => (row as { kind: string }).kind === "track")
        .map((row) => String((row as { spotify_id: string }).spotify_id)),
    ]),
  ];
  const enriched = trackIds.length
    ? await db
        .from("track_enrichment")
        .select("spotify_track_id, matched, tags, bpm, fields")
        .eq("matched", true)
        .in("spotify_track_id", trackIds)
    : { data: [], error: null };
  if (enriched.error) throw new Error(enriched.error.message);

  const artistTops = (tops.data ?? []).filter((row) => (row as { kind: string }).kind === "artist");
  const artistIds = artistTops.map((row) => String((row as { spotify_id: string }).spotify_id));
  const artists = artistIds.length
    ? await db.from("artists").select("spotify_id, name").in("spotify_id", artistIds)
    : { data: [], error: null };
  if (artists.error) throw new Error(artists.error.message);
  const names = new Map(
    (artists.data ?? []).map((row) => {
      const artist = row as { spotify_id: string; name: string };
      return [artist.spotify_id, artist.name] as const;
    }),
  );

  const tracks: AggregateTrack[] = (enriched.data ?? []).flatMap((row) => {
    const item = row as {
      spotify_track_id: string | null;
      tags: StoredTag[] | null;
      bpm: number | null;
      fields: { failures?: ("musicbrainz" | "deezer")[] } | null;
    };
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
        bpm: item.bpm,
        failures: item.fields?.failures ?? [],
      },
    ];
  });

  const windowArtists: WindowArtist[] = artistTops.map((row) => {
    const item = row as { spotify_id: string; time_range: Term; rank: number };
    return { id: item.spotify_id, name: names.get(item.spotify_id) ?? "Artist", time_range: item.time_range, rank: item.rank };
  });
  const topTracks = (tops.data ?? [])
    .filter((row) => (row as { kind: string }).kind === "track")
    .map((row) => {
      const item = row as { spotify_id: string; time_range: Term };
      return { id: item.spotify_id, time_range: item.time_range };
    });

  const aggregates = buildAggregates({ tracks, artists: windowArtists, topTracks });
  if (aggregates.tags.unmapped.length > 0) {
    log("info", "tags.unmapped", { user_id: userId, tags: aggregates.tags.unmapped.slice(0, 40) });
  }
  return aggregates;
}
