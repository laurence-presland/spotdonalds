export type EnrichTrack = {
  spotify_id: string;
  isrc: string | null;
  name: string;
  artists: string[];
  album_name: string | null;
  album_image_url: string | null;
};

export type TagOrigin = "recording" | "artist" | "release";

export type TagHit = {
  name: string;
  original: string;
  count: number;
  origin?: TagOrigin;
  confidence?: "high" | "low";
  sourceUrl?: string;
};

export type SourceName = "musicbrainz" | "deezer";

export type SourceHit = {
  source: SourceName;
  matched: boolean;
  confidence: "high" | "low";
  sourceUrl: string | null;
  tags: TagHit[];
  bpm: number | null;
  error?: string;
  raw: unknown;
};

export type FieldValue<T> = {
  value: T;
  source: SourceName;
  source_url: string;
  confidence: "high" | "low";
  fetched_at: string;
};

export type TagProvenance = FieldValue<string> & {
  origin?: TagOrigin;
};

export type ChosenEnrichment = {
  matched: true;
  confidence: "high" | "low";
  tags: (TagHit & { provenance: TagProvenance })[];
  bpm: FieldValue<number> | null;
  failures: SourceName[];
};

export type CacheRow = {
  cache_key: string;
  spotify_track_id: string;
  isrc: string | null;
  matched: boolean;
  tags: ChosenEnrichment["tags"];
  bpm: number | null;
  fields: unknown;
  raw: unknown;
  confidence: "high" | "low" | null;
  fetched_at: string;
  expires_at: string | null;
};

export function cacheKey(track: Pick<EnrichTrack, "isrc" | "name" | "artists">): string {
  if (track.isrc) return `isrc:${track.isrc.toUpperCase()}`;
  const artist = (track.artists[0] ?? "").toLowerCase().trim();
  return `text:${artist}|${track.name.toLowerCase().trim()}`;
}

export function miss(source: SourceName, error?: string): SourceHit {
  return {
    source,
    matched: false,
    confidence: "low",
    sourceUrl: null,
    tags: [],
    bpm: null,
    error,
    raw: null,
  };
}
