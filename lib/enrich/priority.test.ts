import { describe, expect, it } from "vitest";
import { tracksForProfile } from "@/lib/enrich/priority";

describe("tracks for the profile", () => {
  it("keeps the highest ranked tracks, then the newest plays, and caps the list", () => {
    const ids = tracksForProfile([
      { id: "play-new", rank: null, playedAt: "2026-11-13T00:00:00.000Z" },
      { id: "play-old", rank: null, playedAt: "2026-01-01T00:00:00.000Z" },
      { id: "top-2", rank: 2, playedAt: null },
      { id: "top-1", rank: 1, playedAt: "2026-11-01T00:00:00.000Z" },
    ], 3);
    expect(ids).toEqual(["top-1", "top-2", "play-new"]);
  });
});