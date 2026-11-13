import { createAdminClient } from "@/lib/supabase/admin";
import type { CacheRow, EnrichTrack } from "@/lib/enrich/types";
import type { EnrichStore } from "@/lib/enrich/run";
import { emptyCounts, type RunRecord } from "@/lib/ingest/types";

export function supabaseEnrichStore(): EnrichStore {
  const db = () => createAdminClient();
  return {
    async latestRun(userId) {
      const { data, error } = await db()
        .from("analysis_runs")
        .select("*")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const run = data as RunRecord;
      return { ...run, counts: { ...emptyCounts(), ...run.counts }, checkpoint: run.checkpoint ?? {} };
    },
    async saveRun(run) {
      const { error } = await db()
        .from("analysis_runs")
        .update({
          status: run.status,
          stage: run.stage,
          finished_at: run.finished_at,
          counts: run.counts,
          error: run.error,
          checkpoint: run.checkpoint,
        })
        .eq("id", run.id)
        .eq("user_id", run.user_id);
      if (error) throw new Error(error.message);
    },
    async listTracks(userId) {
      const supabase = db();
      const plays = await supabase.from("plays").select("track_id").eq("user_id", userId);
      if (plays.error) throw new Error(plays.error.message);
      const tops = await supabase
        .from("top_items")
        .select("spotify_id")
        .eq("user_id", userId)
        .eq("kind", "track");
      if (tops.error) throw new Error(tops.error.message);
      const ids = [
        ...new Set([
          ...(plays.data ?? []).map((row) => String((row as { track_id: string }).track_id)),
          ...(tops.data ?? []).map((row) => String((row as { spotify_id: string }).spotify_id)),
        ]),
      ];
      if (ids.length === 0) return [];
      const tracks = await supabase
        .from("tracks")
        .select("spotify_id, isrc, name, album_name, album_image_url")
        .in("spotify_id", ids);
      if (tracks.error) throw new Error(tracks.error.message);
      const links = await supabase
        .from("track_artists")
        .select("track_id, artist_id, position")
        .in("track_id", ids);
      if (links.error) throw new Error(links.error.message);
      const artistIds = [...new Set((links.data ?? []).map((row) => String((row as { artist_id: string }).artist_id)))];
      const artists = artistIds.length
        ? await supabase.from("artists").select("spotify_id, name").in("spotify_id", artistIds)
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
      return (tracks.data ?? []).map((row) => {
        const track = row as EnrichTrack & { spotify_id: string };
        const artistNames = (byTrack.get(track.spotify_id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((artist) => artist.name)
          .filter(Boolean);
        return {
          spotify_id: track.spotify_id,
          isrc: track.isrc,
          name: track.name,
          artists: artistNames,
          album_name: track.album_name,
          album_image_url: track.album_image_url,
        };
      });
    },
    async getCache(key) {
      const { data, error } = await db().from("track_enrichment").select("*").eq("cache_key", key).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CacheRow | null) ?? null;
    },
    async saveCache(row) {
      const { error } = await db().from("track_enrichment").upsert(row, { onConflict: "cache_key" });
      if (error) throw new Error(error.message);
    },
  };
}
