import { handleAuthCallback, probeSpotifyAccess } from "@/lib/auth/callback";
import { supabaseTokenStore } from "@/lib/auth/token-store";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createSupabaseServer();
  const store = supabaseTokenStore();
  const result = await handleAuthCallback({
    origin: url.origin,
    params: url.searchParams,
    store,
    probe: (token) => probeSpotifyAccess(token),
    signOut: async () => {
      await supabase.auth.signOut();
    },
    exchange: async (code) => {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        return { session: null, errorMessage: error?.message };
      }
      return {
        session: {
          user: { id: data.session.user.id },
          provider_token: data.session.provider_token,
          provider_refresh_token: data.session.provider_refresh_token,
        },
      };
    },
  });
  return Response.redirect(result.redirectTo);
}
