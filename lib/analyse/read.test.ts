import { describe, expect, it } from "vitest";
import {
  decodeTrackCursor,
  encodeTrackCursor,
  ingestWatch,
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
    expect(tracksTransport(analysisStatus(run({ stage: "analyse" }), 50))).toBe("json");
    expect(tracksTransport(analysisStatus(run({ status: "complete", stage: "done", outcome: "ready" }), 50))).toBe("json");
    expect(tracksTransport(analysisStatus(null, 0))).toBe("json");
  });

  it("closes the ingest stream when ingest finishes or the run errors", () => {
    expect(ingestWatch(run())).toBe("open");
    expect(ingestWatch(run({ stage: "analyse" }))).toBe("done");
    expect(ingestWatch(run({ status: "complete", stage: "done", outcome: "insufficient_data" }))).toBe("done");
    expect(ingestWatch(run({ status: "error", error: "Spotify was unavailable" }))).toBe("error");
  });

  it("round-trips a resume cursor and parses stream lines", () => {
    const cursor = encodeTrackCursor({ trackIds: ["a"], artistKeys: ["b:short_term"] });
    expect(decodeTrackCursor(cursor)).toEqual({ trackIds: ["a"], artistKeys: ["b:short_term"] });
    expect(parseTrackLine('{"type":"tracks","tracks":[],"artists":[]}')?.type).toBe("tracks");
    expect(parseTrackLine('{"type":"done"}')?.type).toBe("done");
    expect(parseTrackLine('{"type":"resume","cursor":"abc"}')?.type).toBe("resume");
    expect(parseTrackLine("not json")).toBeNull();
  });

  it("holds results until they are ready, then asks the client to retry at the cap", () => {
    expect(resultsDecision({ status: "running", outcome: null, elapsedMs: 1_000 })).toBe("wait");
    expect(resultsDecision({ status: "complete", outcome: "ready", elapsedMs: 1_000 })).toBe("ready");
    expect(resultsDecision({ status: "complete", outcome: "insufficient_data", elapsedMs: 1_000 })).toBe("insufficient");
    expect(resultsDecision({ status: "error", outcome: null, elapsedMs: 1_000 })).toBe("error");
    expect(resultsDecision({ status: "none", outcome: null, elapsedMs: 1_000 })).toBe("none");
    expect(resultsDecision({ status: "running", outcome: null, elapsedMs: TRACK_STREAM_BUDGET_MS })).toBe("retry");
  });

  it("reports ingest or analyse as the only visible stages", () => {
    expect(analysisStatus(run(), 12)).toMatchObject({ status: "running", stage: "ingest", trackCount: 50 });
    expect(analysisStatus(run({ stage: "profile" }), 50)).toMatchObject({ status: "running", stage: "analyse" });
    expect(analysisStatus(run({ status: "error", stage: "analyse", error: "The model timed out" }), 50)).toMatchObject({
      status: "error",
      stage: "analyse",
      error: "The model timed out",
    });
    expect(analysisStatus(null, 0)).toEqual({ status: "none", stage: null, outcome: null, trackCount: 0 });
  });
});
