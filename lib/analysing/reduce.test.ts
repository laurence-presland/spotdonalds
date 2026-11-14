import { describe, expect, it } from "vitest";
import { initialAnalysingState, reduceAnalysis } from "@/lib/analysing/reduce";
import { presentCatalogue } from "@/lib/catalogue/present";
import { parseNdjsonChunk } from "@/lib/stream/parse";
import type { StreamEvent } from "@/lib/stream/events";

const script: StreamEvent[] = [
  { type: "stage", stage: "ingest" },
  {
    type: "track",
    id: "t1",
    name: "HUMBLE.",
    artists: ["Kendrick Lamar"],
    album: "DAMN.",
    image: null,
    source: "recent",
  },
  { type: "enrich_result", id: "t1", name: "HUMBLE.", artists: ["Kendrick Lamar"], album: "DAMN.", image: null, failures: [] },
  { type: "done", stage: "enrich" },
  { type: "stage", stage: "profile" },
  { type: "stage", stage: "order" },
  { type: "error", code: "not_allowlisted", message: "Spotify refused this account" },
];

describe("analysing state", () => {
  it("shows a track only after enrichment and then walks the later stages", () => {
    let state = initialAnalysingState;
    state = reduceAnalysis(state, { type: "event", event: script[0]! });
    state = reduceAnalysis(state, { type: "event", event: script[1]! });
    expect(state.tracks).toHaveLength(0);
    expect(state.stage).toBe("reading");
    state = reduceAnalysis(state, { type: "event", event: script[2]! });
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0]?.sources).toEqual([{ kind: "recent" }]);
    state = reduceAnalysis(state, { type: "event", event: script[3]! });
    expect(state.stage).toBe("taste");
    state = reduceAnalysis(state, { type: "event", event: script[5]! });
    expect(state.stage).toBe("order");
  });

  it("maps a 403 to the access state and a dropped stream to reconnecting", () => {
    const denied = reduceAnalysis(initialAnalysingState, { type: "event", event: script[6]! });
    expect(denied.status).toBe("access");
    const reconnecting = reduceAnalysis(initialAnalysingState, {
      type: "connection",
      status: "reconnecting",
      message: "Reconnecting",
    });
    expect(reconnecting.status).toBe("reconnecting");
    const resumed = reduceAnalysis(reconnecting, {
      type: "hydrate",
      tracks: [
        {
          id: "t1",
          name: "HUMBLE.",
          artists: ["Kendrick Lamar"],
          album: "DAMN.",
          image: null,
          sources: [{ kind: "recent" }],
        },
      ],
      artists: [],
    });
    expect(resumed.tracks).toHaveLength(1);
  });

  it("keeps a finished run out of the reading step", () => {
    const state = reduceAnalysis(initialAnalysingState, {
      type: "snapshot",
      run: {
        status: "complete",
        stage: "ingest",
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

describe("parseNdjsonChunk", () => {
  it("keeps a partial line for the next chunk", () => {
    const first = parseNdjsonChunk("", '{"type":"stage","stage":"ingest"}\n{"type":"pro');
    expect(first.events).toEqual([{ type: "stage", stage: "ingest" }]);
    const second = parseNdjsonChunk(first.rest, 'gress","done":1,"total":2,"endpoint":"enrich"}\n');
    expect(second.events[0]).toMatchObject({ type: "progress", done: 1 });
  });
});
