import { claimAnalysis, startFreshAnalysis } from "@/lib/analyse/claim";
import { runStatus } from "@/lib/analyse/progress";
import { ensureAnalysisJob } from "@/lib/analyse/start";
import { getSessionUser } from "@/lib/auth/session";
import { safeDbMessage } from "@/lib/db";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const fresh = params.get("fresh") === "1";
  const retry = params.get("retry") === "1";
  const run = fresh ? await startFreshAnalysis(user.id) : await claimAnalysis(user.id, retry);
  if (run?.status === "running") {
    try {
      await ensureAnalysisJob(user.id, run.id);
    } catch (error) {
      log("error", "analyse.start_failed", { run_id: run.id, user_id: user.id, message: safeDbMessage(error) });
    }
  }
  return Response.json(runStatus(run));
}
