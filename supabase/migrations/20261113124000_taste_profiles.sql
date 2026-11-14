-- One taste profile per analysis run. The server writes it; the user can read their own.

create table if not exists spotdonalds.taste_profiles (
  run_id uuid primary key references spotdonalds.analysis_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  persona_name text not null,
  tagline text not null,
  insights jsonb not null,
  traits jsonb not null,
  caveats jsonb not null default '[]'::jsonb,
  signals jsonb not null,
  prompt_version text not null,
  prompt_hash text not null,
  created_at timestamptz not null default now()
);

alter table spotdonalds.taste_profiles enable row level security;

revoke all on spotdonalds.taste_profiles from public, anon, authenticated;
grant select, insert, update, delete on spotdonalds.taste_profiles to service_role;
grant select on spotdonalds.taste_profiles to authenticated;

drop policy if exists taste_profiles_select_own on spotdonalds.taste_profiles;
create policy taste_profiles_select_own on spotdonalds.taste_profiles
  for select to authenticated
  using (user_id = auth.uid());
