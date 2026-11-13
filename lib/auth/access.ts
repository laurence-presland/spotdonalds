const PUBLIC_PAGES = new Set(["/", "/not-allowlisted"]);

export type AccessDecision = "allow" | "redirect-home" | "redirect-app" | "unauthorized";
export type AuthOutageDecision = "allow" | "unavailable-api" | "redirect-notice";

export function accessDecision(pathname: string, hasUser: boolean): AccessDecision {
  if (pathname === "/api/health" || pathname.startsWith("/auth/") || pathname.startsWith("/.well-known/workflow/")) return "allow";
  if (hasUser && pathname === "/") return "redirect-app";
  if (PUBLIC_PAGES.has(pathname)) return "allow";
  if (!hasUser && pathname.startsWith("/api/")) return "unauthorized";
  if (!hasUser) return "redirect-home";
  return "allow";
}

export function authOutageDecision(pathname: string): AuthOutageDecision {
  if (
    pathname === "/" ||
    pathname === "/not-allowlisted" ||
    pathname === "/api/health" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/.well-known/")
  ) {
    return "allow";
  }
  if (pathname.startsWith("/api/")) return "unavailable-api";
  return "redirect-notice";
}

export function isAllowlistFailure(code: string, description = ""): boolean {
  const text = `${code} ${description}`.toLowerCase();
  return (
    text.includes("not_allowlisted") ||
    text.includes("not allowlisted") ||
    text.includes("allowlist") ||
    text.includes("development mode") ||
    text.includes("user is not registered") ||
    text.includes("not registered in the developer")
  );
}
