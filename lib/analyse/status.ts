import type { RunOutcome, RunRecord, RunStage } from "@/lib/ingest/types";

export type AnalysisStage = Exclude<RunStage, "analyse"> | null;
export type AnalysisState = "none" | "running" | "complete" | "error";

export type AnalysisStatus = {
  status: AnalysisState;
  stage: AnalysisStage;
  outcome: RunOutcome | null;
  error?: string;
  trackCount: number;
};

const STAGES: AnalysisStage[] = ["ingest", "enrich", "profile", "popularity", "order", "done"];

/** Public analysis status for the client, from the run and track count. */
export function analysisStatus(run: RunRecord | null, trackCount: number): AnalysisStatus {
  if (!run) return { status: "none", stage: null, outcome: null, trackCount };
  const count = typeof run.checkpoint.track_count === "number" ? run.checkpoint.track_count : trackCount;
  const stage = storedStage(run.stage);
  if (run.status === "error") {
    return {
      status: "error",
      stage,
      outcome: null,
      error: run.error ?? "The analysis stopped.",
      trackCount: count,
    };
  }
  if (run.outcome === "insufficient_data") {
    return { status: "complete", stage, outcome: "insufficient_data", trackCount: count };
  }
  if (run.status === "complete") {
    return { status: "complete", stage, outcome: run.outcome ?? null, trackCount: count };
  }
  return { status: "running", stage, outcome: null, trackCount: count };
}

/** Keep a stage the client understands, and drop anything else. */
function storedStage(stage: string): AnalysisStage {
  return STAGES.find((known) => known === stage) ?? null;
}
