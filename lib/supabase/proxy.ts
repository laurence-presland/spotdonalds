import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accessDecision, authOutageDecision } from "@/lib/auth/access";
import { AUTH_TIMEOUT_MS } from "@/lib/auth/deadline";
import { log } from "@/lib/log";

const UNAVAILABLE = "Spotify sign-in didn't respond. Try again.";

/** Refresh the Supabase session on the request, or divert to an outage path. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let user: { id: string } | null = null;

  if (url && key) {
    try {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      });
      const pending = supabase.auth.getUser();
      void pending.catch(() => undefined);
      const outcome = await Promise.race([
        pending.then((result) => ({ timedOut: false as const, result })),
        new Promise<{ timedOut: true }>((resolve) => setTimeout(() => resolve({ timedOut: true }), AUTH_TIMEOUT_MS)),
      ]);
      if (outcome.timedOut) {
        log("error", "auth.session_failed", { message: "timeout" });
        return outage(request, response);
      }
      if (outcome.result.error && typeof outcome.result.error.status === "number" && outcome.result.error.status >= 500) {
        log("error", "auth.session_failed", { message: outcome.result.error.message });
        return outage(request, response);
      }
      if (outcome.result.error) log("info", "auth.session_missing", { message: outcome.result.error.message });
      user = outcome.result.data.user ? { id: outcome.result.data.user.id } : null;
    } catch (error) {
      log("error", "auth.session_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      return outage(request, response);
    }
  }

  const decision = accessDecision(request.nextUrl.pathname, Boolean(user));
  if (decision === "allow") return response;

  if (decision === "unauthorized") {
    const denied = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    copyCookies(response, denied);
    return denied;
  }

  const target = decision === "redirect-app" ? "/app" : "/";
  const redirect = NextResponse.redirect(new URL(target, request.url));
  copyCookies(response, redirect);
  return redirect;
}

/** Redirect or return an error when auth is unavailable. */
function outage(request: NextRequest, response: NextResponse) {
  const decision = authOutageDecision(request.nextUrl.pathname);
  if (decision === "allow") return response;
  if (decision === "unavailable-api") {
    const denied = NextResponse.json({ error: "unavailable", message: UNAVAILABLE }, { status: 503 });
    copyCookies(response, denied);
    return denied;
  }
  const redirect = NextResponse.redirect(new URL("/?notice=unavailable", request.url));
  copyCookies(response, redirect);
  return redirect;
}

/** Copy Set-Cookie headers from one response onto another. */
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}
