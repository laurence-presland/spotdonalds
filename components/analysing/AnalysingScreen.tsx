"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { NotAllowlisted } from "@/components/NotAllowlisted";
import { AnalysingView } from "@/components/analysing/AnalysingView";
import { reconnectDelay } from "@/lib/analysing/backoff";
import { initialAnalysingState, reduceAnalysis, type RunSnapshot } from "@/lib/analysing/reduce";
import { parseWatchLine, type WatchEvent, type WatchRun } from "@/lib/analyse/watch";
import type { VisibleArtist, VisibleTrack } from "@/lib/catalogue/present";

const DROPPED = "The connection dropped. Try again.";

export function AnalysingScreen({
  autostart = false,
  onAdvance,
}: {
  autostart?: boolean;
  onAdvance?: () => void;
}) {
  const [state, dispatch] = useReducer(reduceAnalysis, initialAnalysingState);
  const [generation, setGeneration] = useState(0);
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  });

  useEffect(() => {
    const controller = new AbortController();
    let cursor: string | null = null;
    let attempt = 0;

    function fail(message: string) {
      dispatch({ type: "connection", status: "dropped", message });
    }

    async function read(signal: AbortSignal): Promise<"advance" | "stay" | "again" | string> {
      const url = cursor ? `/api/runs/watch?cursor=${encodeURIComponent(cursor)}` : "/api/runs/watch";
      const response = await fetch(url, { signal, headers: { accept: "application/x-ndjson, application/json" } });
      if (signal.aborted) return "stay";
      if (response.status === 401) return "stay";
      if (response.status === 503) throw new Error(await errorMessage(response));
      if (!response.ok) throw new Error(DROPPED);
      const type = response.headers.get("content-type") ?? "";
      if (type.includes("application/json")) {
        const body = (await response.json()) as {
          run: (RunSnapshot & WatchRun) | null;
          tracks: VisibleTrack[];
          artists: VisibleArtist[];
        };
        dispatch({ type: "hydrate", tracks: body.tracks ?? [], artists: body.artists ?? [] });
        return applyRun(body.run);
      }
      if (!response.body) throw new Error(DROPPED);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const event = parseWatchLine(line);
          if (!event) continue;
          const step = applyEvent(event);
          if (step === "continue") continue;
          if (step === "advance" || step === "stay") return step;
          return step;
        }
      }
      return "again";
    }

    function applyEvent(event: WatchEvent): "advance" | "stay" | "continue" | string {
      if (event.type === "tracks") {
        dispatch({ type: "hydrate", tracks: event.tracks, artists: event.artists });
        return "continue";
      }
      if (event.type === "run") return applyRun(event.run);
      if (event.type === "terminal") {
        applyRun(event.run);
        return "advance";
      }
      if (event.type === "resume") return event.cursor;
      dispatch({ type: "connection", status: "dropped", message: event.message || DROPPED });
      return "stay";
    }

    function applyRun(run: RunSnapshot | WatchRun | null): "advance" | "stay" | "continue" {
      if (!run) {
        fail("The analysis didn't start. Try again.");
        return "stay";
      }
      dispatch({
        type: "snapshot",
        run: {
          status: run.status,
          stage: run.stage,
          error: run.error,
          progress: "progress" in run && run.progress ? run.progress : { done: 0, total: 0 },
        },
      });
      if (run.status === "error" || run.outcome === "insufficient_data" || (run.stage === "done" && run.status === "complete")) {
        return "advance";
      }
      dispatch({ type: "connection", status: "streaming", message: null });
      return "continue";
    }

    async function loop() {
      dispatch({ type: "connection", status: "streaming", message: null });
      if (autostart && generation === 0) {
        const started = await fetch("/api/analyse", { method: "POST", signal: controller.signal });
        if (started.status === 503) throw new Error(await errorMessage(started));
      }
      while (!controller.signal.aborted) {
        const next = await read(controller.signal);
        if (next === "stay") return;
        if (next === "advance") {
          onAdvanceRef.current?.();
          return;
        }
        if (next === "again") {
          attempt += 1;
          if (attempt >= 6) {
            fail(DROPPED);
            return;
          }
          dispatch({ type: "connection", status: "reconnecting", message: "Reconnecting" });
          await wait(reconnectDelay(attempt), controller.signal);
          continue;
        }
        cursor = next;
        attempt = 0;
      }
    }

    void loop().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      fail(error instanceof Error && error.message ? error.message : DROPPED);
    });

    return () => controller.abort();
  }, [autostart, generation]);

  async function retry() {
    await fetch("/api/analyse?retry=1", { method: "POST" });
    setGeneration((value) => value + 1);
  }

  async function startFresh() {
    await fetch("/api/analyse?fresh=1", { method: "POST" });
    setGeneration((value) => value + 1);
  }

  if (state.status === "access") return <NotAllowlisted />;
  return (
    <AnalysingView
      state={state}
      onRetry={
        state.status === "error" ? () => void retry() : state.status === "dropped" ? () => setGeneration((value) => value + 1) : undefined
      }
      onStartFresh={state.status === "error" ? () => void startFresh() : undefined}
    />
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

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
