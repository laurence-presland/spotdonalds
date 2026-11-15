import { isAllowlistFailure } from "@/lib/auth/access";
import { SPOTIFY_SCOPES } from "@/lib/auth/scopes";
import type { SpotifyTokenRow, TokenStore } from "@/lib/auth/tokens";
import { log } from "@/lib/log";

export const SPOTIFY_ACCESS_TTL_SECONDS = 3600;

export type CallbackSession = {
  user: { id: string };
  provider_token?: string | null;
  provider_refresh_token?: string | null;
};

export type ProbeResult = "ok" | "not_allowlisted" | "error";

/** Call Spotify with the new token to confirm the account is allowed. */
export async function probeSpotifyAccess(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const response = await fetchImpl("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 403) return "not_allowlisted";
  if (!response.ok) return "error";
  return "ok";
}

/** Finish the Spotify callback: store tokens, or send the user to the allowlist page. */
export async function handleAuthCallback(input: {
  origin: string;
  params: URLSearchParams;
  exchange: (code: string) => Promise<{ session: CallbackSession | null; errorMessage?: string }>;
  store: TokenStore;
  probe: (accessToken: string) => Promise<ProbeResult>;
  signOut: () => Promise<void>;
  beginFlow?: (userId: string) => Promise<void>;
  now?: () => number;
}): Promise<{ redirectTo: string }> {
  const { origin, params } = input;
  const now = input.now ?? Date.now;
  const oauthError = params.get("error");
  if (oauthError) {
    const description = params.get("error_description") ?? "";
    if (isAllowlistFailure(oauthError, description)) {
      log("info", "auth.not_allowlisted", { error: oauthError });
      return { redirectTo: `${origin}/not-allowlisted` };
    }
    log("info", "auth.consent_denied", { error: oauthError });
    return { redirectTo: `${origin}/?notice=consent-denied` };
  }

  const code = params.get("code");
  if (!code) {
    log("info", "auth.consent_denied", { error: "missing_code" });
    return { redirectTo: `${origin}/?notice=consent-denied` };
  }

  const exchanged = await input.exchange(code);
  if (!exchanged.session) {
    const message = exchanged.errorMessage ?? "";
    log("warn", "auth.exchange_failed", { message });
    if (isAllowlistFailure(message, message)) {
      return { redirectTo: `${origin}/not-allowlisted` };
    }
    return { redirectTo: `${origin}/?notice=consent-denied` };
  }

  const session = exchanged.session;
  const userId = session.user.id;
  log("info", "auth.signed_in", { user_id: userId });

  const existing = await input.store.get(userId);
  const accessToken = session.provider_token ?? null;
  const refreshToken = session.provider_refresh_token ?? existing?.refresh_token ?? null;

  if (accessToken) {
    const row: SpotifyTokenRow = {
      user_id: userId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: new Date(now() + SPOTIFY_ACCESS_TTL_SECONDS * 1000).toISOString(),
      scope: SPOTIFY_SCOPES,
    };
    await input.store.save(row);
    if (!session.provider_refresh_token) {
      log("info", "auth.provider_refresh_missing", { user_id: userId });
    }
    const probe = await input.probe(accessToken);
    if (probe === "not_allowlisted") {
      await input.signOut();
      log("info", "auth.not_allowlisted", { user_id: userId });
      return { redirectTo: `${origin}/not-allowlisted` };
    }
    if (probe === "error") {
      log("warn", "auth.probe_failed", { user_id: userId });
    }
    return enterApp(input.beginFlow, userId, origin);
  }

  if (existing?.refresh_token) {
    log("info", "auth.provider_token_missing", { user_id: userId });
    return enterApp(input.beginFlow, userId, origin);
  }

  log("info", "auth.provider_token_missing", { user_id: userId });
  await input.signOut();
  return { redirectTo: `${origin}/?notice=reauth` };
}

/** Start the first analysis if needed, then redirect into the app. */
async function enterApp(
  beginFlow: ((userId: string) => Promise<void>) | undefined,
  userId: string,
  origin: string,
): Promise<{ redirectTo: string }> {
  try {
    await beginFlow?.(userId);
  } catch (error) {
    log("error", "analyse.start_failed", {
      user_id: userId,
      message: error instanceof Error ? error.message : "The analysis didn't start",
    });
  }
  return { redirectTo: `${origin}/app?welcome=1` };
}
