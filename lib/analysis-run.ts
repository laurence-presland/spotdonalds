import { LeaseLost, leaseToken } from "@/lib/analyse/lease";
import { WORKER_STALE_SECONDS } from "@/lib/analyse/machine";
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
  attempts?: number | null;
  workflow_id?: string | null;
  outcome?: string | null;
};

export async function loadLatestRun(userId: string): Promise<RunRecord | null> {
  const rows = await sql()<RunRow[]>`
    select id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at, attempts, workflow_id, outcome
    from spotdonalds.analysis_runs
    where user_id = ${userId}
    order by started_at desc
    limit 1
  `;
  return rows[0] ? asRun(rows[0]) : null;
}

export async function loadOpenRun(userId: string): Promise<RunRecord | null> {
  const rows = await sql()<RunRow[]>`
    select id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at, attempts, workflow_id, outcome
    from spotdonalds.analysis_runs
    where user_id = ${userId} and open
    order by started_at desc
    limit 1
  `;
  return rows[0] ? asRun(rows[0]) : null;
}

export async function loadRun(runId: string, userId: string): Promise<RunRecord | null> {
  const rows = await sql()<RunRow[]>`
    select id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at, attempts, workflow_id, outcome
    from spotdonalds.analysis_runs
    where id = ${runId} and user_id = ${userId}
  `;
  return rows[0] ? asRun(rows[0]) : null;
}

export async function insertRun(userId: string, startedAt: string): Promise<RunRecord> {
  const db = sql();
  const rows = await db<RunRow[]>`
    insert into spotdonalds.analysis_runs (user_id, status, stage, started_at, counts, checkpoint)
    values (${userId}, 'running', 'ingest', ${startedAt}, ${db.json(emptyCounts())}, ${db.json({})})
    returning id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at, attempts, workflow_id, outcome
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
        outcome = ${run.outcome ?? null},
        checkpoint = ${db.json(run.checkpoint)},
        open = ${open},
        attempts = coalesce(${run.attempts ?? null}, attempts),
        heartbeat_at = case when ${run.status} = 'running' then now() else heartbeat_at end
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
    returning id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at, attempts, workflow_id, outcome
  `;
  if (rows[0]) return asRun(rows[0]);
  const existing = await db<RunRow[]>`
    select id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at, attempts, workflow_id, outcome
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
  const rows = await sql()<RunRow[]>`
    update spotdonalds.analysis_runs
    set status = 'running',
        error = null,
        open = true,
        finished_at = null,
        heartbeat_at = null,
        lease_token = null,
        workflow_id = null
    where id = ${run.id} and user_id = ${run.user_id}
    returning id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at, attempts, workflow_id, outcome
  `;
  const row = rows[0];
  if (!row) throw new Error("analysis run was not reopened");
  return asRun(row);
}

export async function closeOpenRun(userId: string): Promise<void> {
  await sql()`
    update spotdonalds.analysis_runs
    set open = false,
        status = case when status = 'running' then 'error' else status end,
        error = case when status = 'running' then 'Closed to start a new analysis.' else error end,
        finished_at = case when status = 'running' and finished_at is null then now() else finished_at end,
        lease_token = null,
        workflow_id = null
    where user_id = ${userId} and open
  `;
}

export async function claimWorker(runId: string, userId: string): Promise<boolean> {
  const rows = await sql()<{ id: string }[]>`
    update spotdonalds.analysis_runs
    set heartbeat_at = now(),
        workflow_id = 'pending',
        lease_token = null
    where id = ${runId}
      and user_id = ${userId}
      and open
      and status = 'running'
      and stage <> 'done'
      and (
        workflow_id is null
        or heartbeat_at is null
        or heartbeat_at < now() - make_interval(secs => ${WORKER_STALE_SECONDS})
      )
    returning id
  `;
  return rows.length > 0;
}

export async function assertWorker(runId: string, userId: string, workflowRunId: string): Promise<boolean> {
  const rows = await sql()<{ id: string }[]>`
    update spotdonalds.analysis_runs
    set heartbeat_at = now(),
        workflow_id = ${workflowRunId}
    where id = ${runId}
      and user_id = ${userId}
      and open
      and status = 'running'
      and (
        workflow_id is null
        or workflow_id = 'pending'
        or workflow_id = ${workflowRunId}
        or heartbeat_at is null
        or heartbeat_at < now() - make_interval(secs => ${WORKER_STALE_SECONDS})
      )
    returning id
  `;
  return rows.length > 0;
}

export async function setWorkflowId(runId: string, userId: string, workflowRunId: string): Promise<void> {
  await sql()`
    update spotdonalds.analysis_runs
    set workflow_id = ${workflowRunId},
        heartbeat_at = now()
    where id = ${runId}
      and user_id = ${userId}
      and workflow_id = 'pending'
  `;
}

export async function clearPendingWorkflow(runId: string, userId: string): Promise<void> {
  await sql()`
    update spotdonalds.analysis_runs
    set workflow_id = null,
        heartbeat_at = null
    where id = ${runId}
      and user_id = ${userId}
      and workflow_id = 'pending'
  `;
}

export async function noteRecovery(runId: string, userId: string, at: string): Promise<void> {
  await sql()`
    update spotdonalds.analysis_runs
    set checkpoint = jsonb_set(coalesce(checkpoint, '{}'::jsonb), '{recovery_at}', to_jsonb(${at}::text), true)
    where id = ${runId}
      and user_id = ${userId}
      and status = 'running'
  `;
}

export async function markOwnedRunFailed(
  runId: string,
  userId: string,
  workflowRunId: string,
  message: string,
): Promise<RunRecord | null> {
  const rows = await sql()<RunRow[]>`
    update spotdonalds.analysis_runs
    set status = 'error',
        error = ${message},
        finished_at = coalesce(finished_at, now()),
        open = false,
        attempts = attempts + 1,
        lease_token = null,
        heartbeat_at = null
    where id = ${runId}
      and user_id = ${userId}
      and status = 'running'
      and stage <> 'done'
      and workflow_id = ${workflowRunId}
      and outcome is distinct from 'insufficient_data'
      and outcome is distinct from 'ready'
    returning id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at, attempts, workflow_id, outcome
  `;
  return rows[0] ? asRun(rows[0]) : null;
}

export async function markRunFailed(runId: string, userId: string, message: string): Promise<RunRecord | null> {
  const rows = await sql()<RunRow[]>`
    update spotdonalds.analysis_runs
    set status = 'error',
        error = ${message},
        finished_at = coalesce(finished_at, now()),
        open = false,
        attempts = attempts + 1,
        lease_token = null,
        heartbeat_at = null
    where id = ${runId}
      and user_id = ${userId}
      and status = 'running'
    returning id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint, open, heartbeat_at, attempts, workflow_id, outcome
  `;
  return rows[0] ? asRun(rows[0]) : null;
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
    attempts: row.attempts ?? 0,
    workflow_id: row.workflow_id ?? null,
    outcome: row.outcome === "ready" || row.outcome === "insufficient_data" ? row.outcome : null,
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
