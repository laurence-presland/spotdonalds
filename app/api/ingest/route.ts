import { getSpotifyAccessToken, SpotifyTokenError } from "@/lib/auth/tokens";
import { tokenStore } from "@/lib/auth/token-store";
import { requireSession } from "@/lib/auth/session";
import { ingestStore } from "@/lib/ingest/store";
import { runIngest } from "@/lib/ingest/run";
import { createSpotifyClient } from "@/lib/spotify/client";
import { ndjsonResponse } from "@/lib/stream/ndjson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const user = await requireSession();
  if (user instanceof Response) return user;

  return ndjsonResponse(async (emit) => {
    try {
      const token = await getSpotifyAccessToken(user.id, {
        store: tokenStore(),
        now: Date.now,
        fetch,
      });
      await runIngest({
        userId: user.id,
        client: createSpotifyClient(token),
        store: ingestStore(),
        emit,
      });
    } catch (error) {
      if (error instanceof SpotifyTokenError) {
        emit({
          type: "error",
          code: error.code,
          message: "Spotify needs you to log in again.",
        });
        return;
      }
      throw error;
    }
  });
}
