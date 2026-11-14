import type { Term } from "@/lib/stream/events";

export type ArtistRow = {
  spotify_id: string;
  name: string;
  external_url: string | null;
  genres: string[];
  popularity: number | null;
  raw: unknown;
};

export type TrackArtistLink = {
  spotify_id: string;
  name: string;
  position: number;
};

export type TrackRow = {
  spotify_id: string;
  isrc: string | null;
  name: string;
  album_name: string | null;
  album_image_url: string | null;
  release_date: string | null;
  duration_ms: number | null;
  explicit: boolean;
  external_url: string | null;
  raw: unknown;
  artists: TrackArtistLink[];
};

export type PlayRow = {
  track: TrackRow;
  played_at: string;
  raw: unknown;
};

export type TopRow = {
  kind: "track" | "artist";
  time_range: Term;
  rank: number;
  track?: TrackRow;
  artist?: ArtistRow;
  raw: unknown;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function albumImage(album: unknown): string | null {
  if (!isRecord(album) || !Array.isArray(album.images)) return null;
  const images = album.images.filter(isRecord);
  const sorted = [...images].sort((a, b) => Number(b.width ?? 0) - Number(a.width ?? 0));
  return stringOrNull(sorted[0]?.url);
}

export function normaliseArtist(value: unknown): ArtistRow | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const external = isRecord(value.external_urls) ? value.external_urls : {};
  return {
    spotify_id: value.id,
    name: value.name,
    external_url: stringOrNull(external.spotify),
    genres: Array.isArray(value.genres) ? value.genres.filter((genre) => typeof genre === "string") : [],
    popularity: typeof value.popularity === "number" ? value.popularity : null,
    raw: value,
  };
}

export function normaliseTrack(value: unknown): TrackRow | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const externalIds = isRecord(value.external_ids) ? value.external_ids : {};
  const externalUrls = isRecord(value.external_urls) ? value.external_urls : {};
  const album = isRecord(value.album) ? value.album : {};
  const artists = Array.isArray(value.artists) ? value.artists : [];
  const links: TrackArtistLink[] = [];
  artists.forEach((artist, index) => {
    const normalised = normaliseArtist(artist);
    if (normalised) links.push({ spotify_id: normalised.spotify_id, name: normalised.name, position: index });
  });
  return {
    spotify_id: value.id,
    isrc: stringOrNull(externalIds.isrc),
    name: value.name,
    album_name: stringOrNull(album.name),
    album_image_url: albumImage(album),
    release_date: stringOrNull(album.release_date),
    duration_ms: typeof value.duration_ms === "number" ? value.duration_ms : null,
    explicit: value.explicit === true,
    external_url: stringOrNull(externalUrls.spotify),
    raw: value,
    artists: links,
  };
}

export function normaliseRecentPlays(payload: unknown): PlayRow[] {
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  const plays: PlayRow[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.played_at !== "string") continue;
    const track = normaliseTrack(item.track);
    if (!track) continue;
    plays.push({ track, played_at: item.played_at, raw: item });
  }
  return plays;
}

export function normaliseTopTracks(payload: unknown, timeRange: Term): TopRow[] {
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  const rows: TopRow[] = [];
  items.forEach((item, index) => {
    const track = normaliseTrack(item);
    if (!track) return;
    rows.push({ kind: "track", time_range: timeRange, rank: index + 1, track, raw: item });
  });
  return rows;
}

export function normaliseTopArtists(payload: unknown, timeRange: Term): TopRow[] {
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  const rows: TopRow[] = [];
  items.forEach((item, index) => {
    const artist = normaliseArtist(item);
    if (!artist) return;
    rows.push({ kind: "artist", time_range: timeRange, rank: index + 1, artist, raw: item });
  });
  return rows;
}

export function artistsFromTrack(track: TrackRow): ArtistRow[] {
  return track.artists.map((artist) => ({
    spotify_id: artist.spotify_id,
    name: artist.name,
    external_url: null,
    genres: [],
    popularity: null,
    raw: { id: artist.spotify_id, name: artist.name },
  }));
}
