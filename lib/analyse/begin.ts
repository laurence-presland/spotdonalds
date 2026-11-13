import { ensureAnalysisJob } from "@/lib/analyse/start";
import { insertOpenRun, loadLatestRun } from "@/lib/analysis-run";

export async function beginFirstFlow(userId: string): Promise<void> {
  const latest = await loadLatestRun(userId);
  if (latest) return;
  const run = await insertOpenRun(userId, new Date().toISOString());
  await ensureAnalysisJob(userId, run.id);
}
