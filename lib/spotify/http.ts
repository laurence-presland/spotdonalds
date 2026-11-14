export type SpotifyErrorCode =
  | "not_allowlisted"
  | "rate_limited"
  | "server"
  | "unauthorized"
  | "bad_response";

export class SpotifyApiError extends Error {
  readonly status: number;
  readonly code: SpotifyErrorCode;

  constructor(status: number, code: SpotifyErrorCode, message: string) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
    this.code = code;
  }
}

const MAX_RETRIES = 3;

export async function spotifyJson(
  url: string,
  token: string,
  deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void> },
): Promise<unknown> {
  let attempt = 0;
  while (true) {
    const response = await deps.fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (response.status === 429 || response.status >= 500) {
      if (attempt >= MAX_RETRIES) {
        throw new SpotifyApiError(
          response.status,
          response.status === 429 ? "rate_limited" : "server",
          response.status === 429 ? "Spotify rate limit held" : "Spotify was unavailable",
        );
      }
      const header = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(header) && header > 0 ? header * 1000 : 250 * 2 ** attempt;
      await deps.sleep(wait);
      attempt += 1;
      continue;
    }
    if (response.status === 403) {
      throw new SpotifyApiError(403, "not_allowlisted", "Spotify refused this account");
    }
    if (response.status === 401) {
      throw new SpotifyApiError(401, "unauthorized", "Spotify rejected the token");
    }
    if (!response.ok) {
      throw new SpotifyApiError(response.status, "bad_response", "Spotify request failed");
    }
    return response.json();
  }
}

export function accessPathForSpotifyError(code: string): string | null {
  if (code === "not_allowlisted") return "/not-allowlisted";
  return null;
}
