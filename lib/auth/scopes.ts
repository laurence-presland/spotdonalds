export const SPOTIFY_SCOPES = "user-read-email user-read-recently-played user-top-read";

export function spotifyClientId(): string {
  const id = process.env.SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("SPOTIFY_CLIENT_ID is not set");
  return id;
}

export function loginOptions(origin: string): { redirectTo: string; scopes: string } {
  return {
    redirectTo: `${origin}/auth/callback`,
    scopes: SPOTIFY_SCOPES,
  };
}
