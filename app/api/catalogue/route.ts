import { getSessionUser } from "@/lib/auth/session";
import { loadCatalogue } from "@/lib/catalogue/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const catalogue = await loadCatalogue(user.id);
  return Response.json(catalogue);
}
