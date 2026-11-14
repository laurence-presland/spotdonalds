import { coverage } from "@/lib/aggregates/coverage";
import { bpmStats } from "@/lib/aggregates/bpm";
import { normalisedEntropy } from "@/lib/aggregates/tags";
import { canonicalTag, type TagInput } from "@/lib/aggregates/tags";
import {
  SIGNAL_KEYS,
  SIGNAL_REGISTRY,
  TRAIT_REGISTRY,
  roundSignal,
  type SignalKey,
  type TraitName,
} from "@/lib/signals/registry";
import type { Term } from "@/lib/stream/events";

export type ListeningTrack = {
  id: string;
  artistIds: string[];
  releaseDate: string | null;
  explicit: boolean;
  tags: TagInput[];
  bpm: number | null;
  windows: Term[];
  failures?: ("musicbrainz" | "deezer")[];
};

export type ListeningInput = {
  tracks: ListeningTrack[];
  plays: { trackId: string }[];
  topArtists: { id: string; time_range: Term }[];
};

export type TagShare = { tag: string; share: number };

export type TasteSignals = Record<SignalKey, number | TagShare[] | null>;

export type TraitScore = { name: TraitName; score: number; meaning: string };

const RECENT_YEARS = 5;

export function computeSignals(input: ListeningInput, now = new Date("2026-11-13T00:00:00Z")): TasteSignals {
  const tagged = input.tracks.map((track) => ({ ...track, names: tagNames(track.tags) }));
  const withTags = tagged.filter((track) => track.names.length > 0);
  const tagCounts = new Map<string, number>();
  for (const track of withTags) {
    for (const name of track.names) tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
  }
  const ranked = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, 8).map(([tag, count]) => ({
    tag,
    share: withTags.length === 0 ? 0 : count / withTags.length,
  }));
  const tempos = bpmStats(input.tracks.map((track) => track.bpm));
  const report = coverage(input.tracks);
  const years = input.tracks
    .map((track) => releaseYear(track.releaseDate))
    .filter((year): year is number => year != null);
  const recentCutoff = now.getUTCFullYear() - RECENT_YEARS;
  const shortArtists = new Set(input.topArtists.filter((artist) => artist.time_range === "short_term").map((artist) => artist.id));
  const longArtists = new Set(input.topArtists.filter((artist) => artist.time_range === "long_term").map((artist) => artist.id));
  const shortTracks = new Set(input.tracks.filter((track) => track.windows.includes("short_term")).map((track) => track.id));
  const longTracks = new Set(input.tracks.filter((track) => track.windows.includes("long_term")).map((track) => track.id));

  return {
    "tags.top": top,
    "tags.diversity": normalisedEntropy(ranked.map((entry) => entry[1])),
    "bpm.mean": tempos.mean,
    "bpm.median": tempos.median,
    "bpm.spread": tempos.stdev,
    "bpm.sample_size": tempos.count,
    "consistency.artist_overlap": jaccard(shortArtists, longArtists),
    "consistency.track_overlap": jaccard(shortTracks, longTracks),
    "consistency.tag_drift": tagDrift(tagged, "short_term", "long_term"),
    "concentration.top_artists_share": concentration(input),
    "repeat.rate": repeatRate(input.plays),
    "recency.recent_share": years.length === 0 ? null : years.filter((year) => year >= recentCutoff).length / years.length,
    "recency.median_release_year": median(years),
    "explicit.share": input.tracks.length === 0 ? null : input.tracks.filter((track) => track.explicit).length / input.tracks.length,
    "coverage.tags": report.shares.tags,
    "coverage.bpm": report.shares.bpm,
  };
}

export function scoreTraits(signals: TasteSignals): TraitScore[] {
  return (Object.keys(TRAIT_REGISTRY) as TraitName[]).map((name) => ({
    name,
    meaning: TRAIT_REGISTRY[name].meaning,
    score: traitScore(name, signals),
  }));
}

