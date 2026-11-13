-- Spotify provider tokens. Server-only. No policy for anon or authenticated,
-- so the publishable key cannot read this table. The secret key bypasses RLS.

create table if not exists spotdonalds.spotify_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text,
  updated_at timestamptz not null default now()
);

alter table spotdonalds.spotify_tokens enable row level security;

revoke all on spotdonalds.spotify_tokens from public, anon, authenticated;
grant select, insert, update, delete on spotdonalds.spotify_tokens to service_role;
