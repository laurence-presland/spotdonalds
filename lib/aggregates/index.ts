import { topArtistsByWindow, windowOverlap, type WindowArtist, type WindowItem } from "@/lib/aggregates/artists";
import { bpmStats, type BpmStats } from "@/lib/aggregates/bpm";
import { coverage, type Coverage, type CoverageTrack } from "@/lib/aggregates/coverage";
import { tagMix, type TagInput, type TagMix } from "@/lib/aggregates/tags";

export { topArtistsByWindow, windowOverlap } from "@/lib/aggregates/artists";
export { bpmStats } from "@/lib/aggregates/bpm";
export { coverage } from "@/lib/aggregates/coverage";
export { normalisedEntropy, tagMix } from "@/lib/aggregates/tags";

export type AggregateTrack = CoverageTrack & {
  id: string;
  tags: TagInput[];
};

export type Aggregates = {
  tags: TagMix;
  bpm: BpmStats;
  artists: ReturnType<typeof topArtistsByWindow>;
  overlap: { artists: string[]; tracks: string[] };
  coverage: Coverage;
};

/** Build the aggregate views from loaded tracks and artists. */
export function buildAggregates(input: {
  tracks: AggregateTrack[];
  artists: WindowArtist[];
  topTracks: WindowItem[];
}): Aggregates {
  return {
    tags: tagMix(input.tracks),
    bpm: bpmStats(input.tracks.map((track) => track.bpm)),
    artists: topArtistsByWindow(input.artists),
    overlap: windowOverlap(input.artists, input.topTracks),
    coverage: coverage(input.tracks),
  };
}
