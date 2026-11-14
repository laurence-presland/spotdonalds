import { reconcileStaleRun } from "@/lib/analyse/reconcile";
import { runStatus } from "@/lib/analyse/progress";
import { requireSession } from "@/lib/auth/session";
import { safeDbMessage } from "@/lib/db";
import { log } from "@/lib/log";
import { latestRun } from "@/lib/ingest/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireSession();
  if (user instanceof Response) return user;
  try {
    const run = await reconcileStaleRun(await latestRun(user.id));
    return Response.json(runStatus(run));
  } catch (error) {
    log("error", "runs.load", { message: safeDbMessage(error), user_id: user.id });
    return Response.json({ error: "unavailable", message: "The page didn't load. Try again." }, { status: 503 });
  }
}
