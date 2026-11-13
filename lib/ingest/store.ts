import { createAdminClient } from "@/lib/supabase/admin";
import { emptyCounts, type IngestStore, type RunRecord } from "@/lib/ingest/types";
import type { ArtistRow, TrackRow } from "@/lib/spotify/normalise";

function asRun(row: RunRecord): RunRecord {
  return {
    ...row,
    counts: { ...emptyCounts(), ...row.counts },
    checkpoint: row.checkpoint ?? {},
    finished_at: row.finished_at,
    error: row.error,
  };
}

export function supabaseIngestStore(): IngestStore {
  const db = () => createAdminClient();
  return {
    async resumeOrCreate(userId, now) {
      const supabase = db();
      const { data, error } = await supabase
        .from("analysis_runs")
        .select("*")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const latest = data as RunRecord | null;
      if (latest && latest.stage === "ingest" && latest.status !== "complete") {
        return asRun(latest);
      }
      const created = await supabase
        .from("analysis_runs")
        .insert({
          user_id: userId,
          status: "running",
          stage: "ingest",
          started_at: now,
          counts: emptyCounts(),
          checkpoint: {},
        })
        .select("*")
        .single();
      if (created.error) throw new Error(created.error.message);
      return asRun(created.data as RunRecord);
    },
    async save(run) {
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
    async upsertArtists(artists) {
      await upsert(db(), "artists", dedupeArtists(artists), "spotify_id");
    },
    async upsertTracks(tracks) {
      if (tracks.length === 0) return;
      const rows = dedupeTracks(tracks).map((track) => ({
        spotify_id: track.spotify_id,
        isrc: track.isrc,
        name: track.name,
        album_name: track.album_name,
        album_image_url: track.album_image_url,
        release_date: track.release_date,
        duration_ms: track.duration_ms,
        explicit: track.explicit,
        external_url: track.external_url,
        raw: track.raw,
      }));
      const { error } = await db().from("tracks").upsert(rows, { onConflict: "spotify_id" });
      if (error) throw new Error(error.message);
      const links = dedupeTracks(tracks).flatMap((track) =>
        track.artists.map((artist) => ({
          track_id: track.spotify_id,
          artist_id: artist.spotify_id,
          position: artist.position,
        })),
      );
      if (links.length === 0) return;
      const linked = await db().from("track_artists").upsert(links, { onConflict: "track_id,artist_id" });
      if (linked.error) throw new Error(linked.error.message);
    },
    async upsertPlays(userId, plays) {
      if (plays.length === 0) return;
      const rows = plays.map((play) => ({
        user_id: userId,
        track_id: play.track.spotify_id,
        played_at: play.played_at,
        raw: play.raw,
      }));
      const { error } = await db()
        .from("plays")
        .upsert(rows, { onConflict: "user_id,track_id,played_at" });
      if (error) throw new Error(error.message);
    },
    async replaceTop(userId, kind, window, rows) {
      const supabase = db();
      const removed = await supabase
        .from("top_items")
        .delete()
        .eq("user_id", userId)
        .eq("kind", kind)
        .eq("window", window);
      if (removed.error) throw new Error(removed.error.message);
      if (rows.length === 0) return;
      const inserted = await supabase.from("top_items").insert(
        rows.map((row) => ({
          user_id: userId,
          kind: row.kind,
          window: row.window,
          rank: row.rank,
          spotify_id: row.track?.spotify_id ?? row.artist?.spotify_id,
          raw: row.raw,
        })),
      );
      if (inserted.error) throw new Error(inserted.error.message);
    },
  };
}

export async function latestRun(userId: string): Promise<RunRecord | null> {
  const { data, error } = await createAdminClient()
    .from("analysis_runs")
    .select("id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asRun(data as RunRecord) : null;
}

async function upsert(
  supabase: ReturnType<typeof createAdminClient>,
  table: "artists",
  rows: ArtistRow[],
  onConflict: string,
) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(error.message);
}

function dedupeArtists(artists: ArtistRow[]): ArtistRow[] {
  const byId = new Map<string, ArtistRow>();
  for (const artist of artists) byId.set(artist.spotify_id, artist);
  return [...byId.values()];
}

function dedupeTracks(tracks: TrackRow[]): TrackRow[] {
  const byId = new Map<string, TrackRow>();
  for (const track of tracks) byId.set(track.spotify_id, track);
  return [...byId.values()];
}
