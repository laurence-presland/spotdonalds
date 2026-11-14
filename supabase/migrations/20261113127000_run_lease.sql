-- One open analysis run per person, plus a short lease so a second request
-- attaches instead of starting another pipeline. Idempotent. No password.

alter table spotdonalds.analysis_runs
  add column if not exists open boolean not null default true;

alter table spotdonalds.analysis_runs
  add column if not exists heartbeat_at timestamptz;

alter table spotdonalds.analysis_runs
  add column if not exists lease_token text;

update spotdonalds.analysis_runs
set open = false
where status = 'error'
   or (status = 'complete' and stage = 'done');

with ranked as (
  select id,
         row_number() over (partition by user_id order by started_at desc) as n
  from spotdonalds.analysis_runs
  where open
)
update spotdonalds.analysis_runs as runs
set open = false,
    status = case when runs.status = 'running' then 'error' else runs.status end,
    error = case
      when runs.status = 'running' then coalesce(runs.error, 'superseded by a newer run')
      else runs.error
    end
where runs.id in (select id from ranked where n > 1);

create unique index if not exists analysis_runs_one_open
  on spotdonalds.analysis_runs (user_id)
  where open;
