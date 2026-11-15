import { describe, expect, it } from "vitest";
import { chooseEnrichment } from "@/lib/enrich/choose";
import { miss, type SourceHit } from "@/lib/enrich/types";

const fetchedAt = "2026-11-13T00:00:00.000Z";

function mb(partial: Partial<SourceHit> = {}): SourceHit {
  return {
    source: "musicbrainz",
    matched: true,
    confidence: "high",
    sourceUrl: "https://musicbrainz.org/recording/abc",
    tags: [{ name: "Hip Hop", original: "Hip Hop", count: 4 }],
    bpm: null,
    raw: { id: "abc" },
    ...partial,
  };
}

describe("chooseEnrichment", () => {
  it("stores MusicBrainz tags with the recording URL and drops a zero Deezer BPM", () => {
    const chosen = chooseEnrichment(mb(), {
      source: "deezer",
      matched: true,
      confidence: "high",
      sourceUrl: "https://www.deezer.com/track/9",
      tags: [],
      bpm: 0,
      raw: { bpm: 0 },
    }, fetchedAt);
    expect(chosen?.tags[0]).toMatchObject({
      name: "hip hop",
      original: "Hip Hop",
      count: 4,
      provenance: {
        source: "musicbrainz",
        source_url: "https://musicbrainz.org/recording/abc",
        confidence: "high",
      },
    });
    expect(chosen?.bpm).toBeNull();
  });

  it("keeps a non-zero Deezer BPM and a result when only one source matches", () => {
    const chosen = chooseEnrichment(miss("musicbrainz", "503"), {
      source: "deezer",
      matched: true,
      confidence: "high",
      sourceUrl: "https://www.deezer.com/track/9",
      tags: [],
      bpm: 128,
      raw: {},
    }, fetchedAt);
    expect(chosen?.bpm?.value).toBe(128);
    expect(chosen?.bpm?.source).toBe("deezer");
    expect(chosen?.failures).toEqual(["musicbrainz"]);
    expect(chosen?.tags).toEqual([]);
  });

  it("drops a track neither source matched", () => {
    expect(chooseEnrichment(miss("musicbrainz"), miss("deezer"), fetchedAt)).toBeNull();
  });

  it("marks an artist and title fallback as low confidence", () => {
    const chosen = chooseEnrichment(
      mb({ confidence: "low", sourceUrl: "https://musicbrainz.org/recording/fallback" }),
      miss("deezer"),
      fetchedAt,
    );
    expect(chosen?.confidence).toBe("low");
    expect(chosen?.tags[0]?.provenance.confidence).toBe("low");
  });

  it("keeps artist-fallback tags at low confidence and records their origin", () => {
    const chosen = chooseEnrichment(
      mb({
        confidence: "high",
        tags: [
          {
            name: "pop",
            original: "pop",
            count: 3,
            origin: "artist",
            confidence: "low",
            sourceUrl: "https://musicbrainz.org/artist/ada",
          },
        ],
      }),
      miss("deezer"),
      fetchedAt,
    );
    expect(chosen?.confidence).toBe("high");
    expect(chosen?.tags[0]).toMatchObject({
      name: "pop",
      origin: "artist",
      provenance: {
        source: "musicbrainz",
        source_url: "https://musicbrainz.org/artist/ada",
        confidence: "low",
        origin: "artist",
      },
    });
  });
});
