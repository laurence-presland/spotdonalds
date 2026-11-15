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

  it("falls back to the first credited artist's tags when the recording has none", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/isrc/")) {
        return Response.json({
          recordings: [
            {
              id: "rec-1",
              tags: [],
              "artist-credit": [{ artist: { id: "artist-1", name: "Ada" } }],
            },
          ],
        });
      }
      if (url.includes("/artist/artist-1")) {
        return Response.json({
          id: "artist-1",
          tags: [{ name: "Indie Electronic", count: 4 }],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const hit = await createMusicBrainz({
      fetch: fetchImpl,
      sleep: async () => undefined,
      wait: async () => undefined,
      userAgent: "SpotDonalds/test (test@example.com)",
    }).lookup(track);
    expect(hit.matched).toBe(true);
    expect(hit.confidence).toBe("high");
    expect(hit.tags[0]).toMatchObject({
      name: "indie electronic",
      original: "Indie Electronic",
      count: 4,
      origin: "artist",
      confidence: "low",
      sourceUrl: "https://musicbrainz.org/artist/artist-1",
    });
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining("/isrc/AUXYZ2400001"),
      expect.stringContaining("/artist/artist-1?inc=tags+genres"),
    ]);
  });

  it("uses release-group tags, then release tags, when the artist has none either", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/isrc/")) {
        return Response.json({
          recordings: [
            {
              id: "rec-2",
              "artist-credit": [{ artist: { id: "artist-2", name: "Ada" } }],
            },
          ],
        });
      }
      if (url.includes("/artist/artist-2")) {
        return Response.json({ id: "artist-2", tags: [], genres: [] });
      }
      if (url.includes("/release?") && url.includes("recording=rec-2")) {
        return Response.json({
          releases: [
            {
              id: "rel-1",
              tags: [{ name: "House", count: 1 }],
              "release-group": {
                id: "rg-1",
                tags: [{ name: "Dance", count: 2 }],
              },
            },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const withGroup = await createMusicBrainz({
      fetch: fetchImpl,
      sleep: async () => undefined,
      wait: async () => undefined,
      userAgent: "SpotDonalds/test (test@example.com)",
    }).lookup(track);
    expect(withGroup.tags).toEqual([
      expect.objectContaining({
        name: "dance",
        origin: "release",
        confidence: "low",
        sourceUrl: "https://musicbrainz.org/release-group/rg-1",
      }),
    ]);

    const releaseOnly = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/isrc/")) {
        return Response.json({
          recordings: [
            {
              id: "rec-2",
              "artist-credit": [{ artist: { id: "artist-2", name: "Ada" } }],
            },
          ],
        });
      }
      if (url.includes("/artist/")) return Response.json({ id: "artist-2", tags: [] });
      if (url.includes("/release?")) {
        return Response.json({
          releases: [
            {
              id: "rel-1",
              tags: [{ name: "House", count: 1 }],
              "release-group": { id: "rg-1", tags: [] },
            },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const hit = await createMusicBrainz({
      fetch: releaseOnly,
      sleep: async () => undefined,
      wait: async () => undefined,
      userAgent: "SpotDonalds/test (test@example.com)",
    }).lookup(track);
    expect(hit.tags[0]).toMatchObject({
      name: "house",
      origin: "release",
      confidence: "low",
      sourceUrl: "https://musicbrainz.org/release/rel-1",
    });
  });

  it("fetches the recording on a search match when the artist id is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/isrc/")) return new Response("missing", { status: 404 });
      if (url.includes("/recording?")) {
        return Response.json({ recordings: [{ id: "rec-3", score: 92, tags: [] }] });
      }
      if (url.includes("/recording/rec-3")) {
        return Response.json({
          id: "rec-3",
          tags: [],
          "artist-credit": [{ artist: { id: "artist-3", name: "Ada" } }],
        });
      }
      if (url.includes("/artist/artist-3")) {
        return Response.json({ id: "artist-3", genres: [{ name: "Jazz", count: 2 }] });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const hit = await createMusicBrainz({
      fetch: fetchImpl,
      sleep: async () => undefined,
      wait: async () => undefined,
      userAgent: "SpotDonalds/test (test@example.com)",
    }).lookup(track);
    expect(hit.tags[0]).toMatchObject({
      name: "jazz",
      origin: "artist",
      confidence: "low",
      sourceUrl: "https://musicbrainz.org/artist/artist-3",
    });
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining("/isrc/"),
      expect.stringContaining("/recording?"),
      expect.stringContaining("/recording/rec-3?inc=tags+genres+artist-credits"),
      expect.stringContaining("/artist/artist-3?inc=tags+genres"),
    ]);
  });

  it("does not call artist or release when the recording already has tags", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/isrc/")) {
        return Response.json({
          recordings: [
            {
              id: "rec-4",
              tags: [{ name: "Rock", count: 2 }],
              "artist-credit": [{ artist: { id: "artist-4", name: "Ada" } }],
            },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const hit = await createMusicBrainz({
      fetch: fetchImpl,
      sleep: async () => undefined,
      wait: async () => undefined,
      userAgent: "SpotDonalds/test (test@example.com)",
    }).lookup(track);
    expect(hit.tags[0]).toMatchObject({ name: "rock", origin: "recording", confidence: "high" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("waits a second before each artist or release fallback call", async () => {
    let time = 0;
    const sleep = vi.fn(async (ms: number) => {
      time += ms;
    });
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/isrc/")) {
        return Response.json({
          recordings: [
            {
              id: "rec-5",
              "artist-credit": [{ artist: { id: "artist-5", name: "Ada" } }],
            },
          ],
        });
      }
      if (url.includes("/artist/")) return Response.json({ id: "artist-5", tags: [] });
      if (url.includes("/release?")) {
        return Response.json({
          releases: [{ id: "rel-5", tags: [{ name: "Electronic", count: 1 }] }],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const hit = await createMusicBrainz({
      fetch: fetchImpl,
      sleep,
      wait: createRateLimiter(1000, { now: () => time, sleep }),
      userAgent: "SpotDonalds/test (test@example.com)",
    }).lookup(track);
    expect(hit.tags[0]?.name).toBe("electronic");
    expect(time).toBeGreaterThanOrEqual(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const headers = new Headers((fetchImpl.mock.calls[1]?.[1] as RequestInit | undefined)?.headers);
    expect(headers.get("User-Agent")).toBe("SpotDonalds/test (test@example.com)");
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
