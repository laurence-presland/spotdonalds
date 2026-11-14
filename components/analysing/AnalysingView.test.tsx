import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalysingView } from "@/components/analysing/AnalysingView";
import { initialAnalysingState, reduceAnalysis } from "@/lib/analysing/reduce";
import { NotAllowlisted } from "@/components/NotAllowlisted";
import { reconnectDelay } from "@/lib/analysing/backoff";
import type { StreamEvent } from "@/lib/stream/events";

const humble = {
  id: "t1",
  name: "HUMBLE.",
  artists: ["Kendrick Lamar"],
  album: "DAMN.",
  image: "https://i.scdn.co/image/humble",
  sources: [{ kind: "recent" as const }],
};

describe("AnalysingView", () => {
  it("renders the heading, the three stages, the wordmark bar, and the credit", () => {
    const html = renderToStaticMarkup(
      <AnalysingView
        state={{
          ...initialAnalysingState,
          stage: "taste",
          tracks: [humble],
          status: "streaming",
        }}
      />,
    );
    expect(html).toContain("Analysing your listening history");
    expect(html).not.toContain("You're in");
    expect(html).toContain("Reading your history");
    expect(html).toContain("Analysing your taste");
    expect(html).toContain("Assembling your order");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("/brand/wordmark-yellow.svg");
    expect(html).toContain("Data provided by Spotify, MusicBrainz, and Deezer.");
    expect(html).toContain("https://i.scdn.co/image/humble");
    expect(html).toContain("1 track");
    expect(html).toContain("step-spinner");
    expect(html.indexOf("wordmark-bar")).toBeLessThan(html.indexOf("Log out"));
    expect(html.indexOf("Log out")).toBeLessThan(html.indexOf("Analysing your listening history"));
    expect(html).not.toContain(">S<");
  });

  it("uses a letter tile when Spotify has no image and keeps one row after a repeated event", () => {
    const events: StreamEvent[] = [
      {
        type: "track",
        id: "t2",
        name: "Nights",
        artists: ["Frank Ocean"],
        album: "Blonde",
        image: null,
        source: "top",
        time_range: "medium_term",
        rank: 3,
      },
      { type: "enrich_result", id: "t2", name: "Nights", artists: ["Frank Ocean"], album: "Blonde", image: null, failures: [] },
      { type: "enrich_result", id: "t2", name: "Nights", artists: ["Frank Ocean"], album: "Blonde", image: null, failures: [] },
    ];
    let state = initialAnalysingState;
    for (const event of events) state = reduceAnalysis(state, { type: "event", event });
    expect(state.tracks).toHaveLength(1);
    const html = renderToStaticMarkup(<AnalysingView state={state} initialTab="top-tracks" />);
    expect(html).toContain("letter-tile");
    expect(html).toContain("Top · 6 months");
    expect(html).toContain("1 track");
  });

  it("shows a finished run as ingested tracks, with a way forward and no spinner", () => {
    const html = renderToStaticMarkup(
      <AnalysingView
        state={{
          ...initialAnalysingState,
          status: "streaming",
          complete: true,
          ingested: 50,
          tracks: [humble],
        }}
        onForward={() => undefined}
      />,
    );
    expect(html).toContain("Your listening history");
    expect(html).toContain("50 tracks ingested");
    expect(html).toContain("This run is finished.");
    expect(html).toContain(">Forward<");
    expect(html).not.toContain("step-spinner");
    expect(html).not.toContain('aria-current="step"');
    expect(html).not.toContain('data-state="current"');
    expect(html).toContain('data-state="done"');
  });

  it("shows reconnecting, an error, and the access screen", () => {
    const reconnecting = renderToStaticMarkup(
      <AnalysingView state={{ ...initialAnalysingState, status: "reconnecting" }} />,
    );
    expect(reconnecting).toContain("Reconnecting");
    const errored = renderToStaticMarkup(
      <AnalysingView state={{ ...initialAnalysingState, status: "error", message: "Spotify is busy" }} />,
    );
    expect(errored).toContain("Spotify is busy");
    const access = renderToStaticMarkup(<NotAllowlisted />);
    expect(access).toContain("This account isn");
    expect(access).not.toContain("track-list");
  });
});

describe("reconnectDelay", () => {
  it("backs off and stays capped", () => {
    expect(reconnectDelay(0)).toBe(400);
    expect(reconnectDelay(1)).toBe(800);
    expect(reconnectDelay(8)).toBe(8000);
  });
});
