"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { NotAllowlisted } from "@/components/NotAllowlisted";
import { AnalysingView } from "@/components/analysing/AnalysingView";
import { reconnectDelay } from "@/lib/analysing/backoff";
import { initialAnalysingState, reduceAnalysis, type RunSnapshot } from "@/lib/analysing/reduce";
import { isHeartbeatStale, LEASE_STALE_MS } from "@/lib/analyse/progress";
import type { VisibleArtist, VisibleTrack } from "@/lib/catalogue/present";

const POLL_MS = 1500;

export function AnalysingScreen({
  autostart = true,
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

    async function kick(retry: boolean) {
      await fetch(retry ? "/api/analyse?retry=1" : "/api/analyse", { method: "POST" });
    }

    async function tick(attempt: number) {
      try {
        const response = await fetch("/api/runs");
        if (response.status === 401 || cancelled) return;
        if (!response.ok) throw new Error("status");
        const body = (await response.json()) as {
          run: (RunSnapshot & { id: string; heartbeat_at: string | null }) | null;
        };
        if (cancelled) return;
        dispatch({ type: "snapshot", run: body.run });
        await catalogue();
        const run = body.run;
        if (run?.status === "error") return;
        if (run?.stage === "done" && run.status === "complete") {
          onAdvanceRef.current?.();
          return;
        }
        if (run?.status === "running" && isHeartbeatStale(run.heartbeat_at, Date.now(), LEASE_STALE_MS)) {
          await kick(false);
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
      if (autostart) await kick(generation > 0);
      if (!cancelled) await tick(0);
    }

    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [autostart, generation]);

  if (state.status === "access") return <NotAllowlisted />;
  return (
    <AnalysingView
      state={state}
      onRetry={state.status === "error" ? () => setGeneration((value) => value + 1) : undefined}
    />
  );
}
