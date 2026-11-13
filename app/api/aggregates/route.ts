import { getSessionUser } from "@/lib/auth/session";
import { loadAggregates } from "@/lib/aggregates/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await loadAggregates(user.id));
}
