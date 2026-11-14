import { loginOptions } from "@/lib/auth/scopes";
import { log } from "@/lib/log";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const options = loginOptions(origin);
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "spotify",
    options: {
      redirectTo: options.redirectTo,
      scopes: options.scopes,
      queryParams: { show_dialog: "true" },
    },
  });
  if (error || !data.url) {
    log("error", "auth.login_failed", { message: error?.message ?? "missing url" });
    return Response.redirect(`${origin}/?notice=login-failed`);
  }
  log("info", "auth.login_started", {});
  return Response.redirect(data.url);
}
