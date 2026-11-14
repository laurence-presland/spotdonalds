import { describe, expect, it } from "vitest";
import { DeadlineError, withDeadline } from "@/lib/auth/deadline";
import { authOutageDecision } from "@/lib/auth/access";

describe("auth timeouts", () => {
  it("rejects a call that does not finish in time", async () => {
    let resolveLate: (value: string) => void = () => undefined;
    const pending = new Promise<string>((resolve) => {
      resolveLate = resolve;
    });
    await expect(withDeadline(pending, 20)).rejects.toBeInstanceOf(DeadlineError);
    resolveLate("late");
  });

  it("sends a protected page to a retry notice and an API call to an unavailable response", () => {
    expect(authOutageDecision("/")).toBe("allow");
    expect(authOutageDecision("/api/health")).toBe("allow");
    expect(authOutageDecision("/auth/login")).toBe("allow");
    expect(authOutageDecision("/api/runs")).toBe("unavailable-api");
    expect(authOutageDecision("/app")).toBe("redirect-notice");
  });
});
