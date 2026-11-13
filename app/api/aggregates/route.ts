import { requireSession } from "@/lib/auth/session";
import { loadAggregates } from "@/lib/aggregates/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireSession();
  if (user instanceof Response) return user;
  return Response.json(await loadAggregates(user.id));
}
