import type { Term } from "@/lib/stream/events";

export type WindowArtist = {
  id: string;
  name: string;
  time_range: Term;
  rank: number;
};

export type WindowItem = {
  id: string;
  time_range: Term;
};

const WINDOWS: Term[] = ["short_term", "medium_term", "long_term"];

/** Group top artists by time window and sort them by rank. */
export function topArtistsByWindow(artists: WindowArtist[]): Record<Term, WindowArtist[]> {
  const grouped = Object.fromEntries(WINDOWS.map((window) => [window, [] as WindowArtist[]])) as Record<
    Term,
    WindowArtist[]
  >;
  for (const artist of artists) grouped[artist.time_range].push(artist);
  for (const window of WINDOWS) grouped[window].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return grouped;
}

/** Ids that appear in more than one time window. */
export function windowOverlap(artists: WindowItem[], tracks: WindowItem[]): { artists: string[]; tracks: string[] } {
  return {
    artists: shared(artists),
    tracks: shared(tracks),
  };
}

/** Return ids that show up in at least two time windows. */
function shared(items: WindowItem[]): string[] {
  const windows = new Map<string, Set<Term>>();
  for (const item of items) {
    const set = windows.get(item.id) ?? new Set<Term>();
    set.add(item.time_range);
    windows.set(item.id, set);
  }
  return [...windows.entries()]
    .filter((entry) => entry[1].size >= 2)
    .map((entry) => entry[0])
    .sort();
}
