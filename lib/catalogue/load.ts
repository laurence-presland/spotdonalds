import { presentCatalogue, type VisibleArtist, type VisibleTrack } from "@/lib/catalogue/present";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Term } from "@/lib/stream/events";

export async function loadCatalogue(userId: string): Promise<{ tracks: VisibleTrack[]; artists: VisibleArtist[] }> {
  const db = createAdminClient();
  const plays = await db.from("plays").select("track_id").eq("user_id", userId);
  if (plays.error) throw new Error(plays.error.message);
  const tops = await db.from("top_items").select("kind, window, rank, spotify_id").eq("user_id", userId);
  if (tops.error) throw new Error(tops.error.message);

  const recentIds = [...new Set((plays.data ?? []).map((row) => String((row as { track_id: string }).track_id)))];
  const topTracks = (tops.data ?? [])
    .filter((row) => (row as { kind: string }).kind === "track")
    .map((row) => {
      const item = row as { spotify_id: string; window: Term; rank: number };
      return { id: item.spotify_id, window: item.window, rank: item.rank };
    });
  const topArtists = (tops.data ?? []).filter((row) => (row as { kind: string }).kind === "artist");

  const trackIds = [...new Set([...recentIds, ...topTracks.map((item) => item.id)])];
  const artistIds = topArtists.map((row) => String((row as { spotify_id: string }).spotify_id));

  const enriched = trackIds.length
    ? await db
        .from("track_enrichment")
        .select("spotify_track_id")
        .eq("matched", true)
        .in("spotify_track_id", trackIds)
    : { data: [], error: null };
  if (enriched.error) throw new Error(enriched.error.message);

  const tracks = trackIds.length
    ? await db.from("tracks").select("spotify_id, name, album_name, album_image_url").in("spotify_id", trackIds)
    : { data: [], error: null };
  if (tracks.error) throw new Error(tracks.error.message);

  const links = trackIds.length
    ? await db.from("track_artists").select("track_id, artist_id, position").in("track_id", trackIds)
    : { data: [], error: null };
  if (links.error) throw new Error(links.error.message);

  const linkedArtistIds = [...new Set((links.data ?? []).map((row) => String((row as { artist_id: string }).artist_id)))];
  const nameIds = [...new Set([...artistIds, ...linkedArtistIds])];
  const artists = nameIds.length
    ? await db.from("artists").select("spotify_id, name").in("spotify_id", nameIds)
    : { data: [], error: null };
  if (artists.error) throw new Error(artists.error.message);

  const names = new Map(
    (artists.data ?? []).map((row) => {
      const artist = row as { spotify_id: string; name: string };
      return [artist.spotify_id, artist.name] as const;
    }),
  );
  const byTrack = new Map<string, { name: string; position: number }[]>();
  for (const row of links.data ?? []) {
    const link = row as { track_id: string; artist_id: string; position: number };
    const list = byTrack.get(link.track_id) ?? [];
    list.push({ name: names.get(link.artist_id) ?? "", position: link.position });
    byTrack.set(link.track_id, list);
  }

  return presentCatalogue({
    tracks: (tracks.data ?? []).map((row) => {
      const track = row as { spotify_id: string; name: string; album_name: string | null; album_image_url: string | null };
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
    artists: topArtists.map((row) => {
      const item = row as { spotify_id: string; window: Term; rank: number };
      return {
        id: item.spotify_id,
        name: names.get(item.spotify_id) ?? "Artist",
        window: item.window,
        rank: item.rank,
      };
    }),
    enrichedIds: new Set(
      (enriched.data ?? [])
        .map((row) => (row as { spotify_track_id: string | null }).spotify_track_id)
        .filter((id): id is string => Boolean(id)),
    ),
  });
}
