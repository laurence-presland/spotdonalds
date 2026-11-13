-- Listening data and the analysis run. Users can read their own rows.
-- Catalogue tables (artists, tracks) are written by the server only.

create table if not exists spotdonalds.artists (
  spotify_id text primary key,
  name text not null,
  external_url text,
  genres jsonb not null default '[]'::jsonb,
  popularity integer,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists spotdonalds.tracks (
  spotify_id text primary key,
  isrc text,
  name text not null,
  album_name text,
  album_image_url text,
  release_date text,
  duration_ms integer,
  explicit boolean not null default false,
  external_url text,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists spotdonalds.track_artists (
  track_id text not null references spotdonalds.tracks (spotify_id) on delete cascade,
  artist_id text not null references spotdonalds.artists (spotify_id) on delete cascade,
  position integer not null,
  primary key (track_id, artist_id)
);

create table if not exists spotdonalds.plays (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null references spotdonalds.tracks (spotify_id),
  played_at timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  primary key (user_id, track_id, played_at)
);

create table if not exists spotdonalds.top_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('track', 'artist')),
  time_range text not null check (time_range in ('short_term', 'medium_term', 'long_term')),
  rank integer not null,
  spotify_id text not null,
  raw jsonb not null default '{}'::jsonb,
  primary key (user_id, kind, time_range, spotify_id)
);

create table if not exists spotdonalds.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('running', 'complete', 'error')),
  stage text not null check (stage in ('ingest', 'enrich', 'profile', 'order', 'done')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  error text,
  checkpoint jsonb not null default '{}'::jsonb
);

create index if not exists analysis_runs_user_started
  on spotdonalds.analysis_runs (user_id, started_at desc);
create index if not exists plays_user_played
  on spotdonalds.plays (user_id, played_at desc);

alter table spotdonalds.artists enable row level security;
alter table spotdonalds.tracks enable row level security;
alter table spotdonalds.track_artists enable row level security;
alter table spotdonalds.plays enable row level security;
alter table spotdonalds.top_items enable row level security;
alter table spotdonalds.analysis_runs enable row level security;

revoke all on spotdonalds.artists from public, anon, authenticated;
revoke all on spotdonalds.tracks from public, anon, authenticated;
revoke all on spotdonalds.track_artists from public, anon, authenticated;
revoke all on spotdonalds.plays from public, anon, authenticated;
revoke all on spotdonalds.top_items from public, anon, authenticated;
revoke all on spotdonalds.analysis_runs from public, anon, authenticated;

grant select, insert, update, delete on spotdonalds.artists to service_role;
grant select, insert, update, delete on spotdonalds.tracks to service_role;
grant select, insert, update, delete on spotdonalds.track_artists to service_role;
grant select, insert, update, delete on spotdonalds.plays to service_role;
grant select, insert, update, delete on spotdonalds.top_items to service_role;
grant select, insert, update, delete on spotdonalds.analysis_runs to service_role;

grant select on spotdonalds.plays to authenticated;
grant select on spotdonalds.top_items to authenticated;
grant select on spotdonalds.analysis_runs to authenticated;

drop policy if exists plays_select_own on spotdonalds.plays;
create policy plays_select_own on spotdonalds.plays
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists top_items_select_own on spotdonalds.top_items;
create policy top_items_select_own on spotdonalds.top_items
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists analysis_runs_select_own on spotdonalds.analysis_runs;
create policy analysis_runs_select_own on spotdonalds.analysis_runs
  for select to authenticated
  using (user_id = auth.uid());
