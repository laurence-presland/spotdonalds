import { fetchJson } from "@/lib/enrich/http";
import { miss, type EnrichTrack, type SourceHit } from "@/lib/enrich/types";

type Deps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
};

export function parseDeezerTrack(payload: unknown, mode: "isrc" | "search"): SourceHit {
  if (!payload || typeof payload !== "object") return miss("deezer");
  const record = payload as { id?: unknown; bpm?: unknown; error?: unknown };
  if (record.error || typeof record.id !== "number") return miss("deezer");
  const bpm = typeof record.bpm === "number" && record.bpm > 0 ? record.bpm : null;
  return {
    source: "deezer",
    matched: true,
    confidence: mode === "isrc" ? "high" : "low",
    sourceUrl: `https://www.deezer.com/track/${record.id}`,
    tags: [],
    bpm,
    raw: { id: record.id, bpm: record.bpm ?? null },
  };
}

export function createDeezer(deps: Deps) {
  return {
    name: "deezer" as const,
    async lookup(track: EnrichTrack): Promise<SourceHit> {
      if (track.isrc) {
        const payload = await fetchJson(
          `https://api.deezer.com/track/isrc:${encodeURIComponent(track.isrc)}`,
          { Accept: "application/json" },
          deps,
        );
        const hit = parseDeezerTrack(payload, "isrc");
        if (hit.matched) return hit;
      }
      const artist = track.artists[0] ?? "";
      const query = `artist:"${artist}" track:"${track.name}"`;
      const payload = await fetchJson(
        `https://api.deezer.com/search?q=${encodeURIComponent(query)}`,
        { Accept: "application/json" },
        deps,
      );
      const data = (payload as { data?: unknown }).data;
      const first = Array.isArray(data) ? data[0] : null;
      return parseDeezerTrack(first, "search");
    },
  };
}
