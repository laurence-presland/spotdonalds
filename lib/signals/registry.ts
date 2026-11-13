export const SIGNAL_KEYS = [
  "tags.top",
  "tags.diversity",
  "bpm.mean",
  "bpm.median",
  "bpm.spread",
  "bpm.sample_size",
  "consistency.artist_overlap",
  "consistency.track_overlap",
  "consistency.tag_drift",
  "concentration.top_artists_share",
  "repeat.rate",
  "recency.recent_share",
  "recency.median_release_year",
  "explicit.share",
  "coverage.tags",
  "coverage.bpm",
] as const;

export type SignalKey = (typeof SIGNAL_KEYS)[number];

export type SignalDefinition = {
  key: SignalKey;
  label: string;
  meaning: string;
  unit: string;
  decimals: number;
  mention: boolean;
};

export const SIGNAL_REGISTRY: Record<SignalKey, SignalDefinition> = {
  "tags.top": {
    key: "tags.top",
    label: "Top tags",
    meaning: "Top tags with their share of tagged tracks",
    unit: "list of {tag, share}",
    decimals: 2,
    mention: true,
  },
  "tags.diversity": {
    key: "tags.diversity",
    label: "Tag diversity",
    meaning: "How spread the tag mix is (normalised Shannon entropy)",
    unit: "0-1",
    decimals: 2,
    mention: true,
  },
  "bpm.mean": {
    key: "bpm.mean",
    label: "Average tempo",
    meaning: "Average tempo",
    unit: "BPM",
    decimals: 0,
    mention: true,
  },
  "bpm.median": {
    key: "bpm.median",
    label: "Middle tempo",
    meaning: "Middle tempo",
    unit: "BPM",
    decimals: 0,
    mention: true,
  },
  "bpm.spread": {
    key: "bpm.spread",
    label: "Tempo spread",
    meaning: "Standard deviation of tempo",
    unit: "BPM",
    decimals: 0,
    mention: true,
  },
  "bpm.sample_size": {
    key: "bpm.sample_size",
    label: "Tempo count",
    meaning: "Tracks with a known tempo",
    unit: "count",
    decimals: 0,
    mention: false,
  },
  "consistency.artist_overlap": {
    key: "consistency.artist_overlap",
    label: "Artist overlap",
    meaning: "Share of top artists shared between the 4-week and 1-year windows",
    unit: "0-1",
    decimals: 2,
    mention: true,
  },
  "consistency.track_overlap": {
    key: "consistency.track_overlap",
    label: "Track overlap",
    meaning: "Share of top tracks shared between the 4-week and 1-year windows",
    unit: "0-1",
    decimals: 2,
    mention: true,
  },
  "consistency.tag_drift": {
    key: "consistency.tag_drift",
    label: "Tag drift",
    meaning: "How far the tag mix moves between the 4-week and 1-year windows",
    unit: "0-1",
    decimals: 2,
    mention: true,
  },
  "concentration.top_artists_share": {
    key: "concentration.top_artists_share",
    label: "Top artist share",
    meaning: "Share of plays and top items from the top 3 artists",
    unit: "0-1",
    decimals: 2,
    mention: true,
  },
  "repeat.rate": {
    key: "repeat.rate",
    label: "Repeat rate",
    meaning: "Share of recent plays that are repeats",
    unit: "0-1",
    decimals: 2,
    mention: true,
  },
  "recency.recent_share": {
    key: "recency.recent_share",
    label: "Recent releases",
    meaning: "Share of tracks released in the last 5 years",
    unit: "0-1",
    decimals: 2,
    mention: true,
  },
  "recency.median_release_year": {
    key: "recency.median_release_year",
    label: "Middle release year",
    meaning: "Middle release year",
    unit: "year",
    decimals: 0,
    mention: true,
  },
  "explicit.share": {
    key: "explicit.share",
    label: "Explicit share",
    meaning: "Share of tracks marked explicit",
    unit: "0-1",
    decimals: 2,
    mention: true,
  },
  "coverage.tags": {
    key: "coverage.tags",
    label: "Tag coverage",
    meaning: "Share of tracks enriched with tags",
    unit: "0-1",
    decimals: 2,
    mention: false,
  },
  "coverage.bpm": {
    key: "coverage.bpm",
    label: "Tempo coverage",
    meaning: "Share of tracks enriched with tempo",
    unit: "0-1",
    decimals: 2,
    mention: false,
  },
};

export const TRAIT_NAMES = ["energy", "variety", "loyalty", "nostalgia"] as const;
export type TraitName = (typeof TRAIT_NAMES)[number];

export type TraitDefinition = {
  name: TraitName;
  meaning: string;
  sources: SignalKey[];
};

export const TRAIT_REGISTRY: Record<TraitName, TraitDefinition> = {
  energy: {
    name: "energy",
    meaning: "How fast the listening sits, from average tempo",
    sources: ["bpm.mean"],
  },
  variety: {
    name: "variety",
    meaning: "How spread the tags are",
    sources: ["tags.diversity"],
  },
  loyalty: {
    name: "loyalty",
    meaning: "How much listening sits with a few artists and repeat plays",
    sources: ["concentration.top_artists_share", "repeat.rate"],
  },
  nostalgia: {
    name: "nostalgia",
    meaning: "How much of the catalogue is older than the last five years",
    sources: ["recency.recent_share"],
  },
};

export function roundSignal(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
