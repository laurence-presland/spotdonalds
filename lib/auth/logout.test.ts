import { describe, expect, it, vi } from "vitest";
import { performLogout } from "@/lib/auth/logout";

describe("performLogout", () => {
  it("clears the session and sends the user back to the landing page", async () => {
    const signOut = vi.fn(async () => {});
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await performLogout({
      origin: "http://localhost:3000",
      userId: "user-1",
      signOut,
    });
    expect(signOut).toHaveBeenCalledOnce();
    expect(result.redirectTo).toBe("http://localhost:3000/");
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line.event).toBe("auth.signed_out");
    expect(line.user_id).toBe("user-1");
    expect(JSON.stringify(line)).not.toContain("token");
    spy.mockRestore();
  });
});