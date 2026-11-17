import { describe, expect, it, vi } from "vitest";
import { runIngest } from "@/lib/ingest/run";
import {
  emptyCounts,
  type IngestStore,
  type RunRecord,
} from "@/lib/ingest/types";
import { SpotifyApiError } from "@/lib/spotify/http";
import {
  recentlyPlayedPayload,
  topArtistsPayload,
  topTracksPayload,
} from "@/lib/spotify/fixtures";
import type { ListeningClient } from "@/lib/spotify/client";
import type { PlayRow, TopRow, TrackRow } from "@/lib/spotify/normalise";
import { type Term } from "@/lib/stream/events";

function memoryStore(): IngestStore & {
  plays: Map<string, PlayRow>;
  tracks: Map<string, TrackRow>;
  runs: RunRecord[];
} {
  const runs: RunRecord[] = [];
  const tracks = new Map<string, TrackRow>();
  const plays = new Map<string, PlayRow>();
  const tops = new Map<string, TopRow>();
  let seq = 0;
  const store: IngestStore & {
    plays: Map<string, PlayRow>;
    tracks: Map<string, TrackRow>;
    runs: RunRecord[];
  } = {
    plays,
    tracks,
    runs,
    async resumeOrCreate(userId, now) {
      const latest = [...runs].reverse().find((run) => run.user_id === userId);
      if (latest && latest.stage === "ingest" && latest.status !== "complete") {
        latest.status = "running";
        latest.error = null;
        return latest;
      }
      const run: RunRecord = {
        id: `run-${++seq}`,
        user_id: userId,
        status: "running",
        stage: "ingest",
        started_at: now,
        finished_at: null,
        counts: emptyCounts(),
        error: null,
        checkpoint: {},
      };
      runs.push(run);
      return run;
    },
    async save(run) {
      const index = runs.findIndex((item) => item.id === run.id);
      if (index >= 0) runs[index] = run;
    },
    async upsertArtists() {},
    async upsertTracks(rows) {
      for (const track of rows) tracks.set(track.spotify_id, track);
    },
    async upsertPlays(userId, rows) {
      for (const play of rows) {
        plays.set(`${userId}|${play.track.spotify_id}|${play.played_at}`, play);
      }
    },
    async replaceTop(userId, kind, timeRange, rows) {
      for (const key of [...tops.keys()]) {
        if (key.startsWith(`${userId}|${kind}|${timeRange}|`)) tops.delete(key);
      }
      for (const row of rows) {
        const id = row.track?.spotify_id ?? row.artist?.spotify_id ?? "";
        tops.set(`${userId}|${kind}|${timeRange}|${id}`, row);
      }
    },
  };
  return store;
}

function client(
  extra?: Partial<ListeningClient>
): ListeningClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async recentlyPlayed() {
      calls.push("recent");
      return recentlyPlayedPayload;
    },
    async topTracks(term: Term) {
      calls.push(`tracks:${term}`);
      return topTracksPayload;
    },
    async topArtists(term: Term) {
      calls.push(`artists:${term}`);
      return topArtistsPayload;
    },
    ...extra,
  };
}

describe("runIngest", () => {
  it("stores the history and finishes the run", async () => {
    const store = memoryStore();
    const run = await runIngest({ userId: "user-1", store, client: client() });
    expect(run.status).toBe("complete");
    expect(run.stage).toBe("ingest");
    expect(store.plays.size).toBe(3);
    expect(store.tracks.size).toBeGreaterThan(0);
  });

  it("does not duplicate rows when ingestion runs twice", async () => {
    const store = memoryStore();
    const listening = client();
    await runIngest({ userId: "user-1", store, client: listening });
    await runIngest({ userId: "user-1", store, client: listening });
    expect(store.plays.size).toBe(3);
    expect(store.tracks.size).toBe(2);
    expect(store.runs.filter((run) => run.status === "complete")).toHaveLength(
      2
    );
  });

  it("resumes a killed run without refetching the plays already saved", async () => {
    const store = memoryStore();
    const listening = client();
    listening.topTracks = async () => {
      listening.calls.push("tracks:boom");
      throw new SpotifyApiError(503, "server", "Spotify was unavailable");
    };
    const first = await runIngest({
      userId: "user-1",
      store,
      client: listening,
    });
    expect(first.status).toBe("error");
    expect(first.checkpoint.recently_played).toBe(true);
    expect(store.plays.size).toBe(3);

    const resumed = client();
    const second = await runIngest({
      userId: "user-1",
      store,
      client: resumed,
    });
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("complete");
    expect(second.stage).toBe("ingest");
    expect(resumed.calls.includes("recent")).toBe(false);
    expect(second.error).toBeNull();
    expect(store.plays.size).toBe(3);
  });

  it("stores one track at a time and stays running when the workflow continues", async () => {
    const store = memoryStore();
    const batches: number[] = [];
    const persist = store.upsertTracks.bind(store);
    store.upsertTracks = async (rows) => {
      batches.push(rows.length);
      await persist(rows);
    };
    const run = await runIngest({
      userId: "user-1",
      store,
      client: client(),
      stayRunning: true,
    });
    expect(run.status).toBe("running");
    expect(run.stage).toBe("ingest");
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every((size) => size === 1)).toBe(true);
  });

  it("records not_allowlisted when Spotify returns 403", async () => {
    const listening = client();
    listening.recentlyPlayed = async () => {
      throw new SpotifyApiError(
        403,
        "not_allowlisted",
        "Spotify refused this account"
      );
    };
    const run = await runIngest({
      userId: "user-1",
      store: memoryStore(),
      client: listening,
    });
    expect(run.status).toBe("error");
    expect(run.error).toBe("not_allowlisted");
  });

  it("logs duration and per-endpoint counts for the caller only", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const store = memoryStore();
    await runIngest({
      userId: "user-9",
      store,
      client: client(),
      now: (() => {
        let tick = 1_000;
        return () => (tick += 50);
      })(),
    });
    const finished = spy.mock.calls
      .map((call) => JSON.parse(String(call[0])))
      .find((row) => row.event === "ingest.finished");
    expect(finished.user_id).toBe("user-9");
    expect(finished.duration_ms).toBeGreaterThan(0);
    expect(finished.counts.recently_played).toBe(3);
    expect(finished.counts.top_tracks.short_term).toBe(2);
    expect(finished.counts.top_artists.long_term).toBe(1);
    spy.mockRestore();
  });
});
