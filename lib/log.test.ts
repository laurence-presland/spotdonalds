import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "@/lib/log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log", () => {
  it("writes one JSON line with level, event and timestamp", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("info", "app.ready", { n: 1 });
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("app.ready");
    expect(parsed.n).toBe(1);
    expect(typeof parsed.ts).toBe("string");
  });

  it("redacts tokens and emails", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log("error", "auth.event", {
      email: "person@example.com",
      access_token: "secret-token",
      nested: { refresh_token: "another" },
    });
    const parsed = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(parsed.email).toBe("[redacted]");
    expect(parsed.access_token).toBe("[redacted]");
    expect(parsed.nested.refresh_token).toBe("[redacted]");
    expect(JSON.stringify(parsed)).not.toContain("secret-token");
    expect(JSON.stringify(parsed)).not.toContain("person@example.com");
  });
});
