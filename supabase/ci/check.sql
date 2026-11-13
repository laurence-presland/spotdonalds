-- Fails the migration job if a spotdonalds column or table uses a reserved word,
-- and checks that the renamed top_items column accepts a real row.

do $$
declare
  hits text;
begin
  select string_agg(format('%I.%I', c.relname, a.attname), ', ' order by c.relname, a.attname)
    into hits
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_get_keywords() k on lower(k.word) = lower(a.attname)
  where n.nspname = 'spotdonalds'
    and a.attnum > 0
    and not a.attisdropped
    and k.catcode = 'R';
  if hits is not null then
    raise exception 'reserved column names: %', hits;
  end if;

  select string_agg(format('%I', c.relname), ', ' order by c.relname)
    into hits
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_get_keywords() k on lower(k.word) = lower(c.relname)
  where n.nspname = 'spotdonalds'
    and c.relkind = 'r'
    and k.catcode = 'R';
  if hits is not null then
    raise exception 'reserved table names: %', hits;
  end if;
end
$$;

insert into auth.users (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into spotdonalds.artists (spotify_id, name)
values ('artist-1', 'Artist')
on conflict (spotify_id) do nothing;

insert into spotdonalds.tracks (spotify_id, name)
values ('track-1', 'Track')
on conflict (spotify_id) do nothing;

insert into spotdonalds.track_artists (track_id, artist_id, position)
values ('track-1', 'artist-1', 0)
on conflict (track_id, artist_id) do nothing;

insert into spotdonalds.plays (user_id, track_id, played_at)
values ('00000000-0000-0000-0000-000000000001', 'track-1', '2026-11-13T00:00:00Z')
on conflict (user_id, track_id, played_at) do nothing;

insert into spotdonalds.top_items (user_id, kind, time_range, rank, spotify_id)
values ('00000000-0000-0000-0000-000000000001', 'track', 'short_term', 1, 'track-1')
on conflict (user_id, kind, time_range, spotify_id) do update set rank = excluded.rank;

insert into spotdonalds.analysis_runs (id, user_id, status, stage)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'complete', 'done')
on conflict (id) do nothing;

insert into spotdonalds.track_enrichment (cache_key, spotify_track_id, matched)
values ('track-1', 'track-1', true)
on conflict (cache_key) do nothing;

insert into spotdonalds.taste_profiles (
  run_id, user_id, persona_name, tagline, insights, traits, signals, prompt_version, prompt_hash
) values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Persona',
  'Tagline',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  'v1',
  'hash'
) on conflict (run_id) do nothing;

insert into spotdonalds.orders (
  run_id, user_id, items, summary, how_we_decided, totals, budget, popularity, signals, inputs,
  rules_version, prompt_version, prompt_hash, popularity_prompt_hash, menu_retrieved_at
) values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '[]'::jsonb,
  'Summary',
  '[]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  'v1',
  'v1',
  'hash',
  'hash',
  '2026-11-13'
) on conflict (run_id) do nothing;

insert into spotdonalds.genre_popularity (tags_key, popularity_tier, reason, prompt_hash)
values ('jazz', 'mid', 'because', 'hash')
on conflict (tags_key) do nothing;

do $$
begin
  insert into spotdonalds.top_items (user_id, kind, time_range, rank, spotify_id)
  values ('00000000-0000-0000-0000-000000000001', 'track', 'forever', 1, 'rejected');
  raise exception 'invalid time_range was accepted';
exception
  when check_violation then
    null;
end
$$;
