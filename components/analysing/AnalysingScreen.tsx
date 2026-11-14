"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { NotAllowlisted } from "@/components/NotAllowlisted";
import { AnalysingView } from "@/components/analysing/AnalysingView";
import type { ReceiptMenuItem } from "@/components/order/OrderReceipt";
import { initialAnalysingState, reduceAnalysis } from "@/lib/analysing/reduce";
import { analysisErrorCopy } from "@/lib/analyse/progress";
import { parseTrackLine } from "@/lib/analyse/read";
import type { AnalysisStatus } from "@/lib/analyse/status";
import type { Aggregates } from "@/lib/aggregates";
import type { VisibleArtist, VisibleTrack } from "@/lib/catalogue/present";
import type { StoredOrder } from "@/lib/order/run";
import type { StoredProfile } from "@/lib/profile/run";

const DROPPED = "The connection dropped. Try again.";
const NOT_STARTED = "Nothing is running yet.";

export type AnalysisResults = {
  profile: StoredProfile | null;
  order: StoredOrder | null;
  menu: ReceiptMenuItem[];
  aggregates: Aggregates;
};

export function AnalysingScreen({
  tracksOnly = false,
  onStatus,
  onResults,
  onInsufficient,
  onForward,
}: {
  tracksOnly?: boolean;
  onStatus?: (status: AnalysisStatus) => void;
  onResults?: (results: AnalysisResults) => void;
  onInsufficient?: (count: number) => void;
  onForward?: () => void;
}) {
  const [state, dispatch] = useReducer(reduceAnalysis, initialAnalysingState);
  const [generation, setGeneration] = useState(0);
  const statusRef = useRef(onStatus);
  const resultsRef = useRef(onResults);
  const insufficientRef = useRef(onInsufficient);
  useEffect(() => {
    statusRef.current = onStatus;
    resultsRef.current = onResults;
    insufficientRef.current = onInsufficient;
  });

  useEffect(() => {
    const controller = new AbortController();

    function fail(message: string) {
      dispatch({ type: "connection", status: "dropped", message });
    }

    async function readTracks(signal: AbortSignal): Promise<"done" | "error"> {
      let cursor: string | null = null;
      while (!signal.aborted) {
        const url = cursor ? `/api/analysis/tracks?cursor=${encodeURIComponent(cursor)}` : "/api/analysis/tracks";
        const response = await fetch(url, { signal, headers: { accept: "application/x-ndjson, application/json" } });
        if (signal.aborted) return "error";
        if (response.status === 503) throw new Error(await errorMessage(response));
        if (!response.ok || !response.body) throw new Error(DROPPED);
        const type = response.headers.get("content-type") ?? "";
        if (type.includes("application/json")) {
          const body = (await response.json()) as AnalysisStatus & { tracks?: VisibleTrack[]; artists?: VisibleArtist[] };
          dispatch({ type: "hydrate", tracks: body.tracks ?? [], artists: body.artists ?? [] });
          if (body.status === "error") {
            fail(analysisErrorCopy(body.error));
            return "error";
          }
          return "done";
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let resume: string | null = null;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const event = parseTrackLine(line);
            if (!event) continue;
            if (event.type === "tracks") {
              dispatch({ type: "hydrate", tracks: event.tracks, artists: event.artists });
              continue;
            }
            if (event.type === "resume") {
              resume = event.cursor;
              continue;
            }
            if (event.type === "error") {
              if (event.message === "not_allowlisted") dispatch({ type: "connection", status: "access", message: null });
              else fail(analysisErrorCopy(event.message));
              return "error";
            }
            if (event.type === "done") return "done";
          }
        }
        if (resume) {
          cursor = resume;
          dispatch({ type: "connection", status: "reconnecting", message: "Reconnecting" });
          continue;
        }
        throw new Error(DROPPED);
      }
      return "error";
    }

    async function readResults(signal: AbortSignal): Promise<void> {
      dispatch({
        type: "snapshot",
        run: { status: "running", stage: "analyse", error: null, progress: { done: 0, total: 0 } },
      });
      while (!signal.aborted) {
        const response = await fetch("/api/analysis/results", { signal });
        if (signal.aborted) return;
        if (response.status === 503) throw new Error(await errorMessage(response));
        if (response.status === 202) continue;
        if (!response.ok) throw new Error(DROPPED);
        const body = (await response.json()) as AnalysisStatus & Partial<AnalysisResults> & { retry?: boolean };
        if (body.retry) continue;
        if (body.outcome === "insufficient_data") {
          insufficientRef.current?.(body.trackCount);
          return;
        }
        if (body.status === "error") {
          if (body.error === "not_allowlisted") dispatch({ type: "connection", status: "access", message: null });
          else fail(analysisErrorCopy(body.error));
          return;
        }
        if (body.status === "complete" && body.aggregates) {
          resultsRef.current?.({
            profile: body.profile ?? null,
            order: body.order ?? null,
            menu: body.menu ?? [],
            aggregates: body.aggregates,
          });
          return;
        }
        if (body.status === "none") {
          fail(NOT_STARTED);
          return;
        }
        throw new Error(DROPPED);
      }
    }

    async function run(signal: AbortSignal) {
      dispatch({ type: "connection", status: "streaming", message: null });
      const response = await fetch("/api/analysis/status", { signal });
      if (signal.aborted) return;
      if (response.status === 503) throw new Error(await errorMessage(response));
      if (!response.ok) throw new Error(DROPPED);
      const status = (await response.json()) as AnalysisStatus;
      statusRef.current?.(status);
      dispatch({
        type: "snapshot",
        run: {
          status: status.status === "none" ? "running" : status.status,
          stage: status.stage ?? "ingest",
          error: status.error ?? null,
          progress: { done: 0, total: 0 },
          complete: status.status === "complete",
          trackCount: status.trackCount,
        },
      });
      if (status.status === "none") {
        fail(NOT_STARTED);
        return;
      }
      if (status.status === "error") return;
      if (status.outcome === "insufficient_data") {
        insufficientRef.current?.(status.trackCount);
        return;
      }
      if (status.status === "running") {
        const tracks = await readTracks(signal);
        if (tracks !== "done" || tracksOnly || signal.aborted) return;
      } else if (tracksOnly) {
        await readTracks(signal);
        return;
      }
      await readResults(signal);
    }

    void run(controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      fail(error instanceof Error && error.message ? error.message : DROPPED);
    });
    return () => controller.abort();
  }, [generation, tracksOnly]);

  async function retry() {
    await fetch("/api/analyse?retry=1", { method: "POST" });
    setGeneration((value) => value + 1);
  }

  async function startFresh() {
    await fetch("/api/analyse?fresh=1", { method: "POST" });
    setGeneration((value) => value + 1);
  }

  if (state.status === "access") return <NotAllowlisted />;
  if (state.status === "idle") return <AnalysisLoading />;
  const waiting = state.message === NOT_STARTED;
  return (
    <AnalysingView
      state={state}
      onForward={onForward}
      onRetry={state.status === "error" ? () => void retry() : state.status === "dropped" && !waiting ? () => setGeneration((value) => value + 1) : undefined}
      onStartFresh={
        state.status === "error" || waiting ? () => void startFresh() : undefined
      }
    />
  );
}

function AnalysisLoading() {
  return (
    <div className="analysis-loading" role="status">
      <p>Loading</p>
    </div>
  );
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    return "Spotify sign-in didn't respond. Try again.";
  }
  return "Spotify sign-in didn't respond. Try again.";
}
