import { describe, expect, it } from "vitest";
import { settleAttempt } from "@/lib/analyse/job";
import {
  deadWorkerMessage,
  isDeadWorker,
  ownsRun,
  shouldStartWorker,
  WORKER_STALE_MS,
  type Artifacts,
  type WorkStage,
} from "@/lib/analyse/machine";
import { emptyCounts, type IngestCheckpoint, type RunRecord } from "@/lib/ingest/types";

const NOW = "2026-11-13T14:10:00.000Z";
const NOW_MS = Date.parse(NOW);

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
    ...partial,
  };
}

function memory(initial: RunRecord) {
  let current = initial;
  const calls: WorkStage[] = [];
  return {
    calls,
    get current() {
      return current;
    },
    async reload() {
      return { run: current, artifacts: artifactsFor(current) };
    },
    async save(next: RunRecord) {
      current = next;
    },
    async work(stage: WorkStage, active: RunRecord): Promise<RunRecord> {
      calls.push(stage);
      return { ...current, ...active, stage };
    },
  };
}

function artifactsFor(current: RunRecord, extra: Partial<Artifacts> = {}): Artifacts {
  return {
    profile: Boolean(current.checkpoint.profile),
    popularity: Boolean(current.checkpoint.popularity),
    order: false,
    ...extra,
  };
}

