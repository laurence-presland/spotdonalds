import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, isTerminalRun, parseWatchLine, unseenBy } from "@/lib/analyse/watch";
import type { VisibleTrack } from "@/lib/catalogue/present";

function track(id: string): VisibleTrack {
  return { id, name: id, artists: [], album: null, image: null, sources: [{ kind: "recent" }] };
}

describe("analysis watch", () => {
  it("replays stored tracks on a fresh cursor and skips them after a resume cursor", () => {
    const tracks = [track("a"), track("b"), track("c")];
    expect(unseenBy(tracks, new Set(), (item) => item.id).map((item) => item.id)).toEqual(["a", "b", "c"]);
    const cursor = encodeCursor({ stage: "enrich", trackIds: ["a", "b"], artistKeys: [] });
    const decoded = decodeCursor(cursor);
    expect(decoded?.stage).toBe("enrich");
    expect(unseenBy(tracks, new Set(decoded?.trackIds ?? []), (item) => item.id).map((item) => item.id)).toEqual(["c"]);
    expect(decodeCursor("not-a-cursor")).toBeNull();
  });

  it("treats a short catalogue and a failed run as terminal, and a running one as open", () => {
    expect(isTerminalRun({ status: "complete", stage: "done", outcome: "insufficient_data" })).toBe(true);
    expect(isTerminalRun({ status: "complete", stage: "done", outcome: "ready" })).toBe(true);
    expect(isTerminalRun({ status: "error", stage: "profile", outcome: null })).toBe(true);
    expect(isTerminalRun({ status: "running", stage: "enrich", outcome: null })).toBe(false);
  });

  it("reads stage and track lines from the stream", () => {
    expect(parseWatchLine("")).toBeNull();
    expect(parseWatchLine("{\"type\":\"resume\",\"cursor\":\"abc\"}")).toEqual({ type: "resume", cursor: "abc" });
    expect(parseWatchLine("{\"type\":\"tracks\",\"tracks\":[],\"artists\":[]}")?.type).toBe("tracks");
    expect(parseWatchLine("not json")).toBeNull();
  });
});
