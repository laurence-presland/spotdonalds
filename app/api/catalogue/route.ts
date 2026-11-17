import { requireSession } from "@/lib/auth/session";
import { loadCatalogue } from "@/lib/catalogue/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireSession();
  if (user instanceof Response) return user;
  const { tracks, artists } = await loadCatalogue(user.id);
  return Response.json({ tracks, artists });
}
