import { uniqBy } from "es-toolkit";
import { analysisErrorCopy } from "@/lib/analyse/progress";
import type { VisibleArtist, VisibleTrack, TrackSource } from "@/lib/catalogue/present";
import type { StreamEvent, Term } from "@/lib/stream/events";

export type VisibleStage = "reading" | "taste" | "order";

export type ConnectionStatus = "idle" | "streaming" | "reconnecting" | "error" | "access" | "dropped";

type PendingTrack = {
  name: string;
  artists: string[];
  album: string | null;
  image: string | null;
  sources: TrackSource[];
};

export type AnalysingState = {
  stage: VisibleStage;
  tracks: VisibleTrack[];
  artists: VisibleArtist[];
  pending: Record<string, PendingTrack>;
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
  pending: {},
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
  | { type: "event"; event: StreamEvent }
  | { type: "connection"; status: ConnectionStatus; message?: string | null }
  | { type: "hydrate"; tracks: VisibleTrack[]; artists: VisibleArtist[] }
  | { type: "snapshot"; run: RunSnapshot | null };

/** Fold a stream event, snapshot, or hydration into list-screen state. */
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
  if (action.type === "snapshot") return applySnapshot(state, action.run);
  return reduceEvent(state, action.event);
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

/** Apply one stream event to the list-screen state. */
function reduceEvent(state: AnalysingState, event: StreamEvent): AnalysingState {
  if (event.type === "stage") {
    return { ...state, stage: stageFor(event.stage, state.stage), status: "streaming" };
  }
  if (event.type === "done" && event.stage === "enrich") {
    return { ...state, stage: "taste", status: "streaming" };
  }
  if (event.type === "done" && event.stage === "profile") {
    return { ...state, stage: "order", status: "streaming" };
  }
  if (event.type === "progress") {
    return { ...state, progressDone: event.done, progressTotal: event.total, status: "streaming" };
  }
  if (event.type === "error") {
    if (event.code === "not_allowlisted") {
      return { ...state, status: "access", message: event.message };
    }
    return { ...state, status: "error", message: event.message };
  }
  if (event.type === "track") {
    const current = state.pending[event.id] ?? {
      name: event.name,
      artists: event.artists,
      album: event.album,
      image: event.image,
      sources: [],
    };
    const source: TrackSource = event.source === "top"
      ? { kind: "top-track", time_range: event.time_range ?? "short_term", rank: event.rank ?? 0 }
      : { kind: "recent" };
    return {
      ...state,
      pending: {
        ...state.pending,
        [event.id]: { ...current, sources: dedupeSources([...current.sources, source]) },
      },
    };
  }
  if (event.type === "artist") {
    const artists = mergeArtists(state.artists, [
      { id: event.id, name: event.name, time_range: event.time_range, rank: event.rank },
    ]);
    return { ...state, artists };
  }
  if (event.type === "enrich_result") {
    const known = state.pending[event.id];
    const track: VisibleTrack = {
      id: event.id,
      name: event.name,
      artists: event.artists,
      album: event.album,
      image: event.image,
      sources: known?.sources ?? [],
    };
    return { ...state, tracks: mergeTracks(state.tracks, [track]), status: "streaming" };
  }
  return state;
}

/** Map a pipeline stage to the three-step list-screen stage. */
export function stageFor(pipeline: string, current: VisibleStage): VisibleStage {
  if (pipeline === "analyse" || pipeline === "profile") return "taste";
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
