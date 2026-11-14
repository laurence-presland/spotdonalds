import { startOnSignIn } from "@/lib/analyse/sign-in";
import { ensureAnalysisJob } from "@/lib/analyse/start";
import { closeOpenRun, insertOpenRun, loadLatestRun } from "@/lib/analysis-run";

export async function beginFirstFlow(userId: string): Promise<void> {
  await startOnSignIn(userId, {
    loadLatest: loadLatestRun,
    closeOpen: closeOpenRun,
    insert: (id) => insertOpenRun(id, new Date().toISOString()),
    start: ensureAnalysisJob,
  });
}
