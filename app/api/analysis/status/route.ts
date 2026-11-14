import { currentAnalysis } from "@/lib/analyse/current";
import { requireSession } from "@/lib/auth/session";
import { safeDbMessage } from "@/lib/db";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UNAVAILABLE = "The listening data didn't load. Try again.";

export async function GET() {
  const user = await requireSession();
  if (user instanceof Response) return user;
  try {
    const { body } = await currentAnalysis(user.id);
    return Response.json(body);
  } catch (error) {
    log("error", "analysis.status", { user_id: user.id, message: safeDbMessage(error) });
    return Response.json({ error: "unavailable", message: UNAVAILABLE }, { status: 503 });
  }
}
