import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSpotifyAccessToken, type SpotifyTokenRow, type TokenStore } from "@/lib/auth/tokens";

beforeEach(() => {
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test-client-id");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function memoryStore(initial: SpotifyTokenRow | null): TokenStore & { saved: SpotifyTokenRow | null } {
  const state = { saved: initial };
  return {
    get saved() {
      return state.saved;
    },
    set saved(value) {
      state.saved = value;
    },
    async get() {
      return state.saved;
    },
    async save(row) {
      state.saved = row;
    },
  };
}

describe("getSpotifyAccessToken", () => {
  it("returns a stored token that is still valid without calling Spotify", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const store = memoryStore({
      user_id: "user-1",
      access_token: "still-good",
      refresh_token: "refresh-1",
      expires_at: "2026-11-13T12:00:00.000Z",
      scope: "user-read-email",
    });
    const token = await getSpotifyAccessToken("user-1", {
      store,
      now: () => Date.parse("2026-11-13T11:00:00.000Z"),
      fetch: fetchImpl,
    });
    expect(token).toBe("still-good");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes an expired token, stores the new expiry, and keeps a rotated refresh token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          access_token: "fresh-access",
          refresh_token: "fresh-refresh",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const store = memoryStore({
      user_id: "user-1",
      access_token: "stale",
      refresh_token: "old-refresh",
      expires_at: "2026-11-13T10:00:00.000Z",
      scope: "user-read-email user-read-recently-played user-top-read",
    });
    const now = Date.parse("2026-11-13T11:00:00.000Z");
    const token = await getSpotifyAccessToken("user-1", {
      store,
      now: () => now,
      fetch: fetchImpl,
    });
    expect(token).toBe("fresh-access");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://accounts.spotify.com/api/token");
    expect(String(init?.body)).toContain("grant_type=refresh_token");
    expect(String(init?.body)).toContain("refresh_token=old-refresh");
    expect(store.saved?.access_token).toBe("fresh-access");
    expect(store.saved?.refresh_token).toBe("fresh-refresh");
    expect(store.saved?.expires_at).toBe(new Date(now + 3600 * 1000).toISOString());
    expect(JSON.stringify(store.saved)).not.toContain("old-refresh");
  });

  it("keeps the previous refresh token when Spotify does not rotate it", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ access_token: "fresh-access", expires_in: 1800 }), {
        status: 200,
      });
    });
    const store = memoryStore({
      user_id: "user-1",
      access_token: "stale",
      refresh_token: "keep-me",
      expires_at: "2026-11-13T10:00:00.000Z",
      scope: null,
    });
    await getSpotifyAccessToken("user-1", {
      store,
      now: () => Date.parse("2026-11-13T11:00:00.000Z"),
      fetch: fetchImpl,
    });
    expect(store.saved?.refresh_token).toBe("keep-me");
  });
});
