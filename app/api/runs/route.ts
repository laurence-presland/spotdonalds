import { runStatus } from "@/lib/analyse/progress";
import { getSessionUser } from "@/lib/auth/session";
import { latestRun } from "@/lib/ingest/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(runStatus(await latestRun(user.id)));
}
