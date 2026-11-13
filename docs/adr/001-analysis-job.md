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

A run with fewer than 50 distinct tracks after ingest (`plays.track_id` union top-track `spotify_id`) finishes as `status = complete`, `stage = done`, `outcome = insufficient_data`. It does not run enrich, profile, popularity, or order. A normal finish sets `outcome = ready`.

## How it runs

The runner is a Vercel Queue. See [ADR 002](002-analysis-queue.md). The row above is still the source of truth: each message processes one stage idempotently against the checkpoint, then enqueues the next unfinished stage.

`workflow_id` is the in-flight queue message (`pending` while the message is being published). The column name is unchanged. A second start loses the compare-and-set while the heartbeat is fresh. A stale heartbeat can be taken over. A consumer refuses to work a row that a different live message owns.
