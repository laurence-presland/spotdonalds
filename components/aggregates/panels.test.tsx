import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bpmStats } from "@/lib/aggregates/bpm";
import { BpmHistogram, CoverageSummary, GenreMixChart, TopArtistsByWindow } from "@/components/aggregates/panels";
import { tagMix } from "@/lib/aggregates/tags";
import { coverage } from "@/lib/aggregates/coverage";

describe("aggregate panels", () => {
  it("renders the mix, the tempo chart, and every artist window", () => {
    const mix = tagMix([{ tags: [{ name: "jazz", count: 1, source: "musicbrainz", source_url: "https://musicbrainz.org/recording/1" }] }]);
    const html = renderToStaticMarkup(
      <>
        <GenreMixChart mix={mix} status="ready" />
        <BpmHistogram stats={bpmStats([128, null, 0])} status="ready" />
        <TopArtistsByWindow
          status="ready"
          artists={{
            short_term: [{ id: "a", name: "Kendrick Lamar", time_range: "short_term", rank: 1 }],
            medium_term: [],
            long_term: [{ id: "b", name: "Frank Ocean", time_range: "long_term", rank: 1 }],
          }}
        />
      </>,
    );
    expect(html).toContain("id=\"genre-mix\"");
    expect(html).toContain("jazz");
    expect(html).toContain("Mean 128 BPM");
    expect(html).toContain("4 weeks");
    expect(html).toContain("6 months");
    expect(html).toContain("1 year");
    expect(html).toContain("Kendrick Lamar");
    expect(html).not.toContain("left out");
    expect(html).not.toContain("sample");
    expect(html).not.toContain("missing");
  });

  it("has loading, empty and error states, and coverage stays a separate component", () => {
    expect(renderToStaticMarkup(<GenreMixChart mix={null} status="loading" />)).toContain("Loading this section.");
    expect(renderToStaticMarkup(<BpmHistogram stats={null} status="error" />)).toContain("did not load");
    expect(renderToStaticMarkup(<TopArtistsByWindow artists={null} status="empty" />)).toContain("Nothing to show yet.");
    const hidden = renderToStaticMarkup(
      <CoverageSummary coverage={coverage([{ tags: [{}], bpm: 100 }])} />,
    );
    expect(hidden).toContain("Coverage");
  });
});
