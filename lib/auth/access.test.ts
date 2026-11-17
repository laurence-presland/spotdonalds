import { describe, expect, it } from "vitest";
import { accessDecision, isAllowlistFailure } from "@/lib/auth/access";

describe("accessDecision", () => {
  it("lets anonymous visitors see the landing page and health check", () => {
    expect(accessDecision("/", false)).toBe("allow");
    expect(accessDecision("/not-allowlisted", false)).toBe("allow");
    expect(accessDecision("/api/health", false)).toBe("allow");
    expect(accessDecision("/auth/login", false)).toBe("allow");
    expect(accessDecision("/auth/callback", false)).toBe("allow");
    expect(accessDecision("/.well-known/workflow/v1/flow", false)).toBe(
      "allow"
    );
  });

  it("redirects anonymous visitors away from protected pages and rejects their API calls", () => {
    expect(accessDecision("/app", false)).toBe("redirect-home");
    expect(accessDecision("/app/anything", false)).toBe("redirect-home");
    expect(accessDecision("/api/order", false)).toBe("unauthorized");
  });

  it("sends a signed-in visitor from the landing page into the app", () => {
    expect(accessDecision("/", true)).toBe("redirect-app");
    expect(accessDecision("/app", true)).toBe("allow");
    expect(accessDecision("/api/order", true)).toBe("allow");
  });
});

describe("isAllowlistFailure", () => {
  it("treats development-mode failures as the access screen and consent denial as something else", () => {
    expect(isAllowlistFailure("access_denied", "user denied the request")).toBe(
      false
    );
    expect(isAllowlistFailure("not_allowlisted")).toBe(true);
    expect(
      isAllowlistFailure(
        "",
        "User is not registered in the developer dashboard"
      )
    ).toBe(true);
  });
});
