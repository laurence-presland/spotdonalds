import { describe, expect, it } from "vitest";
import { pullSpotifyCatalogue } from "@/lib/ingest/catalogue";
import {
  emptyCounts,
  type IngestCheckpoint,
  type RunRecord,
} from "@/lib/ingest/types";

const NOW = "2026-11-13T14:10:00.000Z";

function sources(): IngestCheckpoint {
  return {
    recently_played: true,
    top_tracks: { short_term: true, medium_term: true, long_term: true },
    top_artists: { short_term: true, medium_term: true, long_term: true },
  };
}

function run(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-1",
    user_id: "user-1",
    status: "running",
    stage: "ingest",
    started_at: "2026-11-13T14:00:00.000Z",
    finished_at: null,
    counts: emptyCounts(),
    error: null,
    checkpoint: {},
    open: true,
    ...partial,
  };
}

function harness(
  initial: RunRecord,
  options: { count: number; after?: number }
) {
  let current = initial;
  let count = options.count;
  const calls: string[] = [];
  const deps = {
    now: () => NOW,
    async load() {
      return current;
    },
    async save(next: RunRecord) {
      current = next;
    },
    async countTracks() {
      return count;
    },
    async ingest() {
      calls.push("ingest");
      count = options.after ?? count;
      current = {
        ...current,
        checkpoint: { ...sources(), ...current.checkpoint, track_count: count },
      };
    },
  };
  return {
    deps,
    calls,
    get current() {
      return current;
    },
  };
}

describe("pullSpotifyCatalogue", () => {
  it("skips Spotify when 50 tracks are already stored", async () => {
    const store = harness(run(), { count: 50 });
    await expect(
      pullSpotifyCatalogue("user-1", "run-1", store.deps)
    ).resolves.toBe("continue");
    expect(store.calls).toEqual([]);
    expect(store.current).toMatchObject({
      status: "running",
      stage: "ingest",
      checkpoint: { track_count: 50 },
    });
  });

  it("fetches when the catalogue is short and continues once it reaches 50", async () => {
    const store = harness(run(), { count: 12, after: 64 });
    await expect(
      pullSpotifyCatalogue("user-1", "run-1", store.deps)
    ).resolves.toBe("continue");
    expect(store.calls).toEqual(["ingest"]);
    expect(store.current).toMatchObject({
      status: "running",
      checkpoint: { track_count: 64 },
    });
  });

  it("ends insufficient_data without fetching when the sources are already stored", async () => {
    const store = harness(run({ checkpoint: sources() }), { count: 12 });
    await expect(
      pullSpotifyCatalogue("user-1", "run-1", store.deps)
    ).resolves.toBe("stop");
    expect(store.calls).toEqual([]);
    expect(store.current).toMatchObject({
      status: "complete",
      stage: "done",
      outcome: "insufficient_data",
      open: false,
      finished_at: NOW,
      checkpoint: { track_count: 12 },
    });
  });

  it("ends insufficient_data when the fetch still cannot reach 50", async () => {
    const store = harness(run(), { count: 4, after: 18 });
    await expect(
      pullSpotifyCatalogue("user-1", "run-1", store.deps)
    ).resolves.toBe("stop");
    expect(store.calls).toEqual(["ingest"]);
    expect(store.current).toMatchObject({
      outcome: "insufficient_data",
      stage: "done",
      status: "complete",
      checkpoint: { track_count: 18 },
    });
  });
});
