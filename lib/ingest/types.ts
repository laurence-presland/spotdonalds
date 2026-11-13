import type { Term } from "@/lib/stream/events";
import type { ArtistRow, PlayRow, TopRow, TrackRow } from "@/lib/spotify/normalise";

export type IngestCheckpoint = {
  recently_played?: boolean;
  top_tracks?: Partial<Record<Term, boolean>>;
  top_artists?: Partial<Record<Term, boolean>>;
  enrich?: boolean;
  enrich_done?: number;
  enrich_total?: number;
};

export type IngestCounts = {
  recently_played: number;
  top_tracks: Record<Term, number>;
  top_artists: Record<Term, number>;
};

export type RunStatus = "running" | "complete" | "error";
export type RunStage = "ingest" | "enrich" | "profile" | "order" | "done";

export type RunRecord = {
  id: string;
  user_id: string;
  status: RunStatus;
  stage: RunStage;
  started_at: string;
  finished_at: string | null;
  counts: IngestCounts;
  error: string | null;
  checkpoint: IngestCheckpoint;
  open?: boolean;
  heartbeat_at?: string | null;
};

export type IngestStore = {
  resumeOrCreate(userId: string, now: string): Promise<RunRecord>;
  save(run: RunRecord): Promise<void>;
  upsertArtists(artists: ArtistRow[]): Promise<void>;
  upsertTracks(tracks: TrackRow[]): Promise<void>;
  upsertPlays(userId: string, plays: PlayRow[]): Promise<void>;
  replaceTop(userId: string, kind: "track" | "artist", timeRange: Term, rows: TopRow[]): Promise<void>;
};

export function emptyCounts(): IngestCounts {
  return {
    recently_played: 0,
    top_tracks: { short_term: 0, medium_term: 0, long_term: 0 },
    top_artists: { short_term: 0, medium_term: 0, long_term: 0 },
  };
}
