-- The lease token was never taken. Ownership is workflow_id plus heartbeat_at.
-- stored_at lets the track stream resume from a timestamp instead of a list of ids.

alter table spotdonalds.analysis_runs
  drop column if exists lease_token;

alter table spotdonalds.plays
  add column if not exists stored_at timestamptz not null default now();

alter table spotdonalds.top_items
  add column if not exists stored_at timestamptz not null default now();

create index if not exists plays_user_stored
  on spotdonalds.plays (user_id, stored_at);

create index if not exists top_items_user_stored
  on spotdonalds.top_items (user_id, stored_at);
