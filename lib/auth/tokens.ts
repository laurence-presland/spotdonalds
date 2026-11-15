import { log } from "@/lib/log";
import { spotifyClientId } from "@/lib/auth/scopes";

export type SpotifyTokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scope: string | null;
};

export type TokenStore = {
  get(userId: string): Promise<SpotifyTokenRow | null>;
  save(row: SpotifyTokenRow): Promise<void>;
};

export class SpotifyTokenError extends Error {
  constructor(
    readonly code: "missing" | "reauth_required" | "refresh_failed",
    readonly status?: number,
  ) {
    super(code);
    this.name = "SpotifyTokenError";
  }
}

type RefreshBody = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

/** Exchange a Spotify refresh token for a new access token. */
export async function refreshSpotifyAccessToken(
  refreshToken: string,
  deps: {
    fetch: typeof fetch;
    clientId?: string;
    clientSecret?: string;
  },
): Promise<RefreshBody> {
  const clientId = deps.clientId ?? spotifyClientId();
  const clientSecret = deps.clientSecret ?? process.env.SPOTIFY_CLIENT_SECRET;
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }
  const response = await deps.fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  if (!response.ok) {
    throw new SpotifyTokenError("refresh_failed", response.status);
  }
  return (await response.json()) as RefreshBody;
}

const SKEW_MS = 60_000;

/** Return a valid Spotify access token, refreshing it if it is close to expiry. */
export async function getSpotifyAccessToken(
  userId: string,
  deps: { store: TokenStore; now: () => number; fetch: typeof fetch },
): Promise<string> {
  const row = await deps.store.get(userId);
  if (!row) throw new SpotifyTokenError("missing");
  if (new Date(row.expires_at).getTime() > deps.now() + SKEW_MS) {
    return row.access_token;
  }
  if (!row.refresh_token) throw new SpotifyTokenError("reauth_required");

  const refreshed = await refreshSpotifyAccessToken(row.refresh_token, { fetch: deps.fetch });
  const expiresAt = new Date(deps.now() + refreshed.expires_in * 1000).toISOString();
  await deps.store.save({
    ...row,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? row.refresh_token,
    expires_at: expiresAt,
  });
  log("info", "auth.token_refreshed", { user_id: userId });
  return refreshed.access_token;
}
