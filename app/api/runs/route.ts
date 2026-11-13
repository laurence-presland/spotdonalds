import { getSessionUser } from "@/lib/auth/session";
import { latestRun } from "@/lib/ingest/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const run = await latestRun(user.id);
  return Response.json({
    run: run
      ? {
          id: run.id,
          status: run.status,
          stage: run.stage,
          started_at: run.started_at,
          finished_at: run.finished_at,
          counts: run.counts,
          error: run.error,
        }
      : null,
  });
}
