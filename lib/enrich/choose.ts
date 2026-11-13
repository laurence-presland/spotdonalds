import type { ChosenEnrichment, SourceHit, SourceName, TagHit } from "@/lib/enrich/types";

export function normaliseTag(original: string, count: number): TagHit {
  return { original, name: original.toLowerCase().trim(), count };
}

export function chooseEnrichment(
  musicbrainz: SourceHit,
  deezer: SourceHit,
  fetchedAt: string,
): ChosenEnrichment | null {
  if (!musicbrainz.matched && !deezer.matched) return null;
  const failures: SourceName[] = [];
  if (musicbrainz.error) failures.push("musicbrainz");
  if (deezer.error) failures.push("deezer");
  const tags = musicbrainz.matched
    ? musicbrainz.tags
        .map((tag) => normaliseTag(tag.original || tag.name, tag.count))
        .filter((tag) => tag.name.length > 0)
        .map((tag) => ({
          ...tag,
          provenance: {
            value: tag.name,
            source: "musicbrainz" as const,
            source_url: musicbrainz.sourceUrl ?? "https://musicbrainz.org",
            confidence: musicbrainz.confidence,
            fetched_at: fetchedAt,
          },
        }))
    : [];
  const bpmValue = deezer.matched && deezer.bpm != null && deezer.bpm > 0 ? deezer.bpm : null;
  return {
    matched: true,
    confidence: [musicbrainz, deezer].some((hit) => hit.matched && hit.confidence === "high") ? "high" : "low",
    tags,
    bpm: bpmValue == null
      ? null
      : {
          value: bpmValue,
          source: "deezer",
          source_url: deezer.sourceUrl ?? "https://www.deezer.com",
          confidence: deezer.confidence,
          fetched_at: fetchedAt,
        },
    failures,
  };
}
