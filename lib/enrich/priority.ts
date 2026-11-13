// MusicBrainz allows one request a second. Thirty tracks, with one search fallback
// when an ISRC is missing from MusicBrainz, stays around a minute. Deezer runs
// alongside that, and track_enrichment skips anything already cached.
export const PROFILE_TRACK_LIMIT = 30;

export type RankedTrack = {
  id: string;
  rank: number | null;
  playedAt: string | null;
};

export function tracksForProfile(tracks: RankedTrack[], limit = PROFILE_TRACK_LIMIT): string[] {
  return [...tracks]
    .sort((a, b) => {
      const aTop = a.rank == null ? 1 : 0;
      const bTop = b.rank == null ? 1 : 0;
      if (aTop !== bTop) return aTop - bTop;
      if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank;
      return time(b.playedAt) - time(a.playedAt);
    })
    .slice(0, limit)
    .map((track) => track.id);
}

function time(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
