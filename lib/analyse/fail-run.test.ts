import { describe, expect, it } from "vitest";
import { ANALYSIS_STOPPED, markFailedIfOwned } from "@/lib/analyse/fail-run";
import { shouldStartOnSignIn } from "@/lib/analyse/sign-in";
import { emptyCounts, type RunRecord } from "@/lib/ingest/types";

const NOW = "2026-11-14T04:00:00.000Z";

function run(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-1",
    user_id: "user-1",
    status: "running",
    stage: "analyse",
    started_at: "2026-11-14T03:00:00.000Z",
    finished_at: null,
    counts: emptyCounts(),
    error: null,
    checkpoint: {},
    open: true,
    heartbeat_at: NOW,
    attempts: 2,
    workflow_id: "wfr_1",
    outcome: null,
    ...partial,
  };
}

describe("workflow failure mark", () => {
  it("marks the run error when the final step attempt crashes, then throws", async () => {
    let current = run();
    await expect(
      (async () => {
        try {
          throw new Error("The function timed out");
        } catch (error) {
          current = markFailedIfOwned(current, "wfr_1", NOW) ?? current;
          throw error;
        }
      })(),
    ).rejects.toThrow("The function timed out");
    expect(current).toMatchObject({
      status: "error",
      stage: "analyse",
      error: ANALYSIS_STOPPED,
      open: false,
      attempts: 3,
      finished_at: NOW,
      heartbeat_at: null,
      workflow_id: "wfr_1",
    });
    expect(shouldStartOnSignIn(current)).toBe(true);
  });

  it("leaves a terminal run unchanged", () => {
    const done = run({ status: "complete", stage: "done", outcome: "ready", open: false, finished_at: NOW });
    const short = run({ status: "complete", stage: "done", outcome: "insufficient_data", open: false, finished_at: NOW });
    const errored = run({ status: "error", error: "Spotify was unavailable", open: false, finished_at: NOW });
    const otherOwner = run({ workflow_id: "wfr_other" });
    expect(markFailedIfOwned(done, "wfr_1", NOW)).toBeNull();
    expect(markFailedIfOwned(short, "wfr_1", NOW)).toBeNull();
    expect(markFailedIfOwned(errored, "wfr_1", NOW)).toBeNull();
    expect(markFailedIfOwned(otherOwner, "wfr_1", NOW)).toBeNull();
    expect(markFailedIfOwned(run({ stage: "done", outcome: "insufficient_data" }), "wfr_1", NOW)).toBeNull();

    const marked = markFailedIfOwned(run(), "wfr_1", NOW);
    expect(marked?.status).toBe("error");
    expect(markFailedIfOwned(marked ?? run(), "wfr_1", NOW)).toBeNull();
  });
});
