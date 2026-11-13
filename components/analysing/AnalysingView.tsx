"use client";

import { useState } from "react";
import type { AnalysingState } from "@/lib/analysing/reduce";
import type { Term } from "@/lib/stream/events";
import { DataCredit } from "@/components/DataCredit";
import { IngestionProgress } from "@/components/analysing/IngestionProgress";
import { TrackList, type ListTab } from "@/components/analysing/TrackList";

const TABS: { id: ListTab; label: string }[] = [
  { id: "recent", label: "Recent plays" },
  { id: "top-tracks", label: "Top tracks" },
  { id: "top-artists", label: "Top artists" },
];

const WINDOWS: { id: Term | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "short_term", label: "4 weeks" },
  { id: "medium_term", label: "6 months" },
  { id: "long_term", label: "1 year" },
];

export function AnalysingView({
  state,
  initialTab = "recent",
  onRetry,
  onStartFresh,
}: {
  state: AnalysingState;
  initialTab?: ListTab;
  onRetry?: () => void;
  onStartFresh?: () => void;
}) {
  const [tab, setTab] = useState<ListTab>(initialTab);
  const [window, setWindow] = useState<Term | "all">("all");

  return (
    <div className="analysing">
      <header className="bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wordmark wordmark-bar" src="/brand/wordmark-yellow.svg" alt="SpotDonalds" />
      </header>
      <main className="analysing-main">
        <h1>Analysing your listening history</h1>
        <IngestionProgress
          stage={state.stage}
          count={state.tracks.length}
          progressDone={state.progressDone}
          progressTotal={state.progressTotal}
        />
        {state.status === "reconnecting" ? (
          <p className="status-banner" role="status">
            Reconnecting
          </p>
        ) : null}
        {state.status === "error" || state.status === "dropped" ? (
          <div className="status-banner" role="alert">
            <p>{state.message ?? "The analysis stopped."}</p>
            <div className="button-row">
              {onRetry ? (
                <button type="button" className="button" onClick={onRetry}>
                  Try again
                </button>
              ) : null}
              {onStartFresh ? (
                <button type="button" className="button" onClick={onStartFresh}>
                  Start fresh
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="tabs" role="tablist" aria-label="Listening lists">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "tab tab-active" : "tab"}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab !== "recent" ? (
          <div className="windows" role="group" aria-label="Time window">
            {WINDOWS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={window === item.id ? "chip chip-active" : "chip"}
                aria-pressed={window === item.id}
                onClick={() => setWindow(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <TrackList state={state} tab={tab} window={window} />
        <DataCredit />
      </main>
    </div>
  );
}
