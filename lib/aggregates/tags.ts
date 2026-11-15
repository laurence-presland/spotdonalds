// MusicBrainz tags include junk and spelling variants. One list, applied everywhere.
const IGNORED_TAGS = new Set([
  "seen live",
  "favorites",
  "favourites",
  "favorite",
  "favourite",
  "my favorite",
  "my favourite",
]);

const TAG_ALIASES: Record<string, string> = {
  "hip-hop": "hip hop",
  hiphop: "hip hop",
  rap: "hip hop",
  rnb: "r&b",
  "rhythm and blues": "r&b",
  electronica: "electronic",
  edm: "electronic",
};

const ALIAS_TARGETS = new Set(Object.values(TAG_ALIASES));

export type TagInput = {
  name: string;
  count: number;
  source: string;
  source_url: string;
  origin?: "recording" | "artist" | "release";
  confidence?: "high" | "low";
};

export type TagBucket = {
  name: string;
  count: number;
  share: number;
  sources: { source: string; source_url: string }[];
};

export type TagMix = {
  buckets: TagBucket[];
  unmapped: string[];
};

export function canonicalTag(name: string): string | null {
  const normalised = name.toLowerCase().trim();
  if (!normalised || IGNORED_TAGS.has(normalised)) return null;
  return TAG_ALIASES[normalised] ?? normalised;
}

export function tagMix(tracks: { tags: TagInput[] }[], topN = 8): TagMix {
  const counts = new Map<string, { count: number; sources: Map<string, { source: string; source_url: string }> }>();
  const unmapped = new Set<string>();
  for (const track of tracks) {
    const seen = new Set<string>();
    for (const tag of track.tags) {
      if (tag.count < 1) continue;
      const name = canonicalTag(tag.name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const raw = tag.name.toLowerCase().trim();
      if (!TAG_ALIASES[raw] && !ALIAS_TARGETS.has(name)) unmapped.add(name);
      const current = counts.get(name) ?? { count: 0, sources: new Map() };
      current.count += 1;
      current.sources.set(`${tag.source}:${tag.source_url}`, { source: tag.source, source_url: tag.source_url });
      counts.set(name, current);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const head = ranked.slice(0, topN);
  const tail = ranked.slice(topN);
  const otherCount = tail.reduce((sum, entry) => sum + entry[1].count, 0);
  const total = ranked.reduce((sum, entry) => sum + entry[1].count, 0);
  const buckets: TagBucket[] = head.map(([name, value]) => ({
    name,
    count: value.count,
    share: total === 0 ? 0 : value.count / total,
    sources: [...value.sources.values()],
  }));
  if (otherCount > 0) {
    buckets.push({ name: "other", count: otherCount, share: otherCount / total, sources: [] });
  }
  return { buckets, unmapped: [...unmapped].sort() };
}

export function normalisedEntropy(weights: number[]): number {
  const positive = weights.filter((weight) => weight > 0);
  const total = positive.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0 || positive.length <= 1) return 0;
  const entropy = -positive.reduce((sum, weight) => {
    const p = weight / total;
    return sum + p * Math.log(p);
  }, 0);
  return entropy / Math.log(positive.length);
}
