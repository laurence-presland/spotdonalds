import { reviveOrClose } from "@/lib/analyse/reconcile";
import { analysisStatus, type AnalysisStatus } from "@/lib/analyse/status";
import { countDistinctTracks } from "@/lib/analyse/tracks";
import { loadLatestRun } from "@/lib/analysis-run";
import type { RunRecord } from "@/lib/ingest/types";

export async function currentAnalysis(userId: string): Promise<{ run: RunRecord | null; body: AnalysisStatus }> {
  const run = await reviveOrClose(await loadLatestRun(userId));
  const trackCount = run ? await countDistinctTracks(userId) : 0;
  return { run, body: analysisStatus(run, trackCount) };
}
