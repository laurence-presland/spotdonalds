import { AUTH_TIMEOUT_MS, withDeadline } from "@/lib/auth/deadline";
import { log } from "@/lib/log";
import { createSupabaseServer } from "@/lib/supabase/server";

export class AuthUnavailable extends Error {
  constructor() {
    super("Spotify sign-in didn't respond. Try again.");
    this.name = "AuthUnavailable";
  }
}

const UNAVAILABLE = "Spotify sign-in didn't respond. Try again.";

/** Return the signed-in user, or throw if auth is unavailable. */
export async function getSessionUser(): Promise<{ id: string } | null> {
  const supabase = await createSupabaseServer();
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    result = await withDeadline(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
  } catch (error) {
    log("error", "auth.session_failed", { message: error instanceof Error ? error.message : "timeout" });
    throw new AuthUnavailable();
  }
  if (result.error && typeof result.error.status === "number" && result.error.status >= 500) {
    log("error", "auth.session_failed", { message: result.error.message });
    throw new AuthUnavailable();
  }
  if (result.error) log("info", "auth.session_missing", { message: result.error.message });
  return result.data.user ? { id: result.data.user.id } : null;
}

/** Require a session, or return a 401/503 response. */
export async function requireSession(): Promise<{ id: string } | Response> {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    return user;
  } catch (error) {
    if (error instanceof AuthUnavailable) {
      return Response.json({ error: "unavailable", message: UNAVAILABLE }, { status: 503 });
    }
    throw error;
  }
}