export function traitScore(name: TraitName, signals: TasteSignals): number {
  if (name === "energy") return clamp(scale(numberOr(signals["bpm.mean"], 110), 60, 160));
  if (name === "variety") return clamp(numberOr(signals["tags.diversity"], 0) * 100);
  if (name === "loyalty") {
    const concentrationShare = numberOr(signals["concentration.top_artists_share"], 0);
    const repeat = numberOr(signals["repeat.rate"], 0);
    return clamp(100 * (0.6 * concentrationShare + 0.4 * repeat));
  }
  const recent = signals["recency.recent_share"];
  if (typeof recent !== "number") return 50;
  return clamp(100 * (1 - recent));
}

export function presentSignals(signals: TasteSignals): {
  key: SignalKey;
  value: number | TagShare[];
  meaning: string;
  unit: string;
  mention: boolean;
}[] {
  return SIGNAL_KEYS.flatMap((key) => {
    const value = signals[key];
    if (value == null) return [];
    const definition = SIGNAL_REGISTRY[key];
    return [
      {
        key,
        value: roundValue(key, value),
        meaning: definition.meaning,
        unit: definition.unit,
        mention: definition.mention,
      },
    ];
  });
}

export function roundValue(key: SignalKey, value: number | TagShare[]): number | TagShare[] {
  if (Array.isArray(value)) {
    return value.map((item) => ({ tag: item.tag, share: roundSignal(item.share, SIGNAL_REGISTRY[key].decimals) }));
  }
  return roundSignal(value, SIGNAL_REGISTRY[key].decimals);
}

function tagNames(tags: TagInput[]): string[] {
  const names = new Set<string>();
  for (const tag of tags) {
    if (tag.count < 1) continue;
    const name = canonicalTag(tag.name);
    if (name) names.add(name);
  }
  return [...names];
}

function releaseYear(value: string | null): number | null {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year > 1900 && year < 2100 ? year : null;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const id of left) if (right.has(id)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function tagDrift(tracks: (ListeningTrack & { names: string[] })[], left: Term, right: Term): number {
  const a = shareMap(tracks.filter((track) => track.windows.includes(left)));
  const b = shareMap(tracks.filter((track) => track.windows.includes(right)));
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  const keys = new Set([...a.keys(), ...b.keys()]);
  let distance = 0;
  for (const key of keys) distance += Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0));
  return distance / 2;
}

function shareMap(tracks: { names: string[] }[]): Map<string, number> {
  const tagged = tracks.filter((track) => track.names.length > 0);
  const counts = new Map<string, number>();
  for (const track of tagged) {
    for (const name of track.names) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Map([...counts.entries()].map(([name, count]) => [name, tagged.length === 0 ? 0 : count / tagged.length]));
}

function concentration(input: ListeningInput): number {
  const weights = new Map<string, number>();
  const artistOf = new Map(input.tracks.map((track) => [track.id, track.artistIds[0] ?? null]));
  const add = (id: string | null) => {
    if (!id) return;
    weights.set(id, (weights.get(id) ?? 0) + 1);
  };
  for (const play of input.plays) add(artistOf.get(play.trackId) ?? null);
  for (const artist of input.topArtists) add(artist.id);
  for (const track of input.tracks) {
    if (track.windows.length > 0) add(track.artistIds[0] ?? null);
  }
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  const top = [...weights.values()].sort((a, b) => b - a).slice(0, 3);
  return top.reduce((sum, value) => sum + value, 0) / total;
}

function repeatRate(plays: { trackId: string }[]): number {
  if (plays.length === 0) return 0;
  const unique = new Set(plays.map((play) => play.trackId)).size;
  return (plays.length - unique) / plays.length;
}

function median(years: number[]): number | null {
  if (years.length === 0) return null;
  const sorted = [...years].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function numberOr(value: number | TagShare[] | null, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function scale(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