describe("analysis job", () => {
  it("resumes a stage that saved a partial checkpoint and then died", async () => {
    const store = memory(run({
      stage: "enrich",
      checkpoint: checkpoint({ enrich_done: 4, enrich_total: 30 }),
    }));
    store.work = async (stage) => {
      store.calls.push(stage);
      const next = { ...store.current, checkpoint: { ...store.current.checkpoint, enrich_done: 10, enrich_total: 30 } };
      await store.save(next);
      throw new Error("The function was killed");
    };
    const first = await settleAttempt({
      run: store.current,
      artifacts: artifactsFor(store.current),
      requested: "enrich",
      attempt: 1,
      maxAttempts: 3,
      now: NOW,
      reload: store.reload,
      save: store.save,
      work: store.work,
    });
    expect(first.result).toBe("retry");
    expect(store.current.checkpoint.enrich_done).toBe(10);
    expect(store.current.status).toBe("running");
    expect(store.calls).toEqual(["enrich"]);

    store.work = async (stage) => {
      store.calls.push(stage);
      return { ...store.current, checkpoint: { ...store.current.checkpoint, enrich: true } };
    };
    const second = await settleAttempt({
      run: store.current,
      artifacts: artifactsFor(store.current),
      requested: "any",
      attempt: 2,
      maxAttempts: 3,
      now: NOW,
      reload: store.reload,
      save: store.save,
      work: store.work,
    });
    expect(second.result).toBe("continue");
    expect(store.calls).toEqual(["enrich", "enrich"]);
    expect(store.current.checkpoint.enrich).toBe(true);
    expect(store.current.stage).toBe("enrich");
  });

  it("records a timeout on the last attempt and a retry continues that stage", async () => {
    const store = memory(run({
      stage: "profile",
      checkpoint: checkpoint({ enrich: true, profile: false }),
    }));
    store.work = async () => {
      store.calls.push("profile");
      throw new Error("The stage timed out");
    };
    const timedOut = await settleAttempt({
      run: store.current,
      artifacts: artifactsFor(store.current),
      requested: "profile",
      attempt: 3,
      maxAttempts: 3,
      now: NOW,
      reload: store.reload,
      save: store.save,
      work: store.work,
    });
    expect(timedOut).toMatchObject({ result: "stop", reason: "failed" });
    expect(store.current).toMatchObject({
      status: "error",
      stage: "profile",
      finished_at: NOW,
      open: false,
      attempts: 1,
    });
    expect(store.current.error).toMatch(/timed out/);

    const reopened = {
      ...store.current,
      status: "running" as const,
      error: null,
      finished_at: null,
      open: true,
    };
    await store.save(reopened);
    store.work = async (stage, active) => {
      store.calls.push(stage);
      expect(active.stage).toBe("profile");
      return { ...active, checkpoint: { ...active.checkpoint, profile: true } };
    };
    const retried = await settleAttempt({
      run: store.current,
      artifacts: artifactsFor(store.current),
      requested: "profile",
      attempt: 1,
      maxAttempts: 3,
      now: NOW,
      reload: store.reload,
      save: store.save,
      work: store.work,
    });
    expect(retried.result).toBe("continue");
    expect(store.calls).toEqual(["profile", "profile"]);
    expect(store.current.checkpoint.profile).toBe(true);
    expect(store.current.status).toBe("running");
  });

  it("does not steal a live worker and recovers a stale one", () => {
    const live = run({ workflow_id: "wf-old", heartbeat_at: new Date(NOW_MS - 60_000).toISOString() });
    expect(isDeadWorker(live, NOW_MS)).toBe(false);
    expect(shouldStartWorker(live, NOW_MS)).toBe(false);
    expect(ownsRun("wf-old", "wf-new", live.heartbeat_at, NOW_MS)).toBe(false);

    const stale = run({
      workflow_id: "wf-old",
      heartbeat_at: new Date(NOW_MS - WORKER_STALE_MS - 1_000).toISOString(),
    });
    expect(isDeadWorker(stale, NOW_MS)).toBe(true);
    expect(shouldStartWorker(stale, NOW_MS)).toBe(true);
    expect(ownsRun("wf-old", "wf-new", stale.heartbeat_at, NOW_MS)).toBe(true);
    expect(deadWorkerMessage(stale.stage)).toMatch(/stopped during ingest/);

    const unclaimed = run({ workflow_id: null, heartbeat_at: null, started_at: new Date(NOW_MS - 5_000).toISOString() });
    expect(isDeadWorker(unclaimed, NOW_MS)).toBe(false);
    expect(shouldStartWorker(unclaimed, NOW_MS)).toBe(true);

    const abandoned = run({ workflow_id: null, heartbeat_at: null, started_at: new Date(NOW_MS - WORKER_STALE_MS - 1_000).toISOString() });
    expect(isDeadWorker(abandoned, NOW_MS)).toBe(true);
  });

  it("starts one worker while a heartbeat is fresh", () => {
    const first = run({ workflow_id: null, heartbeat_at: null });
    expect(shouldStartWorker(first, NOW_MS)).toBe(true);
    const claimed = { ...first, workflow_id: "pending", heartbeat_at: NOW };
    expect(shouldStartWorker(claimed, NOW_MS)).toBe(false);
  });

  it("resumes a failed profile without going back to ingest or on to the order", async () => {
    const store = memory(run({
      status: "running",
      stage: "profile",
      attempts: 2,
      checkpoint: checkpoint({ enrich: true }),
    }));
    const stages: WorkStage[] = [];
    const outcome = await settleAttempt({
      run: store.current,
      artifacts: { profile: false, popularity: false, order: false },
      requested: "profile",
      attempt: 1,
      maxAttempts: 3,
      now: NOW,
      reload: store.reload,
      save: store.save,
      work: async (stage, active) => {
        stages.push(stage);
        expect(active.stage).toBe("profile");
        return { ...active, status: "error", error: "Quoted number 5 does not match a cited signal" };
      },
    });
    expect(stages).toEqual(["profile"]);
    expect(outcome.reason).toBe("failed");
    expect(store.current).toMatchObject({
      status: "error",
      stage: "profile",
      attempts: 3,
      finished_at: NOW,
      open: false,
    });
    expect(store.current.checkpoint.enrich).toBe(true);
  });

  it("finishes a run that already has an order while the stage column still says profile", async () => {
    const store = memory(run({
      stage: "profile",
      checkpoint: checkpoint({ enrich: true }),
    }));
    let worked = false;
    const outcome = await settleAttempt({
      run: store.current,
      artifacts: { profile: true, popularity: false, order: true },
      requested: "ingest",
      attempt: 1,
      maxAttempts: 3,
      now: NOW,
      reload: store.reload,
      save: store.save,
      work: async () => {
        worked = true;
        return store.current;
      },
    });
    expect(worked).toBe(false);
    expect(outcome).toMatchObject({ result: "stop", reason: "finished" });
    expect(store.current).toMatchObject({
      status: "complete",
      stage: "done",
      error: null,
      finished_at: NOW,
      open: false,
    });
  });

  it("sets the stage column to the work it is about to do", async () => {
    const store = memory(run({
      stage: "profile",
      checkpoint: checkpoint({ enrich: true, profile: true }),
    }));
    const seen: { run: RunRecord | null } = { run: null };
    await settleAttempt({
      run: store.current,
      artifacts: { profile: true, popularity: false, order: false },
      requested: "popularity",
      attempt: 1,
      maxAttempts: 3,
      now: NOW,
      reload: store.reload,
      save: store.save,
      work: async (stage, active) => {
        seen.run = active;
        expect(stage).toBe("popularity");
        return { ...active, checkpoint: { ...active.checkpoint, popularity: true } };
      },
    });
    expect(seen.run?.stage).toBe("popularity");
    expect(seen.run?.status).toBe("running");
  });

  it("seals every terminal result with a finish time", async () => {
    const finished = memory(run({ stage: "order", checkpoint: checkpoint({ enrich: true, profile: true, popularity: true }) }));
    await settleAttempt({
      run: finished.current,
      artifacts: { profile: true, popularity: true, order: true },
      requested: "order",
      attempt: 1,
      maxAttempts: 1,
      now: NOW,
      reload: finished.reload,
      save: finished.save,
      work: async () => finished.current,
    });
    expect(finished.current.finished_at).toBe(NOW);
    expect(finished.current.status).toBe("complete");
    expect(finished.current.open).toBe(false);

    const failed = memory(run({ stage: "order", checkpoint: checkpoint({ enrich: true, profile: true, popularity: true }) }));
    await settleAttempt({
      run: failed.current,
      artifacts: { profile: true, popularity: true, order: false },
      requested: "order",
      attempt: 1,
      maxAttempts: 1,
      now: NOW,
      reload: failed.reload,
      save: failed.save,
      work: async () => {
        throw new Error("order failed");
      },
    });
    expect(failed.current.finished_at).toBe(NOW);
    expect(failed.current.status).toBe("error");
    expect(failed.current.stage).toBe("order");
    expect(failed.current.open).toBe(false);
  });

  it("stops after ingest when fewer than 50 distinct tracks were found", async () => {
    const store = memory(run({
      stage: "enrich",
      checkpoint: checkpoint({ track_count: 12 }),
    }));
    let worked = false;
    const outcome = await settleAttempt({
      run: store.current,
      artifacts: { profile: false, popularity: false, order: false },
      requested: "enrich",
      attempt: 1,
      maxAttempts: 3,
      now: NOW,
      reload: store.reload,
      save: store.save,
      work: async () => {
        worked = true;
        return store.current;
      },
    });
    expect(worked).toBe(false);
    expect(outcome).toMatchObject({ result: "stop", reason: "finished" });
    expect(store.current).toMatchObject({
      status: "complete",
      stage: "done",
      outcome: "insufficient_data",
      error: null,
      open: false,
    });
    expect(store.current.checkpoint.track_count).toBe(12);
  });

  it("continues when ingest found 50 distinct tracks", async () => {
    const store = memory(run({
      stage: "enrich",
      checkpoint: checkpoint({ track_count: 50 }),
    }));
    const stages: WorkStage[] = [];
    await settleAttempt({
      run: store.current,
      artifacts: { profile: false, popularity: false, order: false },
      requested: "enrich",
      attempt: 1,
      maxAttempts: 3,
      now: NOW,
      reload: store.reload,
      save: store.save,
      work: async (stage, active) => {
        stages.push(stage);
        return { ...active, checkpoint: { ...active.checkpoint, enrich: true } };
      },
    });
    expect(stages).toEqual(["enrich"]);
    expect(store.current.outcome).not.toBe("insufficient_data");
  });
});
