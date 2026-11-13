export const SPOTIFY_SCOPES = "user-read-email user-read-recently-played user-top-read";

export const SPOTIFY_CLIENT_ID_DEFAULT = "682dcdb2828949ffb8718644e24d3a93";

export function spotifyClientId(): string {
  return process.env.SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID_DEFAULT;
}

export function loginOptions(origin: string): { redirectTo: string; scopes: string } {
  return {
    redirectTo: `${origin}/auth/callback`,
    scopes: SPOTIFY_SCOPES,
  };
}
