import type { VisibleArtist, VisibleTrack } from "@/lib/catalogue/present";

export const STREAM_BUDGET_MS = 240_000;
export const WATCH_POLL_MS = 1000;

export type WatchCursor = {
  stage: string;
  trackIds: string[];
  artistKeys: string[];
};

export type WatchRun = {
  id?: string;
  status: string;
  stage: string;
  error: string | null;
  outcome?: string | null;
  track_count?: number | null;
  progress?: { done: number; total: number };
};

export type WatchEvent =
  | { type: "tracks"; tracks: VisibleTrack[]; artists: VisibleArtist[] }
  | { type: "run"; run: WatchRun }
  | { type: "terminal"; run: WatchRun }
  | { type: "resume"; cursor: string }
  | { type: "error"; message: string };

/** Stable key for an artist in a time window. */
export function artistKey(artist: { id: string; time_range: string }): string {
  return `${artist.id}:${artist.time_range}`;
}

/** Encode a watch cursor as a base64url string. */
export function encodeCursor(cursor: WatchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Decode a watch cursor, or return null if it is invalid. */
export function decodeCursor(value: string | null): WatchCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<WatchCursor>;
    if (!parsed || typeof parsed.stage !== "string" || !Array.isArray(parsed.trackIds)) return null;
    return {
      stage: parsed.stage,
      trackIds: parsed.trackIds.filter((id): id is string => typeof id === "string"),
      artistKeys: Array.isArray(parsed.artistKeys)
        ? parsed.artistKeys.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return null;
  }
}

/** Return items whose key has not already been seen. */
export function unseenBy<T>(items: T[], seen: Set<string>, key: (item: T) => string): T[] {
  return items.filter((item) => !seen.has(key(item)));
}

/** True when the run has finished, failed, or left ingest. */
export function isTerminalRun(run: { status: string; stage: string; outcome?: string | null } | null): boolean {
  if (!run) return false;
  if (run.outcome === "insufficient_data") return true;
  if (run.status === "error") return true;
  return run.status === "complete" && run.stage === "done";
}

/** Parse one NDJSON line from the ingest watch stream. */
export function parseWatchLine(line: string): WatchEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed) as { type?: string };
    if (!value || typeof value !== "object" || typeof value.type !== "string") return null;
    if (value.type === "tracks" || value.type === "run" || value.type === "terminal" || value.type === "resume" || value.type === "error") {
      return value as WatchEvent;
    }
    return null;
  } catch {
    return null;
  }
}
