-- SpotDonalds baseline. Idempotent. Never touches the public schema.
-- Apply with: supabase link --project-ref svukzdmlzjebdizvulku && supabase db push
-- The Data API stays disabled. The app connects with DATABASE_URL, not PostgREST.
-- Do not add `spotdonalds` to the exposed schemas.

create schema if not exists spotdonalds;

grant usage on schema spotdonalds to postgres, anon, authenticated, service_role;

create table if not exists spotdonalds.healthcheck (
  id integer primary key,
  ok boolean not null default true
);

insert into spotdonalds.healthcheck (id, ok)
values (1, true)
on conflict (id) do update set ok = excluded.ok;

alter table spotdonalds.healthcheck enable row level security;

revoke all on spotdonalds.healthcheck from public, anon, authenticated;
grant select on spotdonalds.healthcheck to service_role;

alter default privileges in schema spotdonalds
  grant all on tables to postgres, service_role;
alter default privileges in schema spotdonalds
  grant usage, select on sequences to postgres, service_role;
