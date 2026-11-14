import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TasteProfileCard } from "@/components/profile/TasteProfileCard";
import { formatStoredSignal, signalAnchor } from "@/lib/profile/present";
import type { StoredProfile } from "@/lib/profile/run";
import type { TasteSignals } from "@/lib/signals/compute";

const signals: TasteSignals = {
  "tags.top": [{ tag: "jazz", share: 1 }],
  "tags.diversity": 0.25,
  "bpm.mean": 128,
  "bpm.median": 120,
  "bpm.spread": 10,
  "bpm.sample_size": 4,
  "consistency.artist_overlap": 0.5,
  "consistency.track_overlap": 0.25,
  "consistency.tag_drift": 0.1,
  "concentration.top_artists_share": 0.6,
  "repeat.rate": 0.2,
  "recency.recent_share": 0.4,
  "recency.median_release_year": 2014,
  "explicit.share": 0.1,
  "coverage.tags": 0.2,
  "coverage.bpm": 0.2,
};

const profile: StoredProfile = {
  run_id: "run-1",
  user_id: "user-1",
  persona_name: "Repeat-Button Romantic",
  tagline: "Keeps one tempo and stays with it.",
  insights: [
    { text: "Average tempo sits at 128 BPM.", cites: ["bpm.mean"] },
    { text: "Jazz owns the tagged mix.", cites: ["tags.top"] },
    { text: "Older releases are still in rotation.", cites: ["recency.recent_share"] },
  ],
  traits: [
    { name: "energy", explanation: "The average tempo keeps this moving.", cites: ["bpm.mean"], score: 68 },
    { name: "variety", explanation: "The tags stay close together.", cites: ["tags.diversity"], score: 25 },
    { name: "loyalty", explanation: "A few artists carry the listening.", cites: ["concentration.top_artists_share"], score: 44 },
    { name: "nostalgia", explanation: "Older releases are still in rotation.", cites: ["recency.recent_share"], score: 60 },
  ],
  caveats: ["Internal note about thin enrichment that must stay hidden."],
  signals,
  prompt_version: "profile.v1",
  prompt_hash: "abc",
};

describe("TasteProfileCard", () => {
  it("shows insights, trait scores and signal values, and hides the persona and caveats", () => {
    const html = renderToStaticMarkup(<TasteProfileCard profile={profile} />);
    expect(html).toContain("Average tempo sits at 128 BPM.");
    expect(html).toContain("Jazz owns the tagged mix.");
    expect(html).toContain("128 BPM");
    expect(html).toContain("jazz 100%");
    expect(html).toContain("energy");
    expect(html).toContain(">68<");
    expect(html).toContain('href="#bpm"');
    expect(html).toContain('href="#genre-mix"');
    expect(html).not.toContain("Repeat-Button Romantic");
    expect(html).not.toContain("Keeps one tempo");
    expect(html).not.toContain("Internal note about thin enrichment");
    expect(html).not.toContain("how this was made");
    expect(html).toContain("Trait scores out of 100");
    expect(html).toContain("Regenerate");
  });

  it("formats stored values and points chips at the aggregate sections", () => {
    expect(formatStoredSignal("bpm.mean", signals)).toBe("128 BPM");
    expect(formatStoredSignal("tags.top", signals)).toBe("jazz 100%");
    expect(
      formatStoredSignal("tags.top", {
        ...signals,
        "tags.top": [
          { tag: "jazz", share: 0.4 },
          { tag: "soul", share: 0.3 },
          { tag: "rock", share: 0.2 },
          { tag: "pop", share: 0.1 },
        ],
      }),
    ).toBe("jazz 40%, soul 30%, rock 20%");
    expect(signalAnchor("bpm.mean")).toBe("#bpm");
    expect(signalAnchor("tags.top")).toBe("#genre-mix");
    expect(signalAnchor("concentration.top_artists_share")).toBe("#top-artists");
  });
});
