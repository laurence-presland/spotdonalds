import { createSupabaseServer } from "@/lib/supabase/server";

export async function getSessionUser(): Promise<{ id: string } | null> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id } : null;
}
