import { describe, expect, it, vi } from "vitest";
import { accessPathForSpotifyError, SpotifyApiError, spotifyJson } from "@/lib/spotify/http";

function response(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("spotifyJson", () => {
  it("honours Retry-After on 429 and then returns the body", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(429, {}, { "retry-after": "2" }))
      .mockResolvedValueOnce(response(200, { items: [] }));
    const body = await spotifyJson("https://api.spotify.com/v1/me", "token", {
      fetch: fetchImpl,
      sleep,
    });
    expect(body).toEqual({ items: [] });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx with backoff and reports an error when retries are exhausted", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async () => response(503, {}));
    await expect(
      spotifyJson("https://api.spotify.com/v1/me", "token", { fetch: fetchImpl, sleep }),
    ).rejects.toMatchObject({ code: "server", status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 403 and maps it to the access screen", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async () => response(403, {}));
    await expect(
      spotifyJson("https://api.spotify.com/v1/me", "token", { fetch: fetchImpl, sleep }),
    ).rejects.toBeInstanceOf(SpotifyApiError);
    expect(sleep).not.toHaveBeenCalled();
    expect(accessPathForSpotifyError("not_allowlisted")).toBe("/not-allowlisted");
  });
});
