import { createClient } from "@supabase/supabase-js";
import { dbSchema, requireEnv } from "@/lib/env";

export function createAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    {
      db: { schema: dbSchema() },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
