import { checkHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkHealth();
  if (!result.ok) {
    return Response.json({ ok: false }, { status: result.status });
  }
  return Response.json({ ok: true });
}
