import { describe, expect, it } from "vitest";
import { handleAnalysisDelivery, recoveryIdempotencyKey, stageIdempotencyKey, staleDecision } from "@/lib/analyse/queue";
import { WORKER_STALE_MS } from "@/lib/analyse/machine";
import { emptyCounts, type RunRecord } from "@/lib/ingest/types";

const NOW = "2026-11-13T14:10:00.000Z";
const NOW_MS = Date.parse(NOW);

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
    checkpoint: {
      recently_played: true,
      top_tracks: { short_term: true, medium_term: true, long_term: true },
      top_artists: { short_term: true, medium_term: true, long_term: true },
      track_count: 80,
    },
    open: true,
    heartbeat_at: NOW,
    attempts: 1,
    ...partial,
  };
}

describe("analysis queue", () => {
  it("keeps one idempotency key per stage attempt, and a different key per stale heartbeat", () => {
    expect(stageIdempotencyKey("run-1", "profile", 1)).toBe("run-1:profile:1");
    expect(stageIdempotencyKey("run-1", "profile", 1)).toBe(stageIdempotencyKey("run-1", "profile", 1));
    expect(recoveryIdempotencyKey("run-1", "profile", 1, "2026-11-13T14:00:00.000Z")).toBe(
      recoveryIdempotencyKey("run-1", "profile", 1, "2026-11-13T14:00:00.000Z"),
    );
    expect(recoveryIdempotencyKey("run-1", "profile", 1, "2026-11-13T14:00:00.000Z")).not.toBe(
      recoveryIdempotencyKey("run-1", "profile", 1, "2026-11-13T14:07:00.000Z"),
    );
  });

  it("re-drives a stale run once, then closes it if that recovery goes quiet", () => {
    const stale = run({
      stage: "profile",
      heartbeat_at: new Date(NOW_MS - WORKER_STALE_MS - 1_000).toISOString(),
      checkpoint: { ...run().checkpoint, enrich: true },
    });
    expect(staleDecision(stale, NOW_MS)).toBe("recover");
    const waiting = { ...stale, checkpoint: { ...stale.checkpoint, recovery_at: new Date(NOW_MS - 30_000).toISOString() } };
    expect(staleDecision(waiting, NOW_MS)).toBe("wait");
    const abandoned = {
      ...stale,
      checkpoint: { ...stale.checkpoint, recovery_at: new Date(NOW_MS - WORKER_STALE_MS - 1_000).toISOString() },
    };
    expect(staleDecision(abandoned, NOW_MS)).toBe("close");
    expect(staleDecision(run({ heartbeat_at: NOW }), NOW_MS)).toBe("alive");
  });

  it("enqueues the next unfinished stage and does not call a later one when the catalogue is short", async () => {
    const enqueued: string[] = [];
    const saved: RunRecord[] = [];
    await handleAnalysisDelivery({
      message: { userId: "user-1", runId: "run-1", stage: "ingest" },
      messageId: "msg-1",
      deliveryCount: 1,
      now: NOW,
      perform: async () => "continue",
      load: async () => ({ run: run({ stage: "ingest" }), artifacts: { profile: false, popularity: false, order: false } }),
      enqueue: async (message) => {
        enqueued.push(message.stage);
      },
      save: async (next) => {
        saved.push(next);
      },
      fail: async () => {
        throw new Error("should not fail");
      },
    });
    expect(enqueued).toEqual(["enrich"]);
    expect(saved).toHaveLength(0);

    enqueued.length = 0;
    await handleAnalysisDelivery({
      message: { userId: "user-1", runId: "run-1", stage: "enrich" },
      messageId: "msg-2",
      deliveryCount: 1,
      now: NOW,
      perform: async () => "continue",
      load: async () => ({
        run: run({ stage: "enrich", checkpoint: { ...run().checkpoint, track_count: 12 } }),
        artifacts: { profile: false, popularity: false, order: false },
      }),
      enqueue: async (message) => {
        enqueued.push(message.stage);
      },
      save: async (next) => {
        saved.push(next);
      },
      fail: async () => {
        throw new Error("should not fail");
      },
    });
    expect(enqueued).toEqual([]);
    expect(saved.at(-1)).toMatchObject({ outcome: "insufficient_data", status: "complete", stage: "done" });
  });

  it("retries a thrown stage, and records the error on the last delivery", async () => {
    await expect(handleAnalysisDelivery({
      message: { userId: "user-1", runId: "run-1", stage: "profile" },
      messageId: "msg-3",
      deliveryCount: 1,
      perform: async () => {
        throw new Error("model timed out");
      },
      load: async () => null,
      enqueue: async () => undefined,
      save: async () => undefined,
      fail: async () => {
        throw new Error("too early");
      },
    })).rejects.toThrow("model timed out");

    const failures: string[] = [];
    await handleAnalysisDelivery({
      message: { userId: "user-1", runId: "run-1", stage: "profile" },
      messageId: "msg-4",
      deliveryCount: 3,
      perform: async () => {
        throw new Error("model timed out");
      },
      load: async () => null,
      enqueue: async () => undefined,
      save: async () => undefined,
      fail: async (_runId, _userId, message) => {
        failures.push(message);
      },
    });
    expect(failures).toEqual(["model timed out"]);
  });
});
