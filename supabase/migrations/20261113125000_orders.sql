-- One order per analysis run, plus a shared cache of genre-popularity tiers.

create table if not exists spotdonalds.orders (
  run_id uuid primary key references spotdonalds.analysis_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  items jsonb not null,
  invented_rules jsonb not null default '[]'::jsonb,
  summary text not null,
  how_we_decided jsonb not null,
  confidence_note text not null default '',
  totals jsonb not null,
  budget jsonb not null,
  popularity jsonb not null,
  signals jsonb not null,
  inputs jsonb not null,
  rules_version text not null,
  prompt_version text not null,
  prompt_hash text not null,
  popularity_prompt_hash text not null,
  menu_retrieved_at text not null,
  created_at timestamptz not null default now()
);

create table if not exists spotdonalds.genre_popularity (
  tags_key text primary key,
  popularity_tier text not null check (popularity_tier in ('niche', 'mid', 'mainstream')),
  reason text not null,
  prompt_hash text not null,
  created_at timestamptz not null default now()
);

alter table spotdonalds.orders enable row level security;
alter table spotdonalds.genre_popularity enable row level security;

revoke all on spotdonalds.orders from public, anon, authenticated;
revoke all on spotdonalds.genre_popularity from public, anon, authenticated;

grant select, insert, update, delete on spotdonalds.orders to service_role;
grant select, insert, update, delete on spotdonalds.genre_popularity to service_role;
grant select on spotdonalds.orders to authenticated;

drop policy if exists orders_select_own on spotdonalds.orders;
create policy orders_select_own on spotdonalds.orders
  for select to authenticated
  using (user_id = auth.uid());
