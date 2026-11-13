# ADR 001: Analysis runs are resumable backend jobs

An analysis run is one row in `spotdonalds.analysis_runs`. That row is the only source of truth for whether the job is in progress, finished, or failed, which stage it is on, and how far enrichment got. The page reads the row. It does not drive the pipeline.

## State machine

`stage` is the stage in progress, or `done` when the job has finished. It is never a previous stage while a later stage is running.

```text
ingest → enrich → profile → popularity → order → done
```

`status` is `running` until the job finishes. `complete` is only valid together with `stage = done`. `error` leaves `stage` on the stage that failed.

A stage is finished when its checkpoint (or its row) is present, not when the stage column has moved on:

| Stage | Done when |
| --- | --- |
| ingest | `recently_played` and every `top_tracks` / `top_artists` term are set |
| enrich | `checkpoint.enrich` is true |
| profile | a `taste_profiles` row exists for this run |
| popularity | `checkpoint.popularity` is true |
| order | an `orders` row exists for this run |

The next stage is the first one that is not done. An order row finishes the run immediately, even if the stage column still says `profile`. That is what left run `5c3177c8-0d62-403d-993e-dd80db563e95` open: the order had already been stored, the worker returned without writing `done`, and the page kept starting the same no-op.

Failure writes `status = error`, the failing stage, `error`, `finished_at`, `open = false`, and increments `attempts`. Retry sets the same row back to `running` and starts again from the first unfinished stage. Start fresh closes the open row and inserts a new one. One open row per person is enforced by `analysis_runs_one_open`.

## How it runs

Each run is a Vercel Workflow. The workflow function only sequences steps. Each step is one stage, runs in its own invocation, and is idempotent against the checkpoint. A thrown step is retried by the workflow runtime. On the last attempt the step writes `error` and stops, so the row cannot stay `running`. A worker that dies without writing anything goes stale: no heartbeat for 3 minutes. The next read marks that run failed with `The worker stopped during <stage>`. A page load of a running row with no live worker starts the workflow again; the steps skip completed stages.

The page polls `GET /api/runs`. `POST /api/analyse` runs when a visit has no run yet, when the person presses Try again (`?retry=1`), or when they press Start fresh (`?fresh=1`). The poll does not POST.

`workflow_id` is the workflow run that owns the row (`pending` while it is starting). A second start loses the compare-and-set while the heartbeat is fresh. A stale heartbeat can be taken over. Steps refuse to work a row that a different live workflow owns.

## Why a workflow, not `after()` or a cron

`after()` on `POST /api/analyse` is what stalled: the invocation logged the stage and never reached a model call or a terminal write. Chaining the next stage by fetching this deployment's own URL does not work on a preview behind Vercel Authentication, because that fetch is redirected to SSO. Vercel Cron does not run on previews, so a sweeper cron cannot recover a preview run.

A workflow step is dispatched by Vercel's queue to the deployment that started it, including a protected preview, and each step has its own duration budget. The database stays the source of truth the page reads; the UI does not poll the workflow run. Queues would need a separate consumer and the same checkpoint machine, without giving the stage sequence a durable parent. The workflow is the parent.
