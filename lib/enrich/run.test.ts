import { describe, expect, it, vi } from "vitest";
import { runEnrich, type EnrichStore } from "@/lib/enrich/run";
import type { CacheRow, EnrichTrack, SourceHit } from "@/lib/enrich/types";
import { emptyCounts, type RunRecord } from "@/lib/ingest/types";
import { miss } from "@/lib/enrich/types";
import type { StreamEvent } from "@/lib/stream/events";

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

function store(): EnrichStore & { cache: Map<string, CacheRow>; run: RunRecord } {
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

describe("runEnrich", () => {
  it("caches matches, skips them on the next run, and can resume the rest", async () => {
    const saved = store();
    let mbCalls = 0;
    const musicbrainz = {
      name: "musicbrainz" as const,
      lookup: async (): Promise<SourceHit> => {
        mbCalls += 1;
        return {
          source: "musicbrainz",
          matched: true,
          confidence: "high",
          sourceUrl: "https://musicbrainz.org/recording/abc",
          tags: [{ name: "pop", original: "pop", count: 1 }],
          bpm: null,
          raw: {},
        };
      },
    };
    const deezer = { name: "deezer" as const, lookup: async () => hit(120) };
    const firstEvents: StreamEvent[] = [];
    await runEnrich({
      userId: "user-1",
      store: saved,
      musicbrainz,
      deezer,
      emit: (event) => firstEvents.push(event),
      maxTracks: 1,
      now: () => Date.parse("2026-11-13T01:00:00.000Z"),
    });
    expect(firstEvents[0]).toEqual({ type: "stage", stage: "enrich" });
    expect(saved.run.stage).toBe("enrich");
    expect(saved.run.status).toBe("running");
    expect(firstEvents.some((event) => event.type === "done")).toBe(false);
    expect(mbCalls).toBe(1);

    const secondEvents: StreamEvent[] = [];
    await runEnrich({
      userId: "user-1",
      store: saved,
      musicbrainz,
      deezer,
      emit: (event) => secondEvents.push(event),
      now: () => Date.parse("2026-11-13T01:05:00.000Z"),
    });
    expect(mbCalls).toBe(2);
    expect(saved.run.status).toBe("complete");
    expect(saved.run.checkpoint.enrich).toBe(true);
    expect(secondEvents.filter((event) => event.type === "enrich_result")).toHaveLength(2);
    expect(secondEvents.at(-1)).toEqual({ type: "done", stage: "enrich" });
  });

  it("makes no external calls when every track is cached", async () => {
    const saved = store();
    const musicbrainz = { name: "musicbrainz" as const, lookup: vi.fn(async () => miss("musicbrainz")) };
    const deezer = { name: "deezer" as const, lookup: vi.fn(async () => hit(100)) };
    await runEnrich({ userId: "user-1", store: saved, musicbrainz, deezer, emit: () => {} });
    musicbrainz.lookup.mockClear();
    deezer.lookup.mockClear();
    await runEnrich({ userId: "user-1", store: saved, musicbrainz, deezer, emit: () => {} });
    expect(musicbrainz.lookup).not.toHaveBeenCalled();
    expect(deezer.lookup).not.toHaveBeenCalled();
  });

  it("keeps the other source when MusicBrainz is down and does not stream a total miss", async () => {
    const saved = store();
    const events: StreamEvent[] = [];
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
        lookup: async (track) => (track.spotify_id === "t1" ? hit(90) : miss("deezer")),
      },
      emit: (event) => events.push(event),
    });
    const results = events.filter((event) => event.type === "enrich_result");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "t1", failures: ["musicbrainz"] });
    expect([...saved.cache.values()].filter((row) => row.matched)).toHaveLength(1);
    expect([...saved.cache.values()].filter((row) => !row.matched)[0]?.expires_at).not.toBeNull();
  });

  it("starts the Deezer lookup without waiting for MusicBrainz", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let deezerStarted = false;
    const saved = store();
    const task = runEnrich({
      userId: "user-1",
      store: saved,
      maxTracks: 1,
      musicbrainz: {
        name: "musicbrainz",
        lookup: () => gate.then(() => ({
          source: "musicbrainz" as const,
          matched: true,
          confidence: "high" as const,
          sourceUrl: "https://musicbrainz.org/recording/abc",
          tags: [],
          bpm: null,
          raw: {},
        })),
      },
      deezer: {
        name: "deezer",
        lookup: async () => {
          deezerStarted = true;
          return hit(100);
        },
      },
      emit: () => undefined,
    });
    try {
      for (let i = 0; i < 20 && !deezerStarted; i += 1) await Promise.resolve();
      expect(deezerStarted).toBe(true);
    } finally {
      release();
      await task;
    }
  });
});
