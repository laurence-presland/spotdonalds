import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultsScreen } from "@/components/flow/ResultsScreen";
import { buildAggregates } from "@/lib/aggregates";
import type { StoredOrder } from "@/lib/order/run";
import type { StoredProfile } from "@/lib/profile/run";
import type { TasteSignals } from "@/lib/signals/compute";

const signals = {} as TasteSignals;

describe("ResultsScreen", () => {
  it("puts the order beside the persona and leaves the track list off the page", () => {
    const html = renderToStaticMarkup(
      <ResultsScreen
        aggregates={buildAggregates({ tracks: [], artists: [], topTracks: [] })}
        menu={[{ id: "big-mac", name: "Big Mac", category: "burgers", kcal: 621 }]}
        orderFailed={false}
        profile={
          {
            run_id: "run-1",
            user_id: "user-1",
            persona_name: "Repeat-Button Romantic",
            tagline: "Keeps the same records close.",
            insights: [{ text: "Jazz owns the mix.", cites: ["tags.top"] }],
            traits: [
              { name: "energy", explanation: "Fast.", cites: ["bpm.mean"], score: 68 },
              { name: "variety", explanation: "Narrow.", cites: ["tags.diversity"], score: 20 },
              { name: "loyalty", explanation: "Loyal.", cites: ["repeat.rate"], score: 40 },
              { name: "nostalgia", explanation: "Older.", cites: ["recency.recent_share"], score: 50 },
            ],
            caveats: ["hidden caveat"],
            signals,
            prompt_version: "profile.v1",
            prompt_hash: "abc",
          } as StoredProfile
        }
        order={
          {
            run_id: "run-1",
            user_id: "user-1",
            items: [{ item_id: "big-mac", quantity: 1, justification: "A classic.", tag_ids: ["classic"] }],
            invented_rules: [],
            summary: "One burger.",
            how_we_decided: { text: "The tempo picked the burger.", rule_ids: ["bpm-calories"], cites: ["bpm.mean"] },
            confidence_note: "SECRET",
            totals: { kcal: 621, aud: 7.9 },
            budget: {
              calories_kcal: { a_little: 900, a_lot: 1500 },
              spend_aud: { a_little: 12, a_lot: 38 },
              bpm: { a_little: 80, a_lot: 130 },
              energy: { a_little: 40, a_lot: 67 },
              diversity: { a_little: 0.35, a_lot: 0.65 },
              artist_concentration: { a_lot: 0.7 },
              coverage: { a_little: 0.5 },
            },
            popularity: { popularity_tier: "mid", reason: "Mid." },
            signals,
            inputs: {},
            rules_version: "order-rules.v1",
            prompt_version: "order.v1",
            prompt_hash: "abc",
            popularity_prompt_hash: "def",
            menu_retrieved_at: "2026-11-13",
          } as StoredOrder
        }
      />,
    );
    expect(html).toContain("We think you");
    expect(html).toContain("Repeat-Button Romantic");
    expect(html).toContain("The tempo picked the burger.");
    expect(html).toContain("Regenerate order");
    expect(html).toContain("Big Mac");
    expect(html).toContain(">Back<");
    expect(html).toContain("Jazz owns the mix.");
    expect(html).not.toContain("track-list");
    expect(html).not.toContain("hidden caveat");
    expect(html).not.toContain("SECRET");
    expect(html.indexOf("class=\"bar\"")).toBeLessThan(html.indexOf("Log out"));
    expect(html.indexOf("Log out")).toBeLessThan(html.indexOf(">Back<"));
  });
});