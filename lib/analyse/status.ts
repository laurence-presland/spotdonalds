import type { RunOutcome, RunRecord } from "@/lib/ingest/types";

export type AnalysisStage = "ingest" | "analyse" | null;
export type AnalysisState = "none" | "running" | "complete" | "error";

export type AnalysisStatus = {
  status: AnalysisState;
  stage: AnalysisStage;
  outcome: RunOutcome | null;
  error?: string;
  trackCount: number;
};

export function analysisStatus(run: RunRecord | null, trackCount: number): AnalysisStatus {
  if (!run) return { status: "none", stage: null, outcome: null, trackCount };
  const count = typeof run.checkpoint.track_count === "number" ? run.checkpoint.track_count : trackCount;
  if (run.status === "error") {
    return {
      status: "error",
      stage: visibleStage(run.stage),
      outcome: null,
      error: run.error ?? "The analysis stopped.",
      trackCount: count,
    };
  }
  if (run.outcome === "insufficient_data") {
    return { status: "complete", stage: null, outcome: "insufficient_data", trackCount: count };
  }
  if (run.status === "complete" && run.stage === "done") {
    return { status: "complete", stage: null, outcome: run.outcome ?? "ready", trackCount: count };
  }
  return { status: "running", stage: visibleStage(run.stage) ?? "analyse", outcome: null, trackCount: count };
}

export function visibleStage(stage: string): AnalysisStage {
  if (stage === "done") return null;
  if (stage === "ingest") return "ingest";
  return "analyse";
}
