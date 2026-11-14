-- Analysis runs are backend jobs. `attempts` counts recorded failures.
-- `workflow_id` is the worker that currently owns the run (`pending` while it is starting).
-- `popularity` is its own stage, between profile and order.
-- Existing rows are left as they are. A running row is resumed by the app from its checkpoint.

alter table spotdonalds.analysis_runs
  add column if not exists attempts integer not null default 0;

alter table spotdonalds.analysis_runs
  add column if not exists workflow_id text;

do $$
declare
  name text;
begin
  select con.conname into name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'spotdonalds'
    and rel.relname = 'analysis_runs'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%stage%';
  if name is not null then
    execute format('alter table spotdonalds.analysis_runs drop constraint %I', name);
  end if;
end
$$;

alter table spotdonalds.analysis_runs
  drop constraint if exists analysis_runs_stage_check;

alter table spotdonalds.analysis_runs
  add constraint analysis_runs_stage_check
  check (stage in ('ingest', 'enrich', 'profile', 'popularity', 'order', 'done'));
