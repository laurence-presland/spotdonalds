import { describe, expect, it, vi } from "vitest";
import { parseDeezerTrack, createDeezer } from "@/lib/enrich/deezer";
import { createRateLimiter } from "@/lib/enrich/limiter";
import { createMusicBrainz, normaliseIsrc, parseMusicBrainz } from "@/lib/enrich/musicbrainz";
import type { EnrichTrack } from "@/lib/enrich/types";

const track: EnrichTrack = {
  spotify_id: "t1",
  isrc: "AUXYZ2400001",
  name: "Yellow Arches",
  artists: ["Ada"],
  album_name: null,
  album_image_url: null,
};

describe("MusicBrainz", () => {
  it("reads tags from an ISRC hit and falls back to artist and title", () => {
    const hit = parseMusicBrainz(
      { recordings: [{ id: "abc", tags: [{ name: "Indie Pop", count: 2 }] }] },
      "isrc",
    );
    expect(hit.matched).toBe(true);
    expect(hit.confidence).toBe("high");
    expect(hit.tags[0]).toMatchObject({ name: "indie pop", original: "Indie Pop", count: 2 });
    expect(hit.sourceUrl).toBe("https://musicbrainz.org/recording/abc");

    const weak = parseMusicBrainz({ recordings: [{ id: "nope", score: 40 }] }, "search");
    expect(weak.matched).toBe(false);
    const fallback = parseMusicBrainz({ recordings: [{ id: "ok", score: 90, tags: [] }] }, "search");
    expect(fallback.confidence).toBe("low");
  });

  it("waits a second between calls and sends the configured user agent", async () => {
    let time = 0;
    const sleep = vi.fn(async (ms: number) => {
      time += ms;
    });
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ recordings: [] }));
    const provider = createMusicBrainz({
      fetch: fetchImpl,
      sleep,
      wait: createRateLimiter(1000, { now: () => time, sleep }),
      userAgent: "SpotDonalds/test (test@example.com)",
    });
    await provider.lookup(track);
    await provider.lookup({ ...track, isrc: null });
    expect(time).toBeGreaterThanOrEqual(1000);
    const headers = new Headers((fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.headers);
    expect(headers.get("User-Agent")).toBe("SpotDonalds/test (test@example.com)");
  });

  it("treats an unknown ISRC as a miss and searches by artist and title", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/isrc/")) return new Response("missing", { status: 404 });
      return Response.json({ recordings: [{ id: "rec", score: 95, tags: [{ name: "Jazz", count: 1 }] }] });
    });
    const hit = await createMusicBrainz({
      fetch: fetchImpl,
      sleep: async () => undefined,
      wait: async () => undefined,
      userAgent: "SpotDonalds/test (test@example.com)",
    }).lookup({ ...track, isrc: "au-xyz-24-00001" });
    expect(normaliseIsrc("au-xyz-24-00001")).toBe("AUXYZ2400001");
    expect(hit.matched).toBe(true);
    expect(hit.tags[0]?.name).toBe("jazz");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/isrc/AUXYZ2400001");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/recording?");
  });
});

describe("Deezer", () => {
  it("treats bpm 0 as missing and keeps a positive bpm", () => {
    expect(parseDeezerTrack({ id: 9, bpm: 0 }, "isrc").bpm).toBeNull();
    expect(parseDeezerTrack({ id: 9, bpm: 98 }, "isrc").bpm).toBe(98);
    expect(parseDeezerTrack({ error: { type: "DataException" } }, "isrc").matched).toBe(false);
  });

  it("uses the artist and title search when the ISRC misses", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/track/isrc:")) return Response.json({ error: { type: "DataException" } });
      return Response.json({ data: [{ id: 4, bpm: 110 }] });
    });
    const hit = await createDeezer({ fetch: fetchImpl, sleep: async () => {} }).lookup(track);
    expect(hit.matched).toBe(true);
    expect(hit.confidence).toBe("low");
    expect(hit.bpm).toBe(110);
  });
});
