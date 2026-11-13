"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { NotAllowlisted } from "@/components/NotAllowlisted";
import { AnalysingView } from "@/components/analysing/AnalysingView";
import { reconnectDelay } from "@/lib/analysing/backoff";
import { initialAnalysingState, reduceAnalysis, type RunSnapshot } from "@/lib/analysing/reduce";
import type { VisibleArtist, VisibleTrack } from "@/lib/catalogue/present";

const POLL_MS = 1500;

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
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function catalogue() {
      const response = await fetch("/api/catalogue");
      if (!response.ok) return;
      const body = (await response.json()) as { tracks: VisibleTrack[]; artists: VisibleArtist[] };
      if (!cancelled) dispatch({ type: "hydrate", tracks: body.tracks, artists: body.artists });
    }

    async function tick(attempt: number) {
      try {
        const response = await fetch("/api/runs");
        if (response.status === 401 || cancelled) return;
        if (!response.ok) throw new Error("status");
        const body = (await response.json()) as { run: (RunSnapshot & { id: string }) | null };
        if (cancelled) return;
        dispatch({ type: "snapshot", run: body.run });
        await catalogue();
        const run = body.run;
        if (run?.status === "error") return;
        if (run?.stage === "done" && run.status === "complete") {
          onAdvanceRef.current?.();
          return;
        }
        dispatch({ type: "connection", status: "streaming", message: null });
        timer = setTimeout(() => void tick(0), POLL_MS);
      } catch {
        if (cancelled) return;
        if (attempt >= 6) {
          dispatch({ type: "connection", status: "error", message: "The connection dropped." });
          return;
        }
        dispatch({ type: "connection", status: "reconnecting", message: "Reconnecting" });
        timer = setTimeout(() => void tick(attempt + 1), reconnectDelay(attempt));
      }
    }

    async function start() {
      dispatch({ type: "connection", status: "streaming", message: null });
      if (autostart && generation === 0) await fetch("/api/analyse", { method: "POST" });
      if (!cancelled) await tick(0);
    }

    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
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
      onRetry={state.status === "error" ? () => void retry() : undefined}
      onStartFresh={state.status === "error" ? () => void startFresh() : undefined}
    />
  );
}
