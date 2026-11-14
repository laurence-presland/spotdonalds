-- A finished run is either ready to show, or it stopped because ingest
-- found fewer than 50 distinct tracks. Null stays valid for rows written
-- before this column existed.

alter table spotdonalds.analysis_runs
  add column if not exists outcome text;

alter table spotdonalds.analysis_runs
  drop constraint if exists analysis_runs_outcome_check;

alter table spotdonalds.analysis_runs
  add constraint analysis_runs_outcome_check
  check (outcome is null or outcome in ('ready', 'insufficient_data'));
