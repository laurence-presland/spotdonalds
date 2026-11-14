-- Least-privilege login for the app. Idempotent. No password is stored here:
-- the hosted role already exists and its LOGIN password is set out of band.
-- Creating the role only when it is missing leaves that password and LOGIN flag alone.
--
-- The Data API stays disabled. Do not expose schema spotdonalds through PostgREST.
--
-- A later migration that creates a table must grant the app role and add the
-- policy, or call select spotdonalds.apply_app_policy('spotdonalds.<table>').
-- CI rejects a table that does not have policy spotdonalds_app_all.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'spotdonalds_app') then
    create role spotdonalds_app nologin;
  end if;
end
$$;

alter role spotdonalds_app set search_path = spotdonalds;

grant usage on schema spotdonalds to spotdonalds_app;
grant select, insert, update, delete on all tables in schema spotdonalds to spotdonalds_app;
grant usage, select on all sequences in schema spotdonalds to spotdonalds_app;
grant execute on all functions in schema spotdonalds to spotdonalds_app;

alter default privileges in schema spotdonalds
  grant select, insert, update, delete on tables to spotdonalds_app;
alter default privileges in schema spotdonalds
  grant usage, select on sequences to spotdonalds_app;
alter default privileges in schema spotdonalds
  grant execute on functions to spotdonalds_app;

create or replace function spotdonalds.apply_app_policy(target regclass)
returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', target);
  execute format('drop policy if exists spotdonalds_app_all on %s', target);
  execute format(
    'create policy spotdonalds_app_all on %s for all to spotdonalds_app using (true) with check (true)',
    target
  );
  execute format('grant select, insert, update, delete on %s to spotdonalds_app', target);
end;
$$;

revoke all on function spotdonalds.apply_app_policy(regclass) from public, spotdonalds_app;

do $$
declare
  rel regclass;
begin
  for rel in
    select c.oid::regclass
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'spotdonalds'
      and c.relkind = 'r'
  loop
    perform spotdonalds.apply_app_policy(rel);
  end loop;
end
$$;
