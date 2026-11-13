import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accessDecision } from "@/lib/auth/access";
import { log } from "@/lib/log";

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
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        log("info", "auth.session_missing", { message: error.message });
      }
      user = data.user ? { id: data.user.id } : null;
    } catch (error) {
      log("error", "auth.session_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
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

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}
