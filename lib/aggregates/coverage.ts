export type CoverageTrack = {
  tags: unknown[];
  bpm: number | null;
  failures?: ("musicbrainz" | "deezer")[];
};

export type Coverage = {
  tracks: number;
  withTags: number;
  withBpm: number;
  withBoth: number;
  withNeither: number;
  shares: { tags: number; bpm: number; both: number; neither: number };
  bySource: {
    musicbrainz: { matched: number; failed: number };
    deezer: { matched: number; failed: number };
  };
};

export function coverage(tracks: CoverageTrack[]): Coverage {
  let withTags = 0;
  let withBpm = 0;
  let withBoth = 0;
  let withNeither = 0;
  let musicbrainzMatched = 0;
  let musicbrainzFailed = 0;
  let deezerMatched = 0;
  let deezerFailed = 0;
  for (const track of tracks) {
    const tags = track.tags.length > 0;
    const bpm = track.bpm != null && track.bpm > 0;
    if (tags) withTags += 1;
    if (bpm) withBpm += 1;
    if (tags && bpm) withBoth += 1;
    if (!tags && !bpm) withNeither += 1;
    if (tags) musicbrainzMatched += 1;
    if (bpm) deezerMatched += 1;
    if (track.failures?.includes("musicbrainz")) musicbrainzFailed += 1;
    if (track.failures?.includes("deezer")) deezerFailed += 1;
  }
  const total = tracks.length;
  const share = (count: number) => (total === 0 ? 0 : count / total);
  return {
    tracks: total,
    withTags,
    withBpm,
    withBoth,
    withNeither,
    shares: {
      tags: share(withTags),
      bpm: share(withBpm),
      both: share(withBoth),
      neither: share(withNeither),
    },
    bySource: {
      musicbrainz: { matched: musicbrainzMatched, failed: musicbrainzFailed },
      deezer: { matched: deezerMatched, failed: deezerFailed },
    },
  };
}
