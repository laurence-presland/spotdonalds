# ADR 004: Two-step workflow and three read endpoints

Supersedes the step list and the read path in [ADR 003](003-analysis-workflow.md). [ADR 001](001-analysis-job.md) still describes the run row. The database remains the source of truth. One open run per person. The browser never starts a workflow.

## When a workflow starts

The auth callback starts a workflow only when the latest run is missing or `status = error`. A `running` run is left to the worker that owns it. A `complete` run, including `outcome = insufficient_data`, is never started again by a later sign-in. Start fresh is the only way to rerun a completed flow. It closes the open row, inserts a new one, and starts a new workflow. Try again reopens an error and starts a workflow. Both buttons POST. The page does not.

`GET /api/analysis/status` only reports the row. A read does not start, restart, or change a workflow. A `running` row with no workflow id, or with a stale heartbeat, stays `running` until Try again or Start fresh. The steps skip work that is already stored when a workflow is actually running. The last failure of a step writes `status = error` and the message.

## Two steps

1. **ingest.** Count distinct tracks already stored (`plays.track_id` union top-track `spotify_id`). At 50 or more, do not call Spotify. Otherwise fetch the remaining Spotify sources and persist each track as it is stored, so a reader can see it before the fetch finishes. If the count is still under 50, finish `complete` / `done` / `outcome = insufficient_data` and do not analyse.
2. **analyse.** BPM and the other stats, MusicBrainz and Deezer enrichment, the taste-profile model call, and the order model call. Each piece checks the database and skips when its output is already stored. The visible `stage` stays `analyse` for the whole step. When the step finishes, including when every piece skipped, the run is `complete` / `done` / `outcome = ready`.

`workflow_id` stores the workflow run id.

## Read API

Checked on 13 November 2026 against the [Fluid compute duration limits](https://vercel.com/docs/functions/limitations): Hobby functions default to 300 seconds and cannot run longer. These routes set `maxDuration` to 300 and stop themselves at 240 seconds.

- `GET /api/analysis/status` returns `{ status, stage, outcome, error, trackCount }` and does nothing else. `status` is `none`, `running`, `complete`, or `error`. `stage` is `ingest`, `analyse`, or `null`. `outcome` is `ready`, `insufficient_data`, or `null`.
- `GET /api/analysis/tracks` streams NDJSON while `stage` is `ingest`: tracks already stored, then each new track, then close when ingest finishes or errors. After ingest, it returns one JSON body of the stored tracks. At 240 seconds the stream sends a resume cursor and closes. The client calls the same route with that cursor.
- `GET /api/analysis/results` returns the profile, order, menu, and aggregates when the run is ready. While analysis is still running it holds the request and polls the database. At 240 seconds it returns `202` with `retry: true`. The client calls it again. `insufficient_data` and `error` are returned as themselves, not as an empty result.

The page calls status, then tracks while a run is in progress, then results. The results request is what the analysing progress bar covers. Supabase Realtime is not used.
