import { describe, expect, it } from "vitest";
import { buildAggregates } from "@/lib/aggregates";
import { bpmStats } from "@/lib/aggregates/bpm";
import { coverage } from "@/lib/aggregates/coverage";
import { topArtistsByWindow, windowOverlap } from "@/lib/aggregates/artists";
import { normalisedEntropy, tagMix, type TagInput } from "@/lib/aggregates/tags";

const mb = (name: string, count = 1): TagInput => ({
  name,
  count,
  source: "musicbrainz",
  source_url: "https://musicbrainz.org/recording/1",
});

describe("tag mix", () => {
  it("handles an empty list, drops junk, merges aliases, and breaks ties by name", () => {
    expect(tagMix([])).toEqual({ buckets: [], unmapped: [] });
    const mix = tagMix(
      [
        { tags: [mb("Rap"), mb("seen live"), mb("jazz", 0)] },
        { tags: [mb("hip-hop"), mb("blues")] },
        { tags: [mb("rock")] },
      ],
      2,
    );
    expect(mix.buckets.map((bucket) => bucket.name)).toEqual(["hip hop", "blues", "other"]);
    expect(mix.buckets[0]?.count).toBe(2);
    expect(mix.buckets[0]?.sources[0]?.source).toBe("musicbrainz");
    expect(mix.buckets.find((bucket) => bucket.name === "seen live")).toBeUndefined();
    expect(mix.unmapped).toContain("blues");
    expect(mix.unmapped).not.toContain("hip hop");
    const tied = tagMix([{ tags: [mb("rock")] }, { tags: [mb("blues")] }], 1);
    expect(tied.buckets[0]?.name).toBe("blues");
    expect(tied.buckets[1]?.name).toBe("other");
  });
});

describe("bpm", () => {
  it("ignores missing and zero tempos and summarises a typical set", () => {
    expect(bpmStats([]).mean).toBeNull();
    expect(bpmStats([null, 0, undefined]).count).toBe(0);
    const stats = bpmStats([120, null, 0, 100, 140]);
    expect(stats.count).toBe(3);
    expect(stats.mean).toBe(120);
    expect(stats.median).toBe(120);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(140);
    expect(stats.stdev).toBeCloseTo(Math.sqrt((400 + 0 + 400) / 3));
    expect(stats.bins.find((bin) => bin.label === "100–120")?.count).toBe(1);
    expect(stats.bins.find((bin) => bin.label === "120–140")?.count).toBe(1);
  });
});

describe("artists and coverage", () => {
  it("keeps rank order, finds window overlap, and counts coverage", () => {
    const artists = topArtistsByWindow([
      { id: "b", name: "B", time_range: "short_term", rank: 2 },
      { id: "a", name: "A", time_range: "short_term", rank: 1 },
      { id: "a", name: "A", time_range: "long_term", rank: 1 },
    ]);
    expect(artists.short_term.map((artist) => artist.id)).toEqual(["a", "b"]);
    expect(artists.medium_term).toEqual([]);
    expect(windowOverlap(artists.short_term.concat(artists.long_term), [
      { id: "t1", time_range: "short_term" },
      { id: "t1", time_range: "long_term" },
      { id: "t2", time_range: "medium_term" },
    ])).toEqual({ artists: ["a"], tracks: ["t1"] });

    const report = coverage([
      { tags: [mb("jazz")], bpm: 120, failures: ["deezer"] },
      { tags: [], bpm: null, failures: ["musicbrainz"] },
    ]);
    expect(report.withBoth).toBe(1);
    expect(report.withNeither).toBe(1);
    expect(report.shares.tags).toBe(0.5);
    expect(report.bySource.musicbrainz).toEqual({ matched: 1, failed: 1 });
    expect(coverage([]).shares.bpm).toBe(0);
  });
});

describe("entropy and the combined aggregate", () => {
  it("is 1 for an even mix and 0 for a single tag", () => {
    expect(normalisedEntropy([1, 1])).toBeCloseTo(1);
    expect(normalisedEntropy([4])).toBe(0);
    expect(normalisedEntropy([])).toBe(0);
  });

  it("builds the same aggregate from the same input", () => {
    const input = {
      tracks: [
        { id: "t1", tags: [mb("jazz"), mb("soul")], bpm: 98 },
        { id: "t2", tags: [mb("jazz")], bpm: null },
      ],
      artists: [{ id: "a", name: "A", time_range: "medium_term" as const, rank: 1 }],
      topTracks: [{ id: "t1", time_range: "medium_term" as const }],
    };
    expect(buildAggregates(input)).toEqual(buildAggregates(input));
    expect(buildAggregates(input).bpm.count).toBe(1);
    expect(buildAggregates(input).tags.buckets[0]?.name).toBe("jazz");
  });
});
