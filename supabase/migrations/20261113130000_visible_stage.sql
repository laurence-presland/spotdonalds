-- The run's visible stage is ingest or analyse. Older stage names stay in the
-- check so rows written before this migration remain valid. New runs write
-- ingest, analyse, or done.

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
  check (stage in ('ingest', 'enrich', 'profile', 'popularity', 'order', 'analyse', 'done'));
