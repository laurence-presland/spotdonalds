import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

export async function checkHealth(): Promise<{ ok: true } | { ok: false; status: number }> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("healthcheck")
      .select("ok")
      .eq("id", 1)
      .maybeSingle();
    if (error || data?.ok !== true) {
      log("error", "health.failed", { message: error?.message ?? "row missing" });
      return { ok: false, status: 503 };
    }
    return { ok: true };
  } catch (error) {
    log("error", "health.failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, status: 503 };
  }
}
