import { fetchJson } from "@/lib/enrich/http";
import { musicbrainzUserAgent } from "@/lib/enrich/limiter";
import { miss, type EnrichTrack, type SourceHit, type TagHit } from "@/lib/enrich/types";

const BASE = "https://musicbrainz.org/ws/2";

type Deps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  wait: () => Promise<void>;
  userAgent?: string;
};

export function parseMusicBrainz(payload: unknown, mode: "isrc" | "search"): SourceHit {
  const recordings = recordingsOf(payload);
  const recording = recordings[0];
  if (!recording) return miss("musicbrainz");
  const score = typeof recording.score === "number" ? recording.score : mode === "isrc" ? 100 : 0;
  if (mode === "search" && score < 80) return miss("musicbrainz");
  const id = typeof recording.id === "string" ? recording.id : null;
  return {
    source: "musicbrainz",
    matched: true,
    confidence: mode === "isrc" ? "high" : "low",
    sourceUrl: id ? `https://musicbrainz.org/recording/${id}` : "https://musicbrainz.org",
    tags: tagsOf(recording),
    bpm: null,
    raw: { id, score },
  };
}

export function createMusicBrainz(deps: Deps) {
  const headers = {
    Accept: "application/json",
    "User-Agent": deps.userAgent ?? musicbrainzUserAgent(),
  };
  return {
    name: "musicbrainz" as const,
    async lookup(track: EnrichTrack): Promise<SourceHit> {
      if (track.isrc) {
        await deps.wait();
        const payload = await fetchJson(
          `${BASE}/isrc/${encodeURIComponent(track.isrc)}?inc=tags+artist-credits&fmt=json`,
          headers,
          deps,
        );
        const hit = parseMusicBrainz(payload, "isrc");
        if (hit.matched) return hit;
      }
      await deps.wait();
      const artist = track.artists[0] ?? "";
      const query = `recording:"${track.name}" AND artist:"${artist}"`;
      const payload = await fetchJson(
        `${BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`,
        headers,
        deps,
      );
      return parseMusicBrainz(payload, "search");
    },
  };
}

function recordingsOf(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const recordings = (payload as { recordings?: unknown }).recordings;
  return Array.isArray(recordings) ? recordings.filter((item) => item && typeof item === "object") : [];
}

function tagsOf(recording: Record<string, unknown>): TagHit[] {
  if (!Array.isArray(recording.tags)) return [];
  return recording.tags.flatMap((tag) => {
    if (!tag || typeof tag !== "object" || typeof (tag as { name?: unknown }).name !== "string") return [];
    const name = (tag as { name: string }).name;
    const count = typeof (tag as { count?: unknown }).count === "number" ? (tag as { count: number }).count : 0;
    return [{ name: name.toLowerCase().trim(), original: name, count }];
  });
}
