import { createAdminClient } from "@/lib/supabase/admin";
import type { SpotifyTokenRow, TokenStore } from "@/lib/auth/tokens";

export function supabaseTokenStore(): TokenStore {
  return {
    async get(userId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("spotify_tokens")
        .select("user_id, access_token, refresh_token, expires_at, scope")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as SpotifyTokenRow | null) ?? null;
    },
    async save(row) {
      const supabase = createAdminClient();
      const { error } = await supabase.from("spotify_tokens").upsert({
        user_id: row.user_id,
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expires_at: row.expires_at,
        scope: row.scope,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
  };
}
