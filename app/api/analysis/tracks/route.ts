import { currentAnalysis } from "@/lib/analyse/current";
import {
  ingestWatch,
  parseSince,
  READ_POLL_MS,
  TRACK_STREAM_BUDGET_MS,
  tracksTransport,
  type TrackStreamEvent,
} from "@/lib/analyse/read";
import { requireSession } from "@/lib/auth/session";
import { loadCatalogue } from "@/lib/catalogue/load";
import { safeDbMessage } from "@/lib/db";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UNAVAILABLE = "The listening data didn't load. Try again.";

export async function GET(request: Request) {
  const user = await requireSession();
  if (user instanceof Response) return user;
  try {
    const { run, body } = await currentAnalysis(user.id);
    if (tracksTransport(body) === "json") {
      const catalogue = await loadCatalogue(user.id, { includeUnenriched: true });
      return Response.json({ ...body, tracks: catalogue.tracks, artists: catalogue.artists });
    }
    const since = parseSince(new URL(request.url).searchParams.get("since"));
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: TrackStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        let watermark = since;
        const started = Date.now();
        const signal = request.signal;
        try {
          let current = run;
          while (true) {
            const loaded = await loadCatalogue(user.id, { includeUnenriched: true, since: watermark });
            if (loaded.tracks.length > 0 || loaded.artists.length > 0) {
              send({ type: "tracks", tracks: loaded.tracks, artists: loaded.artists });
            }
            if (loaded.storedAt) watermark = loaded.storedAt;
            const watch = ingestWatch(current);
            if (watch === "error") {
              send({ type: "error", message: current?.error ?? "The analysis stopped." });
              return;
            }
            if (watch === "done") {
              send({ type: "done" });
              return;
            }
            if (signal.aborted) return;
            if (Date.now() - started >= TRACK_STREAM_BUDGET_MS) {
              send(watermark ? { type: "resume", since: watermark } : { type: "resume" });
              return;
            }
            await sleep(READ_POLL_MS);
            current = (await currentAnalysis(user.id)).run;
          }
        } catch (error) {
          log("error", "analysis.tracks", { user_id: user.id, message: safeDbMessage(error) });
          send({ type: "error", message: UNAVAILABLE });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    log("error", "analysis.tracks", { user_id: user.id, message: safeDbMessage(error) });
    return Response.json({ error: "unavailable", message: UNAVAILABLE }, { status: 503 });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
