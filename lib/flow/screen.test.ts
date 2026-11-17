import { describe, expect, it } from "vitest";
import { initialAnalysingState, reduceAnalysis } from "@/lib/analysing/reduce";
import { screenForRun, welcomePlan } from "@/lib/flow/screen";

describe("screen flow", () => {
  it("picks the screen from the run, and does not replay the welcome once a run exists", () => {
    expect(screenForRun(null, true)).toBe("welcome");
    expect(screenForRun(null, false)).toBe("analysing");
    expect(screenForRun({ stage: "enrich", status: "running" }, true)).toBe("analysing");
    expect(screenForRun({ stage: "done", status: "complete" }, true)).toBe("results");
    expect(screenForRun({ stage: "order", status: "error" }, false)).toBe("error");
    expect(screenForRun({ stage: "profile", status: "error" }, false)).toBe("error");
    expect(screenForRun({ stage: "ingest", status: "error" }, false)).toBe("error");
    expect(screenForRun({ stage: "done", status: "complete", outcome: "insufficient_data" }, false)).toBe("insufficient");
  });

  it("walks stored stages from ingest to the order", () => {
    const stages = ["ingest", "enrich", "profile", "order", "done"];
    let state = initialAnalysingState;
    for (const stage of stages) {
      state = reduceAnalysis(state, {
        type: "snapshot",
        run: {
          status: stage === "done" ? "complete" : "running",
          stage,
          error: null,
          progress: { done: 0, total: 0 },
          complete: stage === "done",
        },
      });
    }
    expect(state.stage).toBe("order");
    expect(state.complete).toBe(true);
    expect(screenForRun({ stage: "done", status: "complete" }, false)).toBe("results");
  });

  it("holds the welcome for three seconds and skips the fade when motion is reduced", () => {
    expect(welcomePlan(false).holdMs).toBe(3000);
    expect(welcomePlan(false).fadeMs).toBe(400);
    expect(welcomePlan(true)).toEqual({ dots: 3, fadeMs: 0, holdMs: 3000 });
  });
});
