-- Shared enrichment cache. Negative rows expire sooner. Server-only.

create table if not exists spotdonalds.track_enrichment (
  cache_key text primary key,
  spotify_track_id text,
  isrc text,
  matched boolean not null,
  tags jsonb not null default '[]'::jsonb,
  bpm numeric,
  fields jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  confidence text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table spotdonalds.track_enrichment enable row level security;

revoke all on spotdonalds.track_enrichment from public, anon, authenticated;
grant select, insert, update, delete on spotdonalds.track_enrichment to service_role;
