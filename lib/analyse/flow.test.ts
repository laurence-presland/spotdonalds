import { describe, expect, it } from "vitest";
import { runTrackedStep, runUserFlow, type FlowDeps } from "@/lib/analyse/flow";
import { WorkerLost } from "@/lib/analyse/machine";
import { emptyCounts, type IngestCheckpoint, type RunRecord } from "@/lib/ingest/types";

const NOW = "2026-11-13T14:10:00.000Z";

function checkpoint(partial: IngestCheckpoint = {}): IngestCheckpoint {
  return {
    recently_played: true,
    top_tracks: { short_term: true, medium_term: true, long_term: true },
    top_artists: { short_term: true, medium_term: true, long_term: true },
    ...partial,
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
    heartbeat_at: NOW,
    attempts: 0,
    outcome: null,
    ...partial,
  };
}

function harness(initial: RunRecord, options: { count: number; afterIngest?: number; order?: boolean; profile?: boolean; popularity?: boolean }) {
  let current = initial;
  let count = options.count;
  const calls: string[] = [];
  const stages: string[] = [];
  const flags = {
    profile: options.profile ?? false,
    popularity: options.popularity ?? false,
    order: options.order ?? false,
  };
  const deps: FlowDeps = {
    now: () => NOW,
    async load() {
      return { run: current, artifacts: { ...flags } };
    },
    async save(next) {
      current = next;
      stages.push(next.stage);
    },
    async countTracks() {
      return count;
    },
    async ingest() {
      calls.push("ingest");
      count = options.afterIngest ?? count;
      current = { ...current, checkpoint: checkpoint({ ...current.checkpoint, track_count: count }) };
    },
    async enrich() {
      calls.push("enrich");
      current = { ...current, checkpoint: { ...current.checkpoint, enrich: true } };
    },
    async profile() {
      calls.push("profile");
      flags.profile = true;
      current = { ...current, checkpoint: { ...current.checkpoint, profile: true } };
    },
    async popularity() {
      calls.push("popularity");
      flags.popularity = true;
      current = { ...current, checkpoint: { ...current.checkpoint, popularity: true } };
    },
    async order() {
      calls.push("order");
      flags.order = true;
    },
    async fail(_userId, _runId, message) {
      current = { ...current, status: "error", error: message, open: false, finished_at: NOW, attempts: (current.attempts ?? 0) + 1 };
    },
  };
  return {
    deps,
    calls,
    stages,
    get current() {
      return current;
    },
  };
}

describe("analysis flow", () => {
  it("finishes the run when every step is already stored", async () => {
    const store = harness(
      run({
        stage: "profile",
        checkpoint: checkpoint({ enrich: true, profile: true, popularity: true, track_count: 80 }),
      }),
      { count: 80, profile: true, popularity: true, order: true },
    );
    await runUserFlow(store.deps, "user-1", "run-1");
    expect(store.calls).toEqual([]);
    expect(store.stages).toEqual(expect.arrayContaining(["ingest", "analyse", "done"]));
    expect(store.stages).not.toContain("enrich");
    expect(store.current).toMatchObject({
      status: "complete",
      stage: "done",
      outcome: "ready",
      open: false,
      finished_at: NOW,
      error: null,
    });
  });

  it("skips Spotify when 50 tracks are already stored, then enriches", async () => {
    const store = harness(run(), { count: 50 });
    await runUserFlow(store.deps, "user-1", "run-1");
    expect(store.calls[0]).toBe("enrich");
    expect(store.calls).not.toContain("ingest");
    expect(store.current).toMatchObject({ status: "complete", stage: "done", outcome: "ready", checkpoint: { track_count: 50 } });
  });

  it("fetches when the catalogue is short and then enriches once it reaches 50", async () => {
    const store = harness(run(), { count: 12, afterIngest: 64 });
    await runUserFlow(store.deps, "user-1", "run-1");
    expect(store.calls.slice(0, 2)).toEqual(["ingest", "enrich"]);
    expect(store.current).toMatchObject({ status: "complete", stage: "done", outcome: "ready" });
  });

  it("ends insufficient_data without enrich when the sources cannot reach 50", async () => {
    const exhausted = harness(run({ checkpoint: checkpoint({ track_count: 12 }) }), { count: 12 });
    await runUserFlow(exhausted.deps, "user-1", "run-1");
    expect(exhausted.calls).toEqual([]);
    expect(exhausted.current).toMatchObject({
      status: "complete",
      stage: "done",
      outcome: "insufficient_data",
      open: false,
      checkpoint: { track_count: 12 },
    });

    const fetched = harness(run(), { count: 4, afterIngest: 18 });
    await runUserFlow(fetched.deps, "user-1", "run-1");
    expect(fetched.calls).toEqual(["ingest"]);
    expect(fetched.current).toMatchObject({ outcome: "insufficient_data", stage: "done", status: "complete", checkpoint: { track_count: 18 } });
  });

  it("records the error on the last attempt and retries before that", async () => {
    const retry = harness(run({ checkpoint: checkpoint({ track_count: 80 }) }), { count: 80 });
    const again = await runTrackedStep(retry.deps, {
      userId: "user-1",
      runId: "run-1",
      attempt: 1,
      maxAttempts: 3,
      step: "analyse",
      work: async () => {
        throw new Error("model timed out");
      },
    });
    expect(again).toEqual({ type: "retry", message: "model timed out" });
    expect(retry.current.status).toBe("running");

    const last = harness(run({ checkpoint: checkpoint({ track_count: 80 }) }), { count: 80 });
    const failed = await runTrackedStep(last.deps, {
      userId: "user-1",
      runId: "run-1",
      attempt: 3,
      maxAttempts: 3,
      step: "analyse",
      work: async () => {
        throw new Error("model timed out");
      },
    });
    expect(failed).toEqual({ type: "failed", message: "model timed out" });
    expect(last.current).toMatchObject({ status: "error", error: "model timed out", open: false, finished_at: NOW });
  });

  it("fails a Spotify token error on the first attempt without taking the run from another worker", async () => {
    const token = harness(run(), { count: 10 });
    const denied = new Error("reauth_required");
    denied.name = "SpotifyTokenError";
    const failed = await runTrackedStep(token.deps, {
      userId: "user-1",
      runId: "run-1",
      attempt: 1,
      maxAttempts: 3,
      step: "ingest",
      work: async () => {
        throw denied;
      },
    });
    expect(failed).toEqual({ type: "failed", message: "reauth_required" });
    expect(token.current.status).toBe("error");

    const owned = harness(run(), { count: 80 });
    const lost = await runTrackedStep(owned.deps, {
      userId: "user-1",
      runId: "run-1",
      attempt: 1,
      maxAttempts: 3,
      step: "analyse",
      work: async () => {
        throw new WorkerLost();
      },
    });
    expect(lost.type).toBe("lost");
    expect(owned.current.status).toBe("running");
  });
});
