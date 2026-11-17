import { describe, expect, it, vi } from "vitest";
import { runEnrich, type EnrichStore } from "@/lib/enrich/run";
import type { CacheRow, EnrichTrack, SourceHit } from "@/lib/enrich/types";
import { emptyCounts, type RunRecord } from "@/lib/ingest/types";
import { miss } from "@/lib/enrich/types";

const tracks: EnrichTrack[] = [
  {
    spotify_id: "t1",
    isrc: "AAA",
    name: "One",
    artists: ["Ada"],
    album_name: "A",
    album_image_url: null,
  },
  {
    spotify_id: "t2",
    isrc: "BBB",
    name: "Two",
    artists: ["Bea"],
    album_name: null,
    album_image_url: null,
  },
];

function store(): EnrichStore & {
  cache: Map<string, CacheRow>;
  run: RunRecord;
} {
  const cache = new Map<string, CacheRow>();
  const run: RunRecord = {
    id: "run-1",
    user_id: "user-1",
    status: "complete",
    stage: "ingest",
    started_at: "2026-11-13T00:00:00.000Z",
    finished_at: null,
    counts: emptyCounts(),
    error: null,
    checkpoint: { recently_played: true },
  };
  return {
    cache,
    run,
    async latestRun() {
      return run;
    },
    async saveRun(next) {
      Object.assign(run, next);
    },
    async listTracks() {
      return tracks;
    },
    async getCache(key) {
      return cache.get(key) ?? null;
    },
    async saveCache(row) {
      cache.set(row.cache_key, row);
    },
  };
}

function hit(bpm: number | null): SourceHit {
  return {
    source: "deezer",
    matched: true,
    confidence: "high",
    sourceUrl: "https://www.deezer.com/track/1",
    tags: [],
    bpm,
    raw: {},
  };
}

function musicbrainzHit(): SourceHit {
  return {
    source: "musicbrainz",
    matched: true,
    confidence: "high",
    sourceUrl: "https://musicbrainz.org/recording/abc",
    tags: [{ name: "pop", original: "pop", count: 1 }],
    bpm: null,
    raw: {},
  };
}

describe("runEnrich", () => {
  it("looks up each track once, then skips a finished enrich", async () => {
    const saved = store();
    let mbCalls = 0;
    const musicbrainz = {
      name: "musicbrainz" as const,
      lookup: async (): Promise<SourceHit> => {
        mbCalls += 1;
        return musicbrainzHit();
      },
    };
    const deezer = { name: "deezer" as const, lookup: async () => hit(120) };
    await runEnrich({
      userId: "user-1",
      store: saved,
      musicbrainz,
      deezer,
      now: () => Date.parse("2026-11-13T01:00:00.000Z"),
    });
    expect(saved.run.stage).toBe("enrich");
    expect(saved.run.status).toBe("running");
    expect(saved.run.checkpoint.enrich).toBe(true);
    expect(mbCalls).toBe(2);
    expect(saved.cache.size).toBe(2);

    await runEnrich({
      userId: "user-1",
      store: saved,
      musicbrainz,
      deezer,
      now: () => Date.parse("2026-11-13T01:05:00.000Z"),
    });
    expect(mbCalls).toBe(2);
  });

  it("skips a fresh cache row and looks up the rest", async () => {
    const saved = store();
    saved.cache.set("isrc:AAA", {
      cache_key: "isrc:AAA",
      spotify_track_id: "t1",
      isrc: "AAA",
      matched: true,
      tags: [],
      bpm: 100,
      fields: null,
      raw: {},
      confidence: "high",
      fetched_at: "2026-11-13T00:00:00.000Z",
      expires_at: null,
    });
    const musicbrainz = {
      name: "musicbrainz" as const,
      lookup: vi.fn(async () => musicbrainzHit()),
    };
    const deezer = {
      name: "deezer" as const,
      lookup: vi.fn(async () => hit(100)),
    };
    await runEnrich({ userId: "user-1", store: saved, musicbrainz, deezer });
    expect(musicbrainz.lookup).toHaveBeenCalledOnce();
    expect(deezer.lookup).toHaveBeenCalledOnce();
    expect(musicbrainz.lookup).toHaveBeenCalledWith(
      expect.objectContaining({ spotify_id: "t2" })
    );
  });

  it("keeps a Deezer match when MusicBrainz throws, and expires that row", async () => {
    const saved = store();
    const now = Date.parse("2026-11-13T01:00:00.000Z");
    await runEnrich({
      userId: "user-1",
      store: saved,
      musicbrainz: {
        name: "musicbrainz",
        lookup: async () => {
          throw new Error("503");
        },
      },
      deezer: {
        name: "deezer",
        lookup: async (track) =>
          track.spotify_id === "t1" ? hit(90) : miss("deezer"),
      },
      now: () => now,
    });
    const matched = [...saved.cache.values()].filter((row) => row.matched);
    const missed = [...saved.cache.values()].filter((row) => !row.matched);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.spotify_track_id).toBe("t1");
    expect(matched[0]?.expires_at).toBe(
      new Date(now + 60 * 60 * 1000).toISOString()
    );
    expect(missed[0]?.expires_at).not.toBeNull();
  });

  it("looks up an errored row again after it expires", async () => {
    const saved = store();
    const now = Date.parse("2026-11-13T01:00:00.000Z");
    const musicbrainz = {
      name: "musicbrainz" as const,
      lookup: vi.fn(async () => {
        throw new Error("400");
      }),
    };
    const deezer = {
      name: "deezer" as const,
      lookup: vi.fn(async () => hit(90)),
    };
    await runEnrich({
      userId: "user-1",
      store: saved,
      musicbrainz,
      deezer,
      now: () => now,
    });
    saved.run.checkpoint.enrich = false;

    musicbrainz.lookup.mockClear();
    deezer.lookup.mockClear();
    await runEnrich({
      userId: "user-1",
      store: saved,
      musicbrainz,
      deezer,
      now: () => now + 30 * 60 * 1000,
    });
    expect(musicbrainz.lookup).not.toHaveBeenCalled();
    expect(deezer.lookup).not.toHaveBeenCalled();

    saved.run.checkpoint.enrich = false;
    await runEnrich({
      userId: "user-1",
      store: saved,
      musicbrainz,
      deezer,
      now: () => now + 60 * 60 * 1000,
    });
    expect(musicbrainz.lookup).toHaveBeenCalledTimes(2);
    expect(deezer.lookup).toHaveBeenCalledTimes(2);
  });
});
