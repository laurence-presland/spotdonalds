"use client";

import { useState } from "react";
import { AnalysingScreen, type AnalysisResults } from "@/components/analysing/AnalysingScreen";
import { InsufficientData } from "@/components/flow/InsufficientData";
import { ResultsScreen } from "@/components/flow/ResultsScreen";
import { Welcome } from "@/components/flow/Welcome";
import type { AnalysisStatus } from "@/lib/analyse/status";

export function DriveThrough({ welcome }: { welcome: boolean }) {
  const [overlay, setOverlay] = useState(welcome);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [insufficient, setInsufficient] = useState<number | null>(null);

  function noteStatus(status: AnalysisStatus) {
    if (status.status !== "running") setOverlay(false);
  }

  if (!overlay && insufficient != null) return <InsufficientData count={insufficient} />;
  if (!overlay && results) {
    return (
      <ResultsScreen
        profile={results.profile}
        order={results.order}
        menu={results.menu}
        aggregates={results.aggregates}
        orderFailed={results.order == null}
        history={results.history}
      />
    );
  }

  return (
    <>
      <AnalysingScreen
        holdUntilData={!welcome}
        onStatus={noteStatus}
        onResults={setResults}
        onInsufficient={setInsufficient}
      />
      {overlay ? <Welcome onDone={() => setOverlay(false)} /> : null}
    </>
  );
}
