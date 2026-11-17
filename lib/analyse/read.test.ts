import { describe, expect, it } from "vitest";
import {
  ingestWatch,
  parseSince,
  parseTrackLine,
  resultsDecision,
  TRACK_STREAM_BUDGET_MS,
  tracksTransport,
} from "@/lib/analyse/read";
import { analysisStatus } from "@/lib/analyse/status";
import { emptyCounts, type RunRecord } from "@/lib/ingest/types";

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
    checkpoint: { track_count: 50 },
    open: true,
    ...partial,
  };
}

describe("analysis read path", () => {
  it("streams tracks only while ingest is running and returns JSON afterwards", () => {
    expect(tracksTransport(analysisStatus(run(), 12))).toBe("stream");
    expect(tracksTransport(analysisStatus(run({ stage: "enrich" }), 50))).toBe(
      "json"
    );
    expect(
      tracksTransport(
        analysisStatus(
          run({ status: "complete", stage: "done", outcome: "ready" }),
          50
        )
      )
    ).toBe("json");
    expect(tracksTransport(analysisStatus(null, 0))).toBe("json");
  });

  it("closes the ingest stream when ingest finishes or the run errors", () => {
    expect(ingestWatch(run())).toBe("open");
    expect(ingestWatch(run({ stage: "enrich" }))).toBe("done");
    expect(
      ingestWatch(
        run({ status: "complete", stage: "done", outcome: "insufficient_data" })
      )
    ).toBe("done");
    expect(
      ingestWatch(run({ status: "error", error: "Spotify was unavailable" }))
    ).toBe("error");
  });

  it("parses a resume timestamp and stream lines", () => {
    expect(parseSince("2026-11-13T14:00:00.000Z")).toBe(
      "2026-11-13T14:00:00.000Z"
    );
    expect(parseSince("not-a-time")).toBeNull();
    expect(parseSince(null)).toBeNull();
    expect(
      parseTrackLine('{"type":"tracks","tracks":[],"artists":[]}')?.type
    ).toBe("tracks");
    expect(parseTrackLine('{"type":"done"}')?.type).toBe("done");
    expect(
      parseTrackLine('{"type":"resume","since":"2026-11-13T14:00:00.000Z"}')
    ).toEqual({
      type: "resume",
      since: "2026-11-13T14:00:00.000Z",
    });
    expect(parseTrackLine("not json")).toBeNull();
  });

  it("holds results until they are ready, then asks the client to retry at the cap", () => {
    expect(
      resultsDecision({ status: "running", outcome: null, elapsedMs: 1_000 })
    ).toBe("wait");
    expect(
      resultsDecision({
        status: "complete",
        outcome: "ready",
        elapsedMs: 1_000,
      })
    ).toBe("ready");
    expect(
      resultsDecision({
        status: "complete",
        outcome: "insufficient_data",
        elapsedMs: 1_000,
      })
    ).toBe("insufficient");
    expect(
      resultsDecision({ status: "error", outcome: null, elapsedMs: 1_000 })
    ).toBe("error");
    expect(
      resultsDecision({ status: "none", outcome: null, elapsedMs: 1_000 })
    ).toBe("none");
    expect(
      resultsDecision({
        status: "running",
        outcome: null,
        elapsedMs: TRACK_STREAM_BUDGET_MS,
      })
    ).toBe("retry");
  });

  it("reports the stored stage", () => {
    expect(analysisStatus(run(), 12)).toMatchObject({
      status: "running",
      stage: "ingest",
      trackCount: 50,
    });
    expect(analysisStatus(run({ stage: "profile" }), 50)).toMatchObject({
      status: "running",
      stage: "profile",
    });
    expect(analysisStatus(run({ stage: "order" }), 50)).toMatchObject({
      status: "running",
      stage: "order",
    });
    expect(
      analysisStatus(
        run({
          status: "error",
          stage: "profile",
          error: "The model timed out",
        }),
        50
      )
    ).toMatchObject({
      status: "error",
      stage: "profile",
      error: "The model timed out",
    });
    expect(analysisStatus(null, 0)).toEqual({
      status: "none",
      stage: null,
      outcome: null,
      trackCount: 0,
    });
  });
});
