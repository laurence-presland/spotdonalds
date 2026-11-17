import { createDeezer } from "@/lib/enrich/deezer";
import { createRateLimiter, musicbrainzUserAgent } from "@/lib/enrich/limiter";
import { createMusicBrainz } from "@/lib/enrich/musicbrainz";
import { runEnrich } from "@/lib/enrich/run";
import { enrichStore } from "@/lib/enrich/store";

/** Look up MusicBrainz tags and Deezer tempo for this user's tracks. */
export async function enrichUserTracks(userId: string): Promise<void> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  await runEnrich({
    userId,
    store: enrichStore(),
    musicbrainz: createMusicBrainz({
      fetch,
      sleep,
      userAgent: musicbrainzUserAgent(),
      wait: createRateLimiter(1000, { now: Date.now, sleep }),
    }),
    deezer: createDeezer({ fetch, sleep }),
  });
}
