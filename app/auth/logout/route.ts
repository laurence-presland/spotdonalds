import { performLogout } from "@/lib/auth/logout";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const result = await performLogout({
    origin,
    userId: data.user?.id ?? null,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  });
  return Response.redirect(result.redirectTo, 303);
}
