"use client";

import { useEffect, useReducer } from "react";
import { NotAllowlisted } from "@/components/NotAllowlisted";
import { AnalysingView } from "@/components/analysing/AnalysingView";
import { reconnectDelay } from "@/lib/analysing/backoff";
import { initialAnalysingState, reduceAnalysis } from "@/lib/analysing/reduce";
import type { VisibleArtist, VisibleTrack } from "@/lib/catalogue/present";
import { parseNdjsonChunk } from "@/lib/stream/parse";
import type { StreamEvent } from "@/lib/stream/events";

const STOP_CODES = new Set(["not_allowlisted", "reauth_required", "missing"]);

export function AnalysingScreen() {
  const [state, dispatch] = useReducer(reduceAnalysis, initialAnalysingState);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const response = await fetch("/api/catalogue");
      if (!response.ok) return;
      const body = (await response.json()) as { tracks: VisibleTrack[]; artists: VisibleArtist[] };
      if (!cancelled) dispatch({ type: "hydrate", tracks: body.tracks, artists: body.artists });
    }
    async function read(url: string): Promise<"ok" | "retry" | "stop"> {
      const response = await fetch(url, { method: "POST" });
      if (response.status === 401) return "stop";
      if (!response.ok || !response.body) return "retry";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";
      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) break;
        const parsed = parseNdjsonChunk(rest, decoder.decode(value, { stream: true }));
        rest = parsed.rest;
        for (const event of parsed.events) {
          dispatch({ type: "event", event });
          const stop = terminal(event);
          if (stop) return stop;
        }
      }
      return "ok";
    }
    async function run(attempt: number) {
      try {
        if (!cancelled) dispatch({ type: "connection", status: "streaming", message: null });
        await hydrate();
        const ingest = await read("/api/ingest");
        if (ingest === "stop" || cancelled) return;
        if (ingest === "retry") throw new Error("ingest dropped");
        const enrich = await read("/api/enrich");
        if (enrich === "stop" || cancelled) return;
        if (enrich === "retry") throw new Error("enrich dropped");
      } catch {
        if (cancelled || attempt >= 6) {
          if (!cancelled) {
            dispatch({ type: "connection", status: "error", message: "The connection dropped." });
          }
          return;
        }
        dispatch({ type: "connection", status: "reconnecting", message: "Reconnecting" });
        await new Promise((resolve) => setTimeout(resolve, reconnectDelay(attempt)));
        if (!cancelled) await run(attempt + 1);
      }
    }
    void run(0);
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "access") return <NotAllowlisted />;
  return <AnalysingView state={state} />;
}

function terminal(event: StreamEvent): "stop" | "retry" | null {
  if (event.type !== "error") return null;
  return STOP_CODES.has(event.code) ? "stop" : "retry";
}
