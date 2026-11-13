import { runAnalyse } from "@/lib/analyse/run";
import { getSessionUser } from "@/lib/auth/session";
import { ndjsonResponse } from "@/lib/stream/ndjson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return ndjsonResponse((emit) => runAnalyse({ userId: user.id, emit }));
}
