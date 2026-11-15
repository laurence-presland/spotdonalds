export const SPOTIFY_SCOPES = "user-read-email user-read-recently-played user-top-read";

/** Return the Spotify client id from the environment. */
export function spotifyClientId(): string {
  const id = process.env.SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("SPOTIFY_CLIENT_ID is not set");
  return id;
}

/** Callback URL and scopes for the Spotify sign-in request. */
export function loginOptions(origin: string): { redirectTo: string; scopes: string } {
  return {
    redirectTo: `${origin}/auth/callback`,
    scopes: SPOTIFY_SCOPES,
  };
}
