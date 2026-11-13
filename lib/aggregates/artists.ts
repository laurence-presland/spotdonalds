import type { Term } from "@/lib/stream/events";

export type WindowArtist = {
  id: string;
  name: string;
  window: Term;
  rank: number;
};

export type WindowItem = {
  id: string;
  window: Term;
};

const WINDOWS: Term[] = ["short_term", "medium_term", "long_term"];

export function topArtistsByWindow(artists: WindowArtist[]): Record<Term, WindowArtist[]> {
  const grouped = Object.fromEntries(WINDOWS.map((window) => [window, [] as WindowArtist[]])) as Record<
    Term,
    WindowArtist[]
  >;
  for (const artist of artists) grouped[artist.window].push(artist);
  for (const window of WINDOWS) grouped[window].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return grouped;
}

export function windowOverlap(artists: WindowItem[], tracks: WindowItem[]): { artists: string[]; tracks: string[] } {
  return {
    artists: shared(artists),
    tracks: shared(tracks),
  };
}

function shared(items: WindowItem[]): string[] {
  const windows = new Map<string, Set<Term>>();
  for (const item of items) {
    const set = windows.get(item.id) ?? new Set<Term>();
    set.add(item.window);
    windows.set(item.id, set);
  }
  return [...windows.entries()]
    .filter((entry) => entry[1].size >= 2)
    .map((entry) => entry[0])
    .sort();
}
