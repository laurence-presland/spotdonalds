import { uniqBy } from "es-toolkit";
import { analysisErrorCopy } from "@/lib/analyse/progress";
import type { VisibleArtist, VisibleTrack, TrackSource } from "@/lib/catalogue/present";
import type { Term } from "@/lib/stream/events";

export type VisibleStage = "reading" | "taste" | "order";

export type ConnectionStatus = "idle" | "streaming" | "reconnecting" | "error" | "access" | "dropped";

export type AnalysingState = {
  stage: VisibleStage;
  tracks: VisibleTrack[];
  artists: VisibleArtist[];
  status: ConnectionStatus;
  message: string | null;
  progressDone: number;
  progressTotal: number;
  complete: boolean;
  ingested: number;
};

export const initialAnalysingState: AnalysingState = {
  stage: "reading",
  tracks: [],
  artists: [],
  status: "idle",
  message: null,
  progressDone: 0,
  progressTotal: 0,
  complete: false,
  ingested: 0,
};

export type RunSnapshot = {
  status: string;
  stage: string;
  error: string | null;
  outcome?: string | null;
  progress: { done: number; total: number };
  complete?: boolean;
  trackCount?: number;
};

export type AnalysingAction =
  | { type: "connection"; status: ConnectionStatus; message?: string | null }
  | { type: "hydrate"; tracks: VisibleTrack[]; artists: VisibleArtist[] }
  | { type: "snapshot"; run: RunSnapshot | null };

/** Fold a status snapshot or track hydration into list-screen state. */
export function reduceAnalysis(state: AnalysingState, action: AnalysingAction): AnalysingState {
  if (action.type === "hydrate") {
    return {
      ...state,
      tracks: mergeTracks(state.tracks, action.tracks),
      artists: mergeArtists(state.artists, action.artists),
    };
  }
  if (action.type === "connection") {
    return { ...state, status: action.status, message: action.message ?? state.message };
  }
  return applySnapshot(state, action.run);
}

/** Apply a run status snapshot to the list-screen state. */
function applySnapshot(state: AnalysingState, run: RunSnapshot | null): AnalysingState {
  if (!run) return state;
  const complete = run.complete === true;
  return {
    ...state,
    stage: complete ? state.stage : stageFor(run.stage, state.stage),
    progressDone: run.progress.done,
    progressTotal: run.progress.total,
    complete,
    ingested: typeof run.trackCount === "number" ? run.trackCount : state.ingested,
    status: run.status === "error" ? (run.error === "not_allowlisted" ? "access" : "error") : "streaming",
    message: run.status === "error" ? analysisErrorCopy(run.error) : null,
  };
}

/** Map a stored run stage to the three progress labels. */
export function stageFor(pipeline: string, current: VisibleStage): VisibleStage {
  if (pipeline === "profile") return "taste";
  if (pipeline === "order" || pipeline === "popularity" || pipeline === "done") return "order";
  if (pipeline === "ingest" || pipeline === "enrich") return "reading";
  return current;
}

/** Merge incoming tracks into the list, combining sources for duplicates. */
function mergeTracks(current: VisibleTrack[], extra: VisibleTrack[]): VisibleTrack[] {
  const byId = new Map(current.map((track) => [track.id, track]));
  for (const track of extra) {
    const existing = byId.get(track.id);
    if (!existing) byId.set(track.id, track);
    else byId.set(track.id, { ...track, sources: dedupeSources([...existing.sources, ...track.sources]) });
  }
  return [...byId.values()];
}

/** Merge incoming artists into the list, last write winning per window. */
function mergeArtists(current: VisibleArtist[], extra: VisibleArtist[]): VisibleArtist[] {
  const byId = new Map(current.map((artist) => [`${artist.id}:${artist.time_range}`, artist]));
  for (const artist of extra) byId.set(`${artist.id}:${artist.time_range}`, artist);
  return [...byId.values()];
}

/** Drop duplicate track sources, keeping the first of each kind. */
function dedupeSources(sources: TrackSource[]): TrackSource[] {
  return uniqBy(sources, (source) => (source.kind === "recent" ? "recent" : `top:${source.time_range}:${source.rank}`));
}

/** Friendly label for a Spotify time window. */
export function windowName(window: Term): string {
  if (window === "short_term") return "4 weeks";
  if (window === "medium_term") return "6 months";
  return "1 year";
}
