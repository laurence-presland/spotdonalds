import type { Term } from "@/lib/stream/events";

export type TrackSource =
  | { kind: "recent" }
  | { kind: "top-track"; window: Term; rank: number };

export type VisibleTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  image: string | null;
  sources: TrackSource[];
};

export type VisibleArtist = {
  id: string;
  name: string;
  window: Term;
  rank: number;
};

const WINDOW_LABEL: Record<Term, string> = {
  short_term: "4 weeks",
  medium_term: "6 months",
  long_term: "1 year",
};

const WINDOW_ORDER: Term[] = ["short_term", "medium_term", "long_term"];

export function sourceLabel(sources: TrackSource[]): string {
  const tops = sources.filter((source) => source.kind === "top-track");
  if (tops.length > 0) {
    const best = [...tops].sort((a, b) => {
      if (a.kind !== "top-track" || b.kind !== "top-track") return 0;
      return WINDOW_ORDER.indexOf(a.window) - WINDOW_ORDER.indexOf(b.window) || a.rank - b.rank;
    })[0];
    if (best && best.kind === "top-track") return `Top · ${WINDOW_LABEL[best.window]}`;
  }
  if (sources.some((source) => source.kind === "recent")) return "Recent play";
  return "";
}

export function presentCatalogue(input: {
  tracks: {
    id: string;
    name: string;
    artists: string[];
    album: string | null;
    image: string | null;
  }[];
  recentIds: string[];
  topTracks: { id: string; window: Term; rank: number }[];
  artists: VisibleArtist[];
  enrichedIds: ReadonlySet<string>;
}): { tracks: VisibleTrack[]; artists: VisibleArtist[] } {
  const tracks = input.tracks
    .filter((track) => input.enrichedIds.has(track.id))
    .map((track) => {
      const sources: TrackSource[] = [];
      if (input.recentIds.includes(track.id)) sources.push({ kind: "recent" });
      for (const top of input.topTracks) {
        if (top.id === track.id) sources.push({ kind: "top-track", window: top.window, rank: top.rank });
      }
      return { ...track, sources };
    });
  return { tracks, artists: input.artists };
}
