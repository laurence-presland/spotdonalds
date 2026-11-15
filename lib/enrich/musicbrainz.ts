import { fetchJson } from "@/lib/enrich/http";
import { musicbrainzUserAgent } from "@/lib/enrich/limiter";
import { log } from "@/lib/log";
import { miss, type EnrichTrack, type SourceHit, type TagHit, type TagOrigin } from "@/lib/enrich/types";

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
  const sourceUrl = id ? `https://musicbrainz.org/recording/${id}` : "https://musicbrainz.org";
  const confidence = mode === "isrc" ? "high" : "low";
  return {
    source: "musicbrainz",
    matched: true,
    confidence,
    sourceUrl,
    tags: tagsOf(recording, "recording", sourceUrl, confidence),
    bpm: null,
    raw: { id, score, artistId: firstArtistId(recording) },
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
      const isrc = normaliseIsrc(track.isrc);
      if (isrc) {
        await deps.wait();
        try {
          const payload = await fetchJson(
            `${BASE}/isrc/${encodeURIComponent(isrc)}?inc=tags+genres+artist-credits&fmt=json`,
            headers,
            deps,
          );
          const hit = parseMusicBrainz(payload, "isrc");
          if (hit.matched) return fillTags(hit, firstRecording(payload), deps, headers);
        } catch (error) {
          // MusicBrainz returns 404 when it has no recording for that ISRC.
          // A rejected User-Agent is 403, not 404. Fall through to a title search.
          if (!isNotFound(error)) throw error;
          log("info", "enrich.musicbrainz", { isrc, outcome: "not_found" });
        }
      }
      await deps.wait();
      const artist = track.artists[0] ?? "";
      const query = `recording:"${track.name}" AND artist:"${artist}"`;
      const payload = await fetchJson(
        `${BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`,
        headers,
        deps,
      );
      const hit = parseMusicBrainz(payload, "search");
      if (!hit.matched) return hit;
      return fillTags(hit, firstRecording(payload), deps, headers);
    },
  };
}

export function normaliseIsrc(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return /^[A-Z0-9]{12}$/.test(compact) ? compact : null;
}

async function fillTags(
  hit: SourceHit,
  recording: Record<string, unknown> | null,
  deps: Deps,
  headers: Record<string, string>,
): Promise<SourceHit> {
  if (hit.tags.length > 0) return hit;
  const recordingId = recordingIdOf(hit, recording);
  let artistId = recording ? firstArtistId(recording) : rawArtistId(hit);

  if (!artistId && recordingId) {
    await deps.wait();
    try {
      const payload = await fetchJson(
        `${BASE}/recording/${encodeURIComponent(recordingId)}?inc=tags+genres+artist-credits&fmt=json`,
        headers,
        deps,
      );
      const full = asRecord(payload);
      if (full) {
        const sourceUrl = `https://musicbrainz.org/recording/${recordingId}`;
        const tags = tagsOf(full, "recording", sourceUrl, hit.confidence);
        if (tags.length > 0) return { ...hit, tags, sourceUrl: hit.sourceUrl ?? sourceUrl };
        artistId = firstArtistId(full);
      }
    } catch (error) {
      log("info", "enrich.musicbrainz", {
        recording_id: recordingId,
        outcome: "recording_lookup_failed",
        error: messageOf(error),
      });
    }
  }

  if (artistId) {
    await deps.wait();
    try {
      const payload = await fetchJson(
        `${BASE}/artist/${encodeURIComponent(artistId)}?inc=tags+genres&fmt=json`,
        headers,
        deps,
      );
      const artist = asRecord(payload);
      const sourceUrl = `https://musicbrainz.org/artist/${artistId}`;
      const tags = artist ? tagsOf(artist, "artist", sourceUrl, "low") : [];
      if (tags.length > 0) return { ...hit, tags };
    } catch (error) {
      log("info", "enrich.musicbrainz", {
        artist_id: artistId,
        outcome: "artist_lookup_failed",
        error: messageOf(error),
      });
    }
  }

  if (recordingId) {
    await deps.wait();
    try {
      const payload = await fetchJson(
        `${BASE}/release?recording=${encodeURIComponent(recordingId)}&inc=release-groups+tags+genres&fmt=json`,
        headers,
        deps,
      );
      const tags = releaseTags(payload);
      if (tags.length > 0) return { ...hit, tags };
    } catch (error) {
      log("info", "enrich.musicbrainz", {
        recording_id: recordingId,
        outcome: "release_lookup_failed",
        error: messageOf(error),
      });
    }
  }

  return hit;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === "404";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "failed";
}

