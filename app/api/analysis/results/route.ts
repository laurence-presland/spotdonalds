import { currentAnalysis } from "@/lib/analyse/current";
import { READ_POLL_MS, RESULTS_HOLD_MS, resultsDecision } from "@/lib/analyse/read";
import { requireSession } from "@/lib/auth/session";
import { safeDbMessage } from "@/lib/db";
import { log } from "@/lib/log";
import { loadResults } from "@/lib/results/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UNAVAILABLE = "The listening data didn't load. Try again.";

export async function GET(request: Request) {
  const user = await requireSession();
  if (user instanceof Response) return user;
  const started = Date.now();
  try {
    while (!request.signal.aborted) {
      const { body } = await currentAnalysis(user.id);
      const decision = resultsDecision({
        status: body.status,
        outcome: body.outcome,
        elapsedMs: Date.now() - started,
        budgetMs: RESULTS_HOLD_MS,
      });
      if (decision === "wait") {
        await new Promise((resolve) => setTimeout(resolve, READ_POLL_MS));
        continue;
      }
      if (decision === "retry") return Response.json({ retry: true, ...body }, { status: 202 });
      if (decision === "ready") {
        const results = await loadResults(user.id);
        return Response.json({
          status: "complete",
          outcome: "ready",
          trackCount: body.trackCount,
          profile: results?.profile ?? null,
          order: results?.order ?? null,
          menu: results?.menu ?? [],
          aggregates: results?.aggregates ?? null,
        });
      }
      return Response.json(body);
    }
    return Response.json({ retry: true, status: "running", stage: null, outcome: null, trackCount: 0 }, { status: 202 });
  } catch (error) {
    log("error", "analysis.results", { user_id: user.id, message: safeDbMessage(error) });
    return Response.json({ error: "unavailable", message: UNAVAILABLE }, { status: 503 });
  }
}
