# ADR 003: One Vercel Workflow per analysis

Supersedes [ADR 002](002-analysis-queue.md). The step list and the read path below are superseded by [ADR 004](004-analysis-flow.md). [ADR 001](001-analysis-job.md) still describes the run row. The database remains the source of truth. One open run per person. The queue postmortem in this note still stands.

## Decision

Each user flow is one workflow run. `workflow_id` stores that run id. The steps, in order, are `ensureTracks`, enrich, profile, popularity, and order. Each step is idempotent: it reads the database, skips when its output is already there, and writes the stage and checkpoint onto the run row. Workflow retries a failed step. The last attempt writes `status = error` and the error message, and leaves `stage` on the step that failed. The run is not left `running`.

`ensureTracks` counts distinct tracks (`plays.track_id` union top-track `spotify_id`) before it calls Spotify. At 50 or more it skips the fetch and records `checkpoint.track_count`. Below 50 it fetches the remaining Spotify sources. If the count is still under 50, the run finishes `complete` / `done` / `outcome = insufficient_data` and the later steps do not run. Otherwise the later steps run, skipping any output that already exists. After the last step the workflow writes `complete` / `done` / `outcome = ready`, with `finished_at` set and `open = false`. That write happens even when every step skipped. An existing order row is not enough on its own: the finish step has to record `done`, which is what left run `5c3177c8-0d62-403d-993e-dd80db563e95` open.

The workflow starts on the server. The auth callback starts it the first time someone signs in and has no run yet. Try again and Start fresh are buttons; they POST, and the server starts a workflow. The page does not POST on load. While a run is open the page reads `GET /api/runs/watch` and renders the row. A read of a running row with no workflow id, or with a heartbeat older than 3 minutes, starts the same workflow again. The steps skip completed work, so the stalled run `f382a125-e0e0-4516-a3b5-f84a87111bec` is picked up on the next read once its heartbeat is stale.

## Why the queue runner was dropped

ADR 002 shipped one queue message per stage. On 13 November 2026 a fresh run finished ingest (`ingest.finished`, 50 recently played and full top-track windows) and then never advanced. The row stayed `status = running`, `stage = ingest`, `error = null`, `attempts = 0`, and `workflow_id` stayed the ingest message id. There was no second `POST /api/queues/analysis`, and no error or warning after `ingest.finished`.

The consumer was supposed to publish the next stage after ingest and then acknowledge. That publish is a separate `send()`. Vercel deduplicates an idempotency key after `send()` returns, and a duplicate is dropped with no error. The handler also did not log, and did not write `status = error`, when it finished ingest and no later consumer ran. The row therefore stayed `running` at `ingest` with nothing in the logs to show the handoff had failed. One workflow run does not publish a second message between steps, and a skipped step still falls through to the finish write.

## Read path and auth

Unchanged from ADR 002. A terminal run returns one JSON snapshot. A running run returns NDJSON, replays stored tracks, and closes with a resume cursor at 240 seconds so the client can reconnect inside the Hobby 300 second function limit. Auth and database failures render a retry instead of hanging. The stream does not start the analysis; a stale row is the only read that starts a workflow, and that start is on the server.
