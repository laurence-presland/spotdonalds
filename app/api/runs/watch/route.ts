import { runStatus } from "@/lib/analyse/progress";
import { reviveOrClose } from "@/lib/analyse/reconcile";
import {
  artistKey,
  decodeCursor,
  encodeCursor,
  isTerminalRun,
  STREAM_BUDGET_MS,
  unseenBy,
  WATCH_POLL_MS,
  type WatchEvent,
  type WatchRun,
} from "@/lib/analyse/watch";
import { requireSession } from "@/lib/auth/session";
import { loadCatalogue } from "@/lib/catalogue/load";
import type { VisibleArtist, VisibleTrack } from "@/lib/catalogue/present";
import { safeDbMessage } from "@/lib/db";
import { latestRun } from "@/lib/ingest/store";
import type { RunRecord } from "@/lib/ingest/types";
import { log } from "@/lib/log";
import { loadResults } from "@/lib/results/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UNAVAILABLE = "The page didn't load. Try again.";

export async function GET(request: Request) {
  const user = await requireSession();
  if (user instanceof Response) return user;

  let run: RunRecord | null;
  try {
    run = await reviveOrClose(await latestRun(user.id));
  } catch (error) {
    log("error", "watch.load", { message: safeDbMessage(error), user_id: user.id });
    return Response.json({ error: "unavailable", message: UNAVAILABLE }, { status: 503 });
  }

  if (!run || isTerminalRun(run)) {
    try {
      const [catalogue, analysis] = await Promise.all([
        loadCatalogue(user.id),
        run && run.status === "complete" && run.outcome !== "insufficient_data" ? loadResults(user.id) : Promise.resolve(null),
      ]);
      return Response.json({
        kind: "snapshot",
        run: runStatus(run).run,
        tracks: catalogue.tracks,
        artists: catalogue.artists,
        analysis,
      });
    } catch (error) {
      log("error", "watch.load", { message: safeDbMessage(error), user_id: user.id });
      return Response.json({ error: "unavailable", message: UNAVAILABLE }, { status: 503 });
    }
  }

  const cursor = decodeCursor(new URL(request.url).searchParams.get("cursor"));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: WatchEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const seenTracks = new Set(cursor?.trackIds ?? []);
      const seenArtists = new Set(cursor?.artistKeys ?? []);
      let stage = cursor?.stage ?? run?.stage ?? "";
      const started = Date.now();
      try {
        let current = await reviveOrClose(await latestRun(user.id));
        let catalogue = await loadCatalogue(user.id);
        emitView(send, catalogue, seenTracks, seenArtists);
        if (current) send({ type: "run", run: toWatchRun(current) });
        if (isTerminalRun(current) && current) {
          send({ type: "terminal", run: toWatchRun(current) });
          return;
        }
        while (Date.now() - started < STREAM_BUDGET_MS) {
          await sleep(WATCH_POLL_MS);
          if (Date.now() - started >= STREAM_BUDGET_MS) break;
          current = await reviveOrClose(await latestRun(user.id));
          catalogue = await loadCatalogue(user.id);
          const changed = emitView(send, catalogue, seenTracks, seenArtists);
          if (current && (changed || current.stage !== stage)) {
            send({ type: "run", run: toWatchRun(current) });
            stage = current.stage;
          }
          if (isTerminalRun(current) && current) {
            send({ type: "terminal", run: toWatchRun(current) });
            return;
          }
        }
        send({
          type: "resume",
          cursor: encodeCursor({ stage, trackIds: [...seenTracks], artistKeys: [...seenArtists] }),
        });
      } catch (error) {
        log("error", "watch.stream", { message: safeDbMessage(error), user_id: user.id });
        send({ type: "error", message: UNAVAILABLE });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function emitView(
  send: (event: WatchEvent) => void,
  catalogue: { tracks: VisibleTrack[]; artists: VisibleArtist[] },
  seenTracks: Set<string>,
  seenArtists: Set<string>,
): boolean {
  const tracks = unseenBy(catalogue.tracks, seenTracks, (track) => track.id);
  const artists = unseenBy(catalogue.artists, seenArtists, artistKey);
  for (const track of tracks) seenTracks.add(track.id);
  for (const artist of artists) seenArtists.add(artistKey(artist));
  if (tracks.length > 0 || artists.length > 0) send({ type: "tracks", tracks, artists });
  return tracks.length > 0 || artists.length > 0;
}

function toWatchRun(run: RunRecord): WatchRun {
  const status = runStatus(run).run;
  return status ?? { status: run.status, stage: run.stage, error: run.error, outcome: run.outcome ?? null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
