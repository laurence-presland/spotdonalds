import { describe, expect, it } from "vitest";
import { computeSignals, traitScore, type ListeningInput, type TasteSignals } from "@/lib/signals/compute";
import { SIGNAL_KEYS, SIGNAL_REGISTRY, TRAIT_NAMES } from "@/lib/signals/registry";

const tag = (name: string) => ({
  name,
  count: 1,
  source: "musicbrainz",
  source_url: "https://musicbrainz.org/recording/1",
});

const listening: ListeningInput = {
  tracks: [
    {
      id: "t1",
      artistIds: ["a"],
      releaseDate: "2024-01-01",
      explicit: false,
      tags: [tag("jazz")],
      bpm: 100,
      windows: ["short_term"],
    },
    {
      id: "t2",
      artistIds: ["a"],
      releaseDate: "2010-05-01",
      explicit: true,
      tags: [tag("jazz"), tag("rock")],
      bpm: 140,
      windows: ["long_term"],
    },
    {
      id: "t3",
      artistIds: ["b"],
      releaseDate: null,
      explicit: false,
      tags: [],
      bpm: null,
      windows: [],
    },
  ],
  plays: [{ trackId: "t1" }, { trackId: "t1" }, { trackId: "t2" }],
  topArtists: [
    { id: "a", window: "short_term" },
    { id: "a", window: "long_term" },
    { id: "b", window: "medium_term" },
  ],
};

describe("signals", () => {
  it("uses only registry keys, and each key has a meaning, unit and rounding", () => {
    expect(Object.keys(SIGNAL_REGISTRY).sort()).toEqual([...SIGNAL_KEYS].sort());
    for (const key of SIGNAL_KEYS) {
      expect(SIGNAL_REGISTRY[key].meaning.length).toBeGreaterThan(0);
      expect(SIGNAL_REGISTRY[key].unit.length).toBeGreaterThan(0);
      expect(SIGNAL_REGISTRY[key].decimals).toBeGreaterThanOrEqual(0);
      expect(SIGNAL_REGISTRY[key].label.length).toBeGreaterThan(0);
    }
    expect(SIGNAL_REGISTRY["coverage.tags"].mention).toBe(false);
    expect(SIGNAL_REGISTRY["bpm.sample_size"].mention).toBe(false);
  });

  it("is deterministic, and empty listening does not invent tempos", () => {
    const empty = computeSignals({ tracks: [], plays: [], topArtists: [] });
    expect(Object.keys(empty).sort()).toEqual([...SIGNAL_KEYS].sort());
    expect(empty["bpm.mean"]).toBeNull();
    expect(empty["bpm.sample_size"]).toBe(0);
    expect(empty["coverage.tags"]).toBe(0);
    expect(empty["tags.top"]).toEqual([]);
    expect(computeSignals({ tracks: [], plays: [], topArtists: [] })).toEqual(empty);
    expect(computeSignals(listening)).toEqual(computeSignals(listening));
  });

  it("computes a typical catalogue and a low-coverage mix", () => {
    const signals = computeSignals(listening);
    expect(signals["tags.top"]).toEqual([
      { tag: "jazz", share: 1 },
      { tag: "rock", share: 0.5 },
    ]);
    expect(signals["bpm.mean"]).toBe(120);
    expect(signals["bpm.spread"]).toBeCloseTo(20);
    expect(signals["consistency.artist_overlap"]).toBe(1);
    expect(signals["consistency.track_overlap"]).toBe(0);
    expect(signals["consistency.tag_drift"]).toBeCloseTo(0.5);
    expect(signals["repeat.rate"]).toBeCloseTo(1 / 3);
    expect(signals["recency.recent_share"]).toBeCloseTo(0.5);
    expect(signals["recency.median_release_year"]).toBe(2017);
    expect(signals["explicit.share"]).toBeCloseTo(1 / 3);
    expect(signals["coverage.tags"]).toBeCloseTo(2 / 3);
    const low = computeSignals({
      tracks: [
        { ...listening.tracks[0]!, tags: [], bpm: null },
        { ...listening.tracks[2]!, id: "t4" },
        { ...listening.tracks[2]!, id: "t5" },
      ],
      plays: [],
      topArtists: [],
    });
    expect(low["coverage.tags"]).toBe(0);
    expect(low["coverage.bpm"]).toBe(0);
  });
});

describe("trait scores", () => {
  const signals = computeSignals(listening);

  it("scores energy from tempo", () => {
    expect(traitScore("energy", { ...signals, "bpm.mean": 60 })).toBe(0);
    expect(traitScore("energy", { ...signals, "bpm.mean": 160 })).toBe(100);
    expect(traitScore("energy", { ...signals, "bpm.mean": 110 })).toBe(50);
    expect(traitScore("energy", { ...signals, "bpm.mean": null })).toBe(50);
  });

  it("scores variety from diversity", () => {
    expect(traitScore("variety", { ...signals, "tags.diversity": 0 })).toBe(0);
    expect(traitScore("variety", { ...signals, "tags.diversity": 0.5 })).toBe(50);
  });

  it("scores loyalty from concentration and repeats", () => {
    const loyal: TasteSignals = {
      ...signals,
      "concentration.top_artists_share": 0.5,
      "repeat.rate": 0.5,
    };
    expect(traitScore("loyalty", loyal)).toBe(50);
  });

  it("scores nostalgia from how old the catalogue is", () => {
    expect(traitScore("nostalgia", { ...signals, "recency.recent_share": 0 })).toBe(100);
    expect(traitScore("nostalgia", { ...signals, "recency.recent_share": 1 })).toBe(0);
    expect(traitScore("nostalgia", { ...signals, "recency.recent_share": null })).toBe(50);
    expect(TRAIT_NAMES).toHaveLength(4);
  });
});
