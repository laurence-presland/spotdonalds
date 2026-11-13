import { after } from "next/server";
import { claimAnalysis } from "@/lib/analyse/claim";
import { decideClaim, runStatus } from "@/lib/analyse/progress";
import { runPipeline, takeLease } from "@/lib/analyse/run";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const retry = new URL(request.url).searchParams.get("retry") === "1";
  const run = await claimAnalysis(user.id, retry);
  if (run && shouldAdvance(run, retry)) {
    const token = await takeLease(user.id, run.id);
    if (token) {
      run.heartbeat_at = new Date().toISOString();
      after(() => runPipeline({ userId: user.id, token }));
    }
  }
  return Response.json(runStatus(run));
}

function shouldAdvance(run: { status: string; stage: string; open?: boolean }, retry: boolean): boolean {
  const decision = decideClaim(run, retry);
  return decision === "attach" || decision === "reopen" || decision === "insert";
}
