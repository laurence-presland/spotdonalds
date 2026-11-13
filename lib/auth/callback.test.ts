import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAuthCallback, type CallbackSession } from "@/lib/auth/callback";
import type { SpotifyTokenRow, TokenStore } from "@/lib/auth/tokens";

function store(initial: SpotifyTokenRow | null = null): TokenStore & { row: SpotifyTokenRow | null } {
  const box = { row: initial };
  return {
    get row() {
      return box.row;
    },
    async get() {
      return box.row;
    },
    async save(row) {
      box.row = row;
    },
  };
}

const session: CallbackSession = {
  user: { id: "user-1" },
  provider_token: "provider-access",
  provider_refresh_token: "provider-refresh",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleAuthCallback", () => {
  it("sends a successful allowlisted sign-in to the protected app and stores tokens", async () => {
    const tokens = store();
    const signOut = vi.fn(async () => {});
    const result = await handleAuthCallback({
      origin: "http://localhost:3000",
      params: new URLSearchParams({ code: "abc" }),
      exchange: async () => ({ session }),
      store: tokens,
      probe: async () => "ok",
      signOut,
      now: () => Date.parse("2026-11-13T11:00:00.000Z"),
    });
    expect(result.redirectTo).toBe("http://localhost:3000/app?welcome=1");
    expect(tokens.row?.access_token).toBe("provider-access");
    expect(tokens.row?.refresh_token).toBe("provider-refresh");
    expect(tokens.row?.expires_at).toBe("2026-11-13T12:00:00.000Z");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("sends a completed consent that Spotify then rejects to the access screen", async () => {
    const signOut = vi.fn(async () => {});
    const result = await handleAuthCallback({
      origin: "https://spotdonalds.vercel.app",
      params: new URLSearchParams({ code: "abc" }),
      exchange: async () => ({ session }),
      store: store(),
      probe: async () => "not_allowlisted",
      signOut,
    });
    expect(result.redirectTo).toBe("https://spotdonalds.vercel.app/not-allowlisted");
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("returns a denied consent to the landing page", async () => {
    const result = await handleAuthCallback({
      origin: "http://localhost:3000",
      params: new URLSearchParams({ error: "access_denied", error_description: "user denied" }),
      exchange: async () => ({ session: null }),
      store: store(),
      probe: async () => "ok",
      signOut: async () => {},
    });
    expect(result.redirectTo).toBe("http://localhost:3000/?notice=consent-denied");
  });

  it("logs the sign-in without the token or an email", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await handleAuthCallback({
      origin: "http://localhost:3000",
      params: new URLSearchParams({ code: "abc" }),
      exchange: async () => ({ session }),
      store: store(),
      probe: async () => "ok",
      signOut: async () => {},
    });
    const lines = spy.mock.calls.map((call) => String(call[0]));
    const signedIn = lines.map((line) => JSON.parse(line)).find((row) => row.event === "auth.signed_in");
    expect(signedIn.user_id).toBe("user-1");
    expect(JSON.stringify(signedIn)).not.toContain("provider-access");
    expect(JSON.stringify(signedIn)).not.toContain("email");
  });

  it("starts the flow on a successful sign-in and not when Spotify rejects the account", async () => {
    const started: string[] = [];
    await handleAuthCallback({
      origin: "http://localhost:3000",
      params: new URLSearchParams({ code: "abc" }),
      exchange: async () => ({ session }),
      store: store(),
      probe: async () => "ok",
      signOut: async () => {},
      beginFlow: async (userId) => {
        started.push(userId);
      },
    });
    expect(started).toEqual(["user-1"]);

    const rejected: string[] = [];
    const result = await handleAuthCallback({
      origin: "http://localhost:3000",
      params: new URLSearchParams({ code: "abc" }),
      exchange: async () => ({ session }),
      store: store(),
      probe: async () => "not_allowlisted",
      signOut: async () => {},
      beginFlow: async (userId) => {
        rejected.push(userId);
      },
    });
    expect(result.redirectTo).toBe("http://localhost:3000/not-allowlisted");
    expect(rejected).toEqual([]);
  });
});
