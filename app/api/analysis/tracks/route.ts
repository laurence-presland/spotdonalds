import { currentAnalysis } from "@/lib/analyse/current";
import {
  artistStreamKey,
  decodeTrackCursor,
  encodeTrackCursor,
  ingestWatch,
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
    const catalogue = await loadCatalogue(user.id, { includeUnenriched: true });
    if (tracksTransport(body) === "json") {
      return Response.json({ ...body, tracks: catalogue.tracks, artists: catalogue.artists });
    }
    const cursor = decodeTrackCursor(new URL(request.url).searchParams.get("cursor"));
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: TrackStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        const seenTracks = new Set(cursor?.trackIds ?? []);
        const seenArtists = new Set(cursor?.artistKeys ?? []);
        const started = Date.now();
        const signal = request.signal;
        try {
          let current = run;
          let tracks = catalogue.tracks;
          let artists = catalogue.artists;
          while (true) {
            const freshTracks = tracks.filter((track) => !seenTracks.has(track.id));
            const freshArtists = artists.filter((artist) => !seenArtists.has(artistStreamKey(artist)));
            if (freshTracks.length > 0 || freshArtists.length > 0) {
              send({ type: "tracks", tracks: freshTracks, artists: freshArtists });
              for (const track of freshTracks) seenTracks.add(track.id);
              for (const artist of freshArtists) seenArtists.add(artistStreamKey(artist));
            }
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
              send({
                type: "resume",
                cursor: encodeTrackCursor({ trackIds: [...seenTracks], artistKeys: [...seenArtists] }),
              });
              return;
            }
            await sleep(READ_POLL_MS);
            const next = await currentAnalysis(user.id);
            current = next.run;
            const loaded = await loadCatalogue(user.id, { includeUnenriched: true });
            tracks = loaded.tracks;
            artists = loaded.artists;
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
