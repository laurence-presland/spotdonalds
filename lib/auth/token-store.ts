import { sql } from "@/lib/db";
import type { SpotifyTokenRow, TokenStore } from "@/lib/auth/tokens";

type TokenQueryRow = Omit<SpotifyTokenRow, "expires_at"> & { expires_at: Date | string };

/** Postgres-backed store for the user's Spotify tokens. */
export function tokenStore(): TokenStore {
  return {
    async get(userId) {
      const rows = await sql()<TokenQueryRow[]>`
        select user_id, access_token, refresh_token, expires_at, scope
        from spotdonalds.spotify_tokens
        where user_id = ${userId}
      `;
      const row = rows[0];
      if (!row) return null;
      return { ...row, expires_at: iso(row.expires_at) };
    },
    async save(row) {
      await sql()`
        insert into spotdonalds.spotify_tokens (
          user_id, access_token, refresh_token, expires_at, scope, updated_at
        ) values (
          ${row.user_id}, ${row.access_token}, ${row.refresh_token}, ${row.expires_at}, ${row.scope}, now()
        )
        on conflict (user_id) do update set
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at,
          scope = excluded.scope,
          updated_at = now()
      `;
    },
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
