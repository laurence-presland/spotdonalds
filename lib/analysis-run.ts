import { sql } from "@/lib/db";
import { emptyCounts, type IngestCheckpoint, type IngestCounts, type RunRecord, type RunStage, type RunStatus } from "@/lib/ingest/types";

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
};

export async function loadLatestRun(userId: string): Promise<RunRecord | null> {
  const rows = await sql()<RunRow[]>`
    select id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint
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
    returning id, user_id, status, stage, started_at, finished_at, counts, error, checkpoint
  `;
  const row = rows[0];
  if (!row) throw new Error("analysis run was not created");
  return asRun(row);
}

export async function saveAnalysisRun(run: RunRecord): Promise<void> {
  const db = sql();
  const result = await db`
    update spotdonalds.analysis_runs
    set status = ${run.status},
        stage = ${run.stage},
        finished_at = ${run.finished_at},
        counts = ${db.json(run.counts)},
        error = ${run.error},
        checkpoint = ${db.json(run.checkpoint)}
    where id = ${run.id} and user_id = ${run.user_id}
  `;
  if (result.count !== 1) throw new Error("analysis run was not updated");
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
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
