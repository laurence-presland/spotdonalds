import { LeaseLost, leaseToken } from "@/lib/analyse/lease";
import { sql } from "@/lib/db";
import { emptyCounts, type IngestCheckpoint, type IngestCounts, type RunRecord, type RunStage, type RunStatus } from "@/lib/ingest/types";

const LEASE_STALE_SECONDS = 30;

type RunRow = {
  id: string;
  user_id: string;
  status: RunStatus;
  stage: RunStage;
  started_at: Date | string;
  finished_at: Date | string | null;
  counts: IngestCounts | null;
  error: string | null;
  checkpoint: IngestCheckpoint | null;
  open?: boolean;
  heartbeat_at?: Date | string | null;
};

export async function loadLatestRun(userId: string): Promise<RunRecord | null> {
  const rows = await sql()<RunRow[]>`
    select id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at
    from spotdonalds.analysis_runs
    where user_id = ${userId}
    order by started_at desc
    limit 1
  `;
  return rows[0] ? asRun(rows[0]) : null;
}

export async function insertRun(userId: string, startedAt: string): Promise<RunRecord> {
  const db = sql();
  const rows = await db<RunRow[]>`
    insert into spotdonalds.analysis_runs (user_id, status, stage, started_at, counts, checkpoint)
    values (${userId}, 'running', 'ingest', ${startedAt}, ${db.json(emptyCounts())}, ${db.json({})})
    returning id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at
  `;
  const row = rows[0];
  if (!row) throw new Error("analysis run was not created");
  return asRun(row);
}

export async function saveAnalysisRun(run: RunRecord): Promise<void> {
  const db = sql();
  const guard = leaseToken();
  const open = !(run.status === "error" || (run.status === "complete" && run.stage === "done"));
  const result = await db`
    update spotdonalds.analysis_runs
    set status = ${run.status},
        stage = ${run.stage},
        finished_at = ${run.finished_at},
        counts = ${db.json(run.counts)},
        error = ${run.error},
        checkpoint = ${db.json(run.checkpoint)},
        open = ${open}
    where id = ${run.id}
      and user_id = ${run.user_id}
      and (
        ${guard}::text is null
        or lease_token is null
        or lease_token = ${guard}
      )
  `;
  if (result.count !== 1) {
    if (guard) throw new LeaseLost();
    throw new Error("analysis run was not updated");
  }
}

export async function insertOpenRun(userId: string, startedAt: string): Promise<RunRecord> {
  const db = sql();
  const rows = await db<RunRow[]>`
    insert into spotdonalds.analysis_runs (user_id, status, stage, started_at, counts, checkpoint, open)
    values (${userId}, 'running', 'ingest', ${startedAt}, ${db.json(emptyCounts())}, ${db.json({})}, true)
    on conflict (user_id) where open do nothing
    returning id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at
  `;
  if (rows[0]) return asRun(rows[0]);
  const existing = await db<RunRow[]>`
    select id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at
    from spotdonalds.analysis_runs
    where user_id = ${userId} and open
    order by started_at desc
    limit 1
  `;
  const row = existing[0];
  if (!row) throw new Error("analysis run was not created");
  return asRun(row);
}

export async function reopenRun(run: RunRecord): Promise<RunRecord> {
  const db = sql();
  const rows = await db<RunRow[]>`
    update spotdonalds.analysis_runs
    set status = 'running',
        error = null,
        open = true,
        finished_at = null,
        heartbeat_at = null,
        lease_token = null
    where id = ${run.id} and user_id = ${run.user_id}
    returning id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at
  `;
  const row = rows[0];
  if (!row) throw new Error("analysis run was not reopened");
  return asRun(row);
}

export async function acquireLease(runId: string, userId: string, token: string): Promise<boolean> {
  const rows = await sql()<{ id: string }[]>`
    update spotdonalds.analysis_runs
    set heartbeat_at = now(),
        lease_token = ${token}
    where id = ${runId}
      and user_id = ${userId}
      and open
      and status <> 'error'
      and (
        lease_token is null
        or lease_token = ${token}
        or heartbeat_at is null
        or heartbeat_at < now() - make_interval(secs => ${LEASE_STALE_SECONDS})
      )
    returning id
  `;
  return rows.length > 0;
}

export async function touchLease(runId: string, token: string): Promise<void> {
  await sql()`
    update spotdonalds.analysis_runs
    set heartbeat_at = now()
    where id = ${runId} and lease_token = ${token}
  `;
}

export async function releaseLease(runId: string, token: string): Promise<void> {
  await sql()`
    update spotdonalds.analysis_runs
    set lease_token = null
    where id = ${runId} and lease_token = ${token}
  `;
}

function asRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    stage: row.stage,
    started_at: iso(row.started_at),
    finished_at: row.finished_at == null ? null : iso(row.finished_at),
    counts: { ...emptyCounts(), ...row.counts },
    error: row.error,
    checkpoint: row.checkpoint ?? {},
    open: row.open !== false,
    heartbeat_at: row.heartbeat_at == null ? null : iso(row.heartbeat_at),
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
