import { loadRun } from "@/lib/analysis-run";
import { claimAnalysis, startFreshAnalysis } from "@/lib/analyse/claim";
import { runStatus } from "@/lib/analyse/progress";
import { ensureAnalysisJob } from "@/lib/analyse/start";
import { requireSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await requireSession();
  if (user instanceof Response) return user;
  const params = new URL(request.url).searchParams;
  const fresh = params.get("fresh") === "1";
  const retry = params.get("retry") === "1";
  let run = fresh ? await startFreshAnalysis(user.id) : await claimAnalysis(user.id, retry);
  if (run?.status === "running") {
    await ensureAnalysisJob(user.id, run.id);
    run = (await loadRun(run.id, user.id)) ?? run;
  }
  return Response.json(runStatus(run));
}
