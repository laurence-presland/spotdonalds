import type { TagInput } from "@/lib/aggregates/tags";
import type { ListeningInput, ListeningTrack } from "@/lib/signals/compute";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Term } from "@/lib/stream/events";

type StoredTag = {
  name?: string;
  count?: number;
  provenance?: { source?: string; source_url?: string };
};

export async function loadListening(userId: string): Promise<ListeningInput> {
  const db = createAdminClient();
  const plays = await db.from("plays").select("track_id").eq("user_id", userId);
  if (plays.error) throw new Error(plays.error.message);
  const tops = await db.from("top_items").select("kind, time_range, spotify_id").eq("user_id", userId);
  if (tops.error) throw new Error(tops.error.message);

  const playRows = (plays.data ?? []).map((row) => ({ trackId: String((row as { track_id: string }).track_id) }));
  const topTracks = (tops.data ?? []).filter((row) => (row as { kind: string }).kind === "track");
  const trackIds = [...new Set([...playRows.map((play) => play.trackId), ...topTracks.map((row) => String((row as { spotify_id: string }).spotify_id))])];
  const windowsByTrack = new Map<string, Term[]>();
  for (const row of topTracks) {
    const item = row as { spotify_id: string; time_range: Term };
    const list = windowsByTrack.get(item.spotify_id) ?? [];
    list.push(item.time_range);
    windowsByTrack.set(item.spotify_id, list);
  }

  const tracks = trackIds.length
    ? await db.from("tracks").select("spotify_id, release_date, explicit").in("spotify_id", trackIds)
    : { data: [], error: null };
  if (tracks.error) throw new Error(tracks.error.message);
  const links = trackIds.length
    ? await db.from("track_artists").select("track_id, artist_id, position").in("track_id", trackIds)
    : { data: [], error: null };
  if (links.error) throw new Error(links.error.message);
  const enriched = trackIds.length
    ? await db.from("track_enrichment").select("spotify_track_id, matched, tags, bpm, fields").in("spotify_track_id", trackIds)
    : { data: [], error: null };
  if (enriched.error) throw new Error(enriched.error.message);

  const artistsByTrack = new Map<string, { id: string; position: number }[]>();
  for (const row of links.data ?? []) {
    const link = row as { track_id: string; artist_id: string; position: number };
    const list = artistsByTrack.get(link.track_id) ?? [];
    list.push({ id: link.artist_id, position: link.position });
    artistsByTrack.set(link.track_id, list);
  }
  const enrichment = new Map(
    (enriched.data ?? []).map((row) => {
      const item = row as {
        spotify_track_id: string;
        matched: boolean;
        tags: StoredTag[] | null;
        bpm: number | null;
        fields: { failures?: ("musicbrainz" | "deezer")[] } | null;
      };
      return [item.spotify_track_id, item] as const;
    }),
  );

  const listeningTracks: ListeningTrack[] = (tracks.data ?? []).map((row) => {
    const track = row as { spotify_id: string; release_date: string | null; explicit: boolean };
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
      bpm: extra?.matched ? extra.bpm : null,
      windows: windowsByTrack.get(track.spotify_id) ?? [],
      failures: extra?.fields?.failures ?? [],
    };
  });

  return {
    tracks: listeningTracks,
    plays: playRows,
    topArtists: (tops.data ?? [])
      .filter((row) => (row as { kind: string }).kind === "artist")
      .map((row) => {
        const item = row as { spotify_id: string; time_range: Term };
        return { id: item.spotify_id, time_range: item.time_range };
      }),
  };
}
