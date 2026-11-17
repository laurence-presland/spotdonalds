import { describe, expect, it } from "vitest";
import { initialAnalysingState, reduceAnalysis, stageFor } from "@/lib/analysing/reduce";
import { presentCatalogue } from "@/lib/catalogue/present";

const humble = {
  id: "t1",
  name: "HUMBLE.",
  artists: ["Kendrick Lamar"],
  album: "DAMN.",
  image: null,
  sources: [{ kind: "recent" as const }],
};

describe("analysing state", () => {
  it("hydrates tracks and walks the stored stages", () => {
    let state = reduceAnalysis(initialAnalysingState, {
      type: "hydrate",
      tracks: [humble],
      artists: [],
    });
    expect(state.tracks).toHaveLength(1);
    expect(state.stage).toBe("reading");
    state = reduceAnalysis(state, {
      type: "snapshot",
      run: { status: "running", stage: "profile", error: null, progress: { done: 0, total: 0 } },
    });
    expect(state.stage).toBe("taste");
    state = reduceAnalysis(state, {
      type: "snapshot",
      run: { status: "running", stage: "order", error: null, progress: { done: 0, total: 0 } },
    });
    expect(state.stage).toBe("order");
  });

  it("maps a denied account to the access state and keeps tracks across a reconnect", () => {
    const denied = reduceAnalysis(initialAnalysingState, {
      type: "snapshot",
      run: {
        status: "error",
        stage: "ingest",
        error: "not_allowlisted",
        progress: { done: 0, total: 0 },
      },
    });
    expect(denied.status).toBe("access");
    const reconnecting = reduceAnalysis(initialAnalysingState, {
      type: "connection",
      status: "reconnecting",
      message: "Reconnecting",
    });
    expect(reconnecting.status).toBe("reconnecting");
    const resumed = reduceAnalysis(reconnecting, {
      type: "hydrate",
      tracks: [{ ...humble, image: null }],
      artists: [],
    });
    expect(resumed.tracks).toHaveLength(1);
  });

  it("keeps a finished run on the stage it already showed", () => {
    const state = reduceAnalysis(initialAnalysingState, {
      type: "snapshot",
      run: {
        status: "complete",
        stage: "done",
        error: null,
        progress: { done: 0, total: 0 },
        complete: true,
        trackCount: 50,
      },
    });
    expect(state.complete).toBe(true);
    expect(state.ingested).toBe(50);
    expect(state.stage).toBe("reading");
    expect(state.status).toBe("streaming");
  });

  it("labels ingest and enrich as reading, profile as taste, and the order stages as order", () => {
    expect(stageFor("ingest", "taste")).toBe("reading");
    expect(stageFor("enrich", "taste")).toBe("reading");
    expect(stageFor("profile", "reading")).toBe("taste");
    expect(stageFor("popularity", "reading")).toBe("order");
    expect(stageFor("order", "reading")).toBe("order");
  });
});

describe("catalogue", () => {
  it("hides tracks that were not enriched", () => {
    const presented = presentCatalogue({
      tracks: [
        { id: "kept", name: "Kept", artists: ["A"], album: null, image: "https://i.scdn.co/a" },
        { id: "dropped", name: "Dropped", artists: ["B"], album: null, image: null },
      ],
      recentIds: ["kept", "dropped"],
      topTracks: [{ id: "kept", time_range: "short_term", rank: 1 }],
      artists: [{ id: "ar1", name: "A", time_range: "long_term", rank: 1 }],
      enrichedIds: new Set(["kept"]),
    });
    expect(presented.tracks.map((track) => track.id)).toEqual(["kept"]);
    expect(presented.artists).toHaveLength(1);
  });
});
