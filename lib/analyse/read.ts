import type { VisibleArtist, VisibleTrack } from "@/lib/catalogue/present";
import type { AnalysisStatus } from "@/lib/analyse/status";

export const FUNCTION_MAX_SECONDS = 300;
export const TRACK_STREAM_BUDGET_MS = 240_000;
export const RESULTS_HOLD_MS = 240_000;
export const READ_POLL_MS = 1_000;

export type TrackStreamEvent =
  | { type: "tracks"; tracks: VisibleTrack[]; artists: VisibleArtist[] }
  | { type: "resume"; since?: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Stream tracks during ingest; otherwise return them as JSON. */
export function tracksTransport(status: Pick<AnalysisStatus, "status" | "stage">): "stream" | "json" {
  return status.status === "running" && status.stage === "ingest" ? "stream" : "json";
}

/** Whether the ingest watch should stay open, finish, or error. */
export function ingestWatch(run: { status: string; stage: string; outcome?: string | null } | null): "open" | "done" | "error" {
  if (!run) return "done";
  if (run.status === "error") return "error";
  if (run.outcome === "insufficient_data" || run.status === "complete" || run.stage !== "ingest") return "done";
  return "open";
}

/** Whether results are ready, still loading, or should be retried. */
export function resultsDecision(input: {
  status: AnalysisStatus["status"];
  outcome: AnalysisStatus["outcome"];
  elapsedMs: number;
  budgetMs?: number;
}): "ready" | "insufficient" | "error" | "none" | "wait" | "retry" {
  if (input.status === "none") return "none";
  if (input.status === "error") return "error";
  if (input.outcome === "insufficient_data") return "insufficient";
  if (input.status === "complete") return "ready";
  if (input.elapsedMs >= (input.budgetMs ?? RESULTS_HOLD_MS)) return "retry";
  return "wait";
}

/** Parse a resume timestamp, or return null when it is missing or invalid. */
export function parseSince(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

/** Parse one NDJSON line from the track stream. */
export function parseTrackLine(line: string): TrackStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed) as { type?: string };
    if (!value || typeof value.type !== "string") return null;
    if (value.type === "tracks" || value.type === "resume" || value.type === "done" || value.type === "error") {
      return value as TrackStreamEvent;
    }
    return null;
  } catch {
    return null;
  }
}
