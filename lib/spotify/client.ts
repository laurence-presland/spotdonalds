import type { Term } from "@/lib/stream/events";
import { spotifyJson } from "@/lib/spotify/http";

const API = "https://api.spotify.com/v1";

export type ListeningClient = {
  recentlyPlayed(): Promise<unknown>;
  topTracks(term: Term): Promise<unknown>;
  topArtists(term: Term): Promise<unknown>;
};

/** Spotify Web API client for recently played and top items. */
export function createSpotifyClient(
  token: string,
  deps: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): ListeningClient {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const get = (path: string) => spotifyJson(`${API}${path}`, token, { fetch: fetchImpl, sleep });
  return {
    recentlyPlayed: () => get("/me/player/recently-played?limit=50"),
    topTracks: (term) => get(`/me/top/tracks?time_range=${term}&limit=50`),
    topArtists: (term) => get(`/me/top/artists?time_range=${term}&limit=50`),
  };
}
