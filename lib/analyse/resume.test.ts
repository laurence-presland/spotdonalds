import { describe, expect, it } from "vitest";
import { decideClaim, isHeartbeatStale, nextPipelineStep } from "@/lib/analyse/progress";
import { initialAnalysingState, reduceAnalysis } from "@/lib/analysing/reduce";
import { emptyCounts, type RunRecord } from "@/lib/ingest/types";
import { runOrder, type OrderStore, type StoredOrder } from "@/lib/order/run";

describe("analysis resume", () => {
  it("attaches to the running run instead of inserting another", () => {
    const running = { status: "running", stage: "profile", open: true };
    expect(decideClaim(running, false)).toBe("attach");
    expect(decideClaim(running, true)).toBe("attach");
    expect(decideClaim(null, false)).toBe("insert");
    expect(decideClaim({ status: "error", stage: "profile", open: false }, false)).toBe("idle");
    expect(decideClaim({ status: "error", stage: "profile", open: false }, true)).toBe("reopen");
    expect(decideClaim({ status: "complete", stage: "done", open: false }, false)).toBe("finished");
  });

  it("stops after a failed profile and does not continue to the order", () => {
    const failed = { status: "error", stage: "profile", checkpoint: { enrich: true } };
    const ingested = {
      recently_played: true,
      top_tracks: { short_term: true, medium_term: true, long_term: true },
      top_artists: { short_term: true, medium_term: true, long_term: true },
      enrich: true,
    };
    expect(nextPipelineStep(failed, false)).toBe("stop");
    expect(nextPipelineStep(failed, true)).toBe("stop");
    expect(nextPipelineStep({ status: "running", stage: "profile", checkpoint: ingested }, true)).toBe("popularity");
    expect(nextPipelineStep({ status: "running", stage: "profile", checkpoint: { ...ingested, popularity: true } }, true)).toBe("order");
    expect(nextPipelineStep({ status: "running", stage: "enrich", checkpoint: { ...ingested, enrich: false } }, false)).toBe("enrich");
  });

  it("treats a fresh heartbeat as still working", () => {
    const now = Date.parse("2026-11-13T00:00:30.000Z");
    expect(isHeartbeatStale("2026-11-13T00:00:20.000Z", now)).toBe(false);
    expect(isHeartbeatStale("2026-11-13T00:00:00.000Z", now)).toBe(false);
    expect(isHeartbeatStale("2026-11-12T23:59:00.000Z", now)).toBe(true);
    expect(isHeartbeatStale(null, now)).toBe(true);
  });

  it("shows the stored stage when a refresh finds the run in progress", () => {
    const state = reduceAnalysis(initialAnalysingState, {
      type: "snapshot",
      run: {
        status: "running",
        stage: "profile",
        error: null,
        progress: { done: 12, total: 30 },
      },
    });
    expect(state.stage).toBe("taste");
    expect(state.progressDone).toBe(12);
    expect(state.progressTotal).toBe(30);
    expect(state.status).toBe("streaming");
  });

  it("does not call the order model when the run is already an error", async () => {
    let calls = 0;
    const run: RunRecord = {
      id: "run-1",
      user_id: "user-1",
      status: "error",
      stage: "profile",
      started_at: "2026-11-13T00:00:00.000Z",
      finished_at: null,
      counts: emptyCounts(),
      error: "Quoted number 5 does not match a cited signal",
      checkpoint: { enrich: true },
    };
    const store = {
      async latestRun() {
        return run;
      },
      async saveRun() {
        throw new Error("should not save");
      },
      async getProfile() {
        return null;
      },
      async getOrder() {
        return null;
      },
      async saveOrder() {
        throw new Error("should not save");
      },
      async deleteOrder() {
        return undefined;
      },
      async getPopularity() {
        return null;
      },
      async savePopularity() {
        throw new Error("should not save");
      },
    } as OrderStore;
    await expect(runOrder({
      userId: "user-1",
      store,
      complete: async () => {
        calls += 1;
        return { object: {} };
      },
      emit: () => undefined,
    })).rejects.toThrow(/Quoted number 5/);
    expect(calls).toBe(0);
  });

  it("marks the run finished when the order is already stored", async () => {
    const run: RunRecord = {
      id: "run-1",
      user_id: "user-1",
      status: "running",
      stage: "profile",
      started_at: "2026-11-13T00:00:00.000Z",
      finished_at: null,
      counts: emptyCounts(),
      error: null,
      checkpoint: { enrich: true },
    };
    const saved: { run: RunRecord | null } = { run: null };
    await runOrder({
      userId: "user-1",
      store: {
        async latestRun() {
          return saved.run ?? run;
        },
        async saveRun(next) {
          saved.run = next;
        },
        async getProfile() {
          return null;
        },
        async getOrder() {
          return { run_id: run.id } as StoredOrder;
        },
        async saveOrder() {
          throw new Error("should not save");
        },
        async deleteOrder() {
          return undefined;
        },
        async getPopularity() {
          return null;
        },
        async savePopularity() {
          throw new Error("should not save");
        },
      },
      complete: async () => {
        throw new Error("should not call the model");
      },
      emit: () => undefined,
    });
    expect(saved.run?.stage).toBe("done");
    expect(saved.run?.status).toBe("complete");
    expect(saved.run?.finished_at).not.toBeNull();
    expect(saved.run?.error).toBeNull();
  });
});
