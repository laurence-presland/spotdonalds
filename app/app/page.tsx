import { redirect } from "next/navigation";
import { AnalysingScreen } from "@/components/analysing/AnalysingScreen";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProtectedHome() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");
  return <AnalysingScreen />;
}
