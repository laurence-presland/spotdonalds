import { requireSession } from "@/lib/auth/session";
import { createDeezer } from "@/lib/enrich/deezer";
import { createRateLimiter, musicbrainzUserAgent } from "@/lib/enrich/limiter";
import { createMusicBrainz } from "@/lib/enrich/musicbrainz";
import { runEnrich } from "@/lib/enrich/run";
import { enrichStore } from "@/lib/enrich/store";
import { ndjsonResponse } from "@/lib/stream/ndjson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const user = await requireSession();
  if (user instanceof Response) return user;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const musicbrainz = createMusicBrainz({
    fetch,
    sleep,
    userAgent: musicbrainzUserAgent(),
    wait: createRateLimiter(1000, { now: Date.now, sleep }),
  });
  const deezer = createDeezer({ fetch, sleep });
  return ndjsonResponse((emit) =>
    runEnrich({
      userId: user.id,
      store: enrichStore(),
      musicbrainz,
      deezer,
      emit,
      timeBudgetMs: 45_000,
    }),
  );
}