function recordingsOf(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const recordings = (payload as { recordings?: unknown }).recordings;
  return Array.isArray(recordings) ? recordings.filter((item) => item && typeof item === "object") : [];
}

function firstRecording(payload: unknown): Record<string, unknown> | null {
  return recordingsOf(payload)[0] ?? null;
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

function firstArtistId(recording: Record<string, unknown>): string | null {
  const credits = recording["artist-credit"];
  if (!Array.isArray(credits)) return null;
  const first = credits[0];
  if (!first || typeof first !== "object") return null;
  const artist = (first as { artist?: unknown }).artist;
  if (!artist || typeof artist !== "object") return null;
  const id = (artist as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function recordingIdOf(hit: SourceHit, recording: Record<string, unknown> | null): string | null {
  if (recording && typeof recording.id === "string") return recording.id;
  if (hit.raw && typeof hit.raw === "object" && typeof (hit.raw as { id?: unknown }).id === "string") {
    return (hit.raw as { id: string }).id;
  }
  return null;
}

function rawArtistId(hit: SourceHit): string | null {
  if (!hit.raw || typeof hit.raw !== "object") return null;
  const id = (hit.raw as { artistId?: unknown }).artistId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function tagsOf(
  entity: Record<string, unknown>,
  origin: TagOrigin,
  sourceUrl: string,
  confidence: "high" | "low",
): TagHit[] {
  const collected = new Map<string, TagHit>();
  const add = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const tag of items) {
      if (!tag || typeof tag !== "object" || typeof (tag as { name?: unknown }).name !== "string") continue;
      const original = (tag as { name: string }).name;
      const name = original.toLowerCase().trim();
      if (!name) continue;
      const count = typeof (tag as { count?: unknown }).count === "number" ? (tag as { count: number }).count : 0;
      const existing = collected.get(name);
      if (!existing || count > existing.count) {
        collected.set(name, { name, original, count, origin, confidence, sourceUrl });
      }
    }
  };
  add(entity.tags);
  add(entity.genres);
  return [...collected.values()];
}

function releaseTags(payload: unknown): TagHit[] {
  if (!payload || typeof payload !== "object") return [];
  const releases = (payload as { releases?: unknown }).releases;
  if (!Array.isArray(releases)) return [];
  const fromGroups: TagHit[] = [];
  const fromReleases: TagHit[] = [];
  for (const item of releases) {
    if (!item || typeof item !== "object") continue;
    const release = item as Record<string, unknown>;
    const group = release["release-group"];
    if (group && typeof group === "object") {
      const groupRecord = group as Record<string, unknown>;
      const id = typeof groupRecord.id === "string" ? groupRecord.id : null;
      const sourceUrl = id ? `https://musicbrainz.org/release-group/${id}` : "https://musicbrainz.org";
      fromGroups.push(...tagsOf(groupRecord, "release", sourceUrl, "low"));
    }
    const releaseId = typeof release.id === "string" ? release.id : null;
    const sourceUrl = releaseId ? `https://musicbrainz.org/release/${releaseId}` : "https://musicbrainz.org";
    fromReleases.push(...tagsOf(release, "release", sourceUrl, "low"));
  }
  return mergeTags(fromGroups.length > 0 ? fromGroups : fromReleases);
}

function mergeTags(tags: TagHit[]): TagHit[] {
  const collected = new Map<string, TagHit>();
  for (const tag of tags) {
    const existing = collected.get(tag.name);
    if (!existing || tag.count > existing.count) collected.set(tag.name, tag);
  }
  return [...collected.values()];
}
