import { presentCatalogue, type VisibleArtist, type VisibleTrack } from "@/lib/catalogue/present";
import { sql } from "@/lib/db";
import type { Term } from "@/lib/stream/events";

/** Load the user's tracks and artists for the list screen. */
export async function loadCatalogue(
  userId: string,
  options?: { includeUnenriched?: boolean },
): Promise<{ tracks: VisibleTrack[]; artists: VisibleArtist[] }> {
  const db = sql();
  const plays = await db<{ track_id: string }[]>`
    select track_id from spotdonalds.plays where user_id = ${userId}
  `;
  const tops = await db<{ kind: string; time_range: Term; rank: number; spotify_id: string }[]>`
    select kind, time_range, rank, spotify_id from spotdonalds.top_items where user_id = ${userId}
  `;
  const recentIds = [...new Set(plays.map((row) => row.track_id))];
  const topTracks = tops
    .filter((row) => row.kind === "track")
    .map((item) => ({ id: item.spotify_id, time_range: item.time_range, rank: item.rank }));
  const topArtists = tops.filter((row) => row.kind === "artist");
  const trackIds = [...new Set([...recentIds, ...topTracks.map((item) => item.id)])];
  const artistIds = topArtists.map((row) => row.spotify_id);

  const enriched = trackIds.length
    ? await db<{ spotify_track_id: string | null }[]>`
        select spotify_track_id from spotdonalds.track_enrichment
        where matched = true and spotify_track_id in ${db(trackIds)}
      `
    : [];
  const tracks = trackIds.length
    ? await db<{ spotify_id: string; name: string; album_name: string | null; album_image_url: string | null }[]>`
        select spotify_id, name, album_name, album_image_url
        from spotdonalds.tracks
        where spotify_id in ${db(trackIds)}
      `
    : [];
  const links = trackIds.length
    ? await db<{ track_id: string; artist_id: string; position: number }[]>`
        select track_id, artist_id, position from spotdonalds.track_artists where track_id in ${db(trackIds)}
      `
    : [];
  const linkedArtistIds = [...new Set(links.map((row) => row.artist_id))];
  const nameIds = [...new Set([...artistIds, ...linkedArtistIds])];
  const artists = nameIds.length
    ? await db<{ spotify_id: string; name: string }[]>`
        select spotify_id, name from spotdonalds.artists where spotify_id in ${db(nameIds)}
      `
    : [];

  const names = new Map(artists.map((artist) => [artist.spotify_id, artist.name] as const));
  const byTrack = new Map<string, { name: string; position: number }[]>();
  for (const link of links) {
    const list = byTrack.get(link.track_id) ?? [];
    list.push({ name: names.get(link.artist_id) ?? "", position: link.position });
    byTrack.set(link.track_id, list);
  }

  return presentCatalogue({
    tracks: tracks.map((track) => {
      const credits = (byTrack.get(track.spotify_id) ?? []).sort((a, b) => a.position - b.position);
      return {
        id: track.spotify_id,
        name: track.name,
        artists: credits.map((credit) => credit.name).filter(Boolean),
        album: track.album_name,
        image: track.album_image_url,
      };
    }),
    recentIds,
    topTracks,
    artists: topArtists.map((item) => ({
      id: item.spotify_id,
      name: names.get(item.spotify_id) ?? "Artist",
      time_range: item.time_range,
      rank: item.rank,
    })),
    enrichedIds: options?.includeUnenriched
      ? new Set(trackIds)
      : new Set(enriched.map((row) => row.spotify_track_id).filter((id): id is string => Boolean(id))),
  });
}
