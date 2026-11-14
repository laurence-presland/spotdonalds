import { describe, expect, it } from "vitest";
import { initialAnalysingState, reduceAnalysis } from "@/lib/analysing/reduce";
import { screenForRun, welcomePlan } from "@/lib/flow/screen";
import type { StreamEvent } from "@/lib/stream/events";

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

  it("walks a scripted stream from ingest to done", () => {
    const events: StreamEvent[] = [
      { type: "stage", stage: "ingest" },
      { type: "stage", stage: "enrich" },
      { type: "stage", stage: "profile" },
      { type: "stage", stage: "order" },
      { type: "stage", stage: "done" },
    ];
    let state = initialAnalysingState;
    const stages: string[] = [];
    for (const event of events) {
      state = reduceAnalysis(state, { type: "event", event });
      if (event.type === "stage") stages.push(event.stage);
    }
    expect(stages).toEqual(["ingest", "enrich", "profile", "order", "done"]);
    expect(state.stage).toBe("order");
  });

  it("holds the welcome for three seconds and skips the fade when motion is reduced", () => {
    expect(welcomePlan(false).holdMs).toBe(3000);
    expect(welcomePlan(false).fadeMs).toBe(400);
    expect(welcomePlan(true)).toEqual({ dots: 3, fadeMs: 0, holdMs: 3000 });
  });
});
