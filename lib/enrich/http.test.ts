import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/lib/enrich/http";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchJson", () => {
  it("logs the status and a truncated body on a non-404 error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = `{"error":"${"x".repeat(400)}"}`;
    await expect(
      fetchJson(
        "https://musicbrainz.org/ws/2/isrc/USAT22220573?inc=tags+genres",
        { Accept: "application/json" },
        {
          fetch: async () => new Response(body, { status: 400 }),
          sleep: async () => undefined,
        },
      ),
    ).rejects.toThrow("400");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(parsed.level).toBe("warn");
    expect(parsed.event).toBe("enrich.http");
    expect(parsed.status).toBe(400);
    expect(parsed.url).toContain("/isrc/USAT22220573");
    expect(parsed.body).toHaveLength(300);
    expect(parsed.body.startsWith('{"error":"')).toBe(true);
  });

  it("does not log the body of a 404", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      fetchJson(
        "https://musicbrainz.org/ws/2/isrc/MISSING00000",
        { Accept: "application/json" },
        {
          fetch: async () => new Response("missing", { status: 404 }),
          sleep: async () => undefined,
        },
      ),
    ).rejects.toThrow("404");
    expect(error).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});
