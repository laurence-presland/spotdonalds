import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/prompts/build";
import { profileModelSchema } from "@/lib/profile/schema";
import { validateProfile } from "@/lib/profile/validate";
import { runTasteProfile, type ProfileStore, type StoredProfile } from "@/lib/profile/run";
import type { TasteSignals } from "@/lib/signals/compute";
import { emptyCounts, type RunRecord } from "@/lib/ingest/types";
import type { StreamEvent } from "@/lib/stream/events";

const signals: TasteSignals = {
  "tags.top": [{ tag: "jazz", share: 1 }],
  "tags.diversity": 0,
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

function draft(text = "Average tempo sits at 128 BPM."): {
  persona_name: string;
  tagline: string;
  insights: { text: string; cites: string[] }[];
  traits: { name: string; explanation: string; cites: string[] }[];
  caveats: string[];
} {
  return {
    persona_name: "Repeat-Button Romantic",
    tagline: "Keeps one tempo and stays with it.",
    insights: [
      { text, cites: ["bpm.mean"] },
      { text: "Jazz owns the tagged mix.", cites: ["tags.top"] },
    ],
    traits: [
      { name: "energy", explanation: "The 128 BPM average keeps this moving.", cites: ["bpm.mean"] },
      { name: "variety", explanation: "Jazz owns the tagged mix.", cites: ["tags.top"] },
      { name: "loyalty", explanation: "A few artists carry the listening.", cites: ["concentration.top_artists_share"] },
      { name: "nostalgia", explanation: "Older releases are still in rotation.", cites: ["recency.recent_share"] },
    ],
    caveats: ["Tag and tempo signals are thin."],
  };
}

describe("profile schema and validation", () => {
  it("rejects an unknown cite and an unknown trait", () => {
    const badCite = draft();
    badCite.insights[0] = { text: "Hello", cites: ["not.a.key"] };
    expect(profileModelSchema.safeParse(badCite).success).toBe(false);
    const badTrait = draft();
    badTrait.traits[0] = { name: "mood", explanation: "Nope", cites: ["bpm.mean"] };
    expect(profileModelSchema.safeParse(badTrait).success).toBe(false);
    expect(draft().traits.every((trait) => !("score" in trait))).toBe(true);
  });

  it("rejects a wrong quoted number, a hidden signal, and a low-coverage profile with no caveat", () => {
    expect(validateProfile(draft("Average tempo is 999 BPM."), signals).ok).toBe(false);
    const hidden = draft();
    hidden.insights[0] = { text: "The tempo is 128 BPM.", cites: ["bpm.mean", "coverage.tags"] };
    expect(validateProfile(hidden, signals).ok).toBe(false);
    const gap = draft();
    gap.persona_name = "Low coverage listener";
    expect(validateProfile(gap, signals).ok).toBe(false);
    const noCaveat = draft();
    noCaveat.caveats = [];
    expect(validateProfile(noCaveat, signals).ok).toBe(false);
    const missing = validateProfile(draft(), { ...signals, "bpm.mean": null });
    expect(missing.ok).toBe(false);
    expect(validateProfile(draft(), signals).ok).toBe(true);
  });
});

describe("runTasteProfile", () => {
  it("retries a bad quote, stores the hash, and does not call the model again", async () => {
    const logs: unknown[] = [];
    const events: StreamEvent[] = [];
    let calls = 0;
    let stored: StoredProfile | null = null;
    const stages: string[] = [];
    const run: RunRecord = {
      id: "run-1",
      user_id: "user-1",
      status: "complete",
      stage: "enrich",
      started_at: "2026-11-13T00:00:00Z",
      finished_at: null,
      counts: emptyCounts(),
      error: null,
      checkpoint: {},
    };
    const store: ProfileStore = {
      async latestRun() {
        return run;
      },
      async saveRun(next) {
        stages.push(`${next.stage}:${next.status}`);
        Object.assign(run, next);
      },
      async getProfile() {
        return stored;
      },
      async saveProfile(profile) {
        stored = profile;
      },
      async loadListening() {
        return {
          tracks: [
            {
              id: "t1",
              artistIds: ["a"],
              releaseDate: "2014-01-01",
              explicit: false,
              tags: [{ name: "jazz", count: 1, source: "musicbrainz", source_url: "https://musicbrainz.org/recording/1" }],
              bpm: 128,
              windows: ["short_term" as const],
            },
            { id: "t2", artistIds: ["b"], releaseDate: "2024-01-01", explicit: false, tags: [], bpm: null, windows: [] },
            { id: "t3", artistIds: ["c"], releaseDate: null, explicit: true, tags: [], bpm: null, windows: [] },
          ],
          plays: [{ trackId: "t1" }],
          topArtists: [{ id: "a", window: "long_term" as const }],
        };
      },
    };
    const complete = async (input: { prompt: string }) => {
      calls += 1;
      expect(input.prompt).not.toContain("spotify_id");
      expect(input.prompt).not.toContain("isrc");
      expect(input.prompt).toContain("bpm.mean");
      if (calls === 1) return { object: draft("Average tempo is 999 BPM."), usage: { inputTokens: 10, outputTokens: 4 } };
      return { object: draft(), usage: { inputTokens: 12, outputTokens: 8 } };
    };
    const saved = await runTasteProfile({
      userId: "user-1",
      store,
      complete,
      emit: (event) => events.push(event),
      log: (_level, event, fields) => logs.push({ event, fields }),
    });
    expect(calls).toBe(2);
    expect(saved.prompt_hash).toBe(buildPrompt("profile.v1").hash);
    expect(saved.prompt_version).toBe("profile.v1");
    expect(saved.traits.find((trait) => trait.name === "energy")?.score).toBeTypeOf("number");
    expect(saved.persona_name).not.toMatch(/coverage|sample size|unlabeled/i);
    expect(stages).toContain("profile:running");
    expect(stages.at(-1)).toBe("profile:complete");
    expect(events.map((event) => event.type)).toEqual(["stage", "done"]);
    expect(JSON.stringify(logs)).toContain("latency_ms");
    expect(JSON.stringify(logs)).toContain("input_tokens");
    await runTasteProfile({
      userId: "user-1",
      store,
      complete,
      emit: () => undefined,
    });
    expect(calls).toBe(2);
  });

  it("returns a typed error when every attempt fails", async () => {
    const events: StreamEvent[] = [];
    const run: RunRecord = {
      id: "run-2",
      user_id: "user-1",
      status: "complete",
      stage: "enrich",
      started_at: "2026-11-13T00:00:00Z",
      finished_at: null,
      counts: emptyCounts(),
      error: null,
      checkpoint: {},
    };
    const store: ProfileStore = {
      async latestRun() {
        return run;
      },
      async saveRun(next) {
        Object.assign(run, next);
      },
      async getProfile() {
        return null;
      },
      async saveProfile() {
        throw new Error("should not store");
      },
      async loadListening() {
        return { tracks: [], plays: [], topArtists: [] };
      },
    };
    await expect(
      runTasteProfile({
        userId: "user-1",
        store,
        complete: async () => ({ object: draft(), usage: {} }),
        emit: (event) => events.push(event),
      }),
    ).rejects.toThrow();
    expect(events.some((event) => event.type === "error" && event.code === "profile_invalid")).toBe(true);
    expect(run.status).toBe("error");
  });
});
