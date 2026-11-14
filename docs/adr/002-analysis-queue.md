# ADR 002: Analysis stages run on Vercel Queues

**Superseded by [ADR 003](003-analysis-workflow.md).** The runner is a Vercel Workflow again. The notes below are the queue decision as it stood on 13 November 2026. They are not the current design.

ADR 001 still describes the run row and the stage order. This note replaced the runner for one deployment. The database remained the source of truth.

## Decision

Each stage is one message on the `analysis` topic. `app/api/queues/analysis` consumes it with `@vercel/queue` `handleCallback`. The consumer loads the run, runs that stage only if the checkpoint says it is the next unfinished one, then enqueues the real next stage. A skip still enqueues the stage the checkpoint asks for, not the following name in the list.

The idempotency key for a normal handoff is `runId:stage:attempts`. A recovery handoff adds `:recover:` and the heartbeat it observed, so one stale heartbeat produces one message and a later heartbeat can send another. Vercel drops a duplicate key inside the retention window instead of running it twice.

A thrown stage is retried. The consumer allows three deliveries. On the last one it writes `status = error`, leaves `stage` on the stage that failed, stores the error message, and acknowledges the message. The run is not left `running`.

A read of a `running` row with no heartbeat for 3 minutes publishes one recovery message and records `checkpoint.recovery_at` without moving the heartbeat. If that recovery is itself 3 minutes old and the heartbeat is still stale, the read closes the run with `The worker stopped during <stage>`. Publishing the recovery is not treated as a live worker.

## Why this is available here

Checked against the Vercel docs on 13 November 2026:

- [Queues](https://vercel.com/docs/queues) says Vercel Queues are available in beta on all plans. This project is Hobby, so the runner is not blocked.
- [Pricing and limits](https://vercel.com/docs/queues/pricing): Hobby includes the first 1,000,000 Queue API operations. Sends, receives, deletes, visibility changes, and push notifies each count. Messages are metered in 4 KiB chunks. A send with an idempotency key is billed at 2×. The pricing table lists Pro as usage-based and does not list a Hobby overage. Retention defaults to 24 hours and can be set from 60 seconds to 7 days. Visibility timeout defaults to 60 seconds and can be raised to 60 minutes. The first 32 retries use the configured delay, then the queue forces a backoff.
- [Function duration](https://vercel.com/docs/functions/configuring-functions/duration): Hobby functions default to 300 seconds and cannot run longer. The consumer and the watch stream both set `maxDuration` to 300. The stream stops itself at 240 seconds and sends a resume cursor so the browser can reconnect.

Push delivery invokes the consumer inside the deployment. It is not an HTTP fetch of the preview URL, which is the call Deployment Protection was redirecting to SSO. That is why a queue consumer can run on this protected preview when a self-fetch cannot.

## Read path

`GET /api/runs/watch` is what the analysing screen reads.

- A terminal run (complete and done, including `insufficient_data`, or `error`) returns one JSON snapshot: the run, the tracks and artists stored so far, and the profile and order when the outcome is ready.
- A running run returns NDJSON. The first bytes replay every stored track and artist, then the current stage. Later bytes add tracks as they land and stage changes as the row changes. At a terminal state the stream sends that state and closes. At 240 seconds it sends a resume cursor and closes; the client calls the same route with that cursor and receives only what it has not already been sent.
- A refresh has no cursor, so the stream replays what is already stored.

`POST /api/analyse` still runs only for a first visit, Try again (`?retry=1`), and Start fresh (`?fresh=1`). The stream does not POST.

## Fewer than 50 tracks

After ingest, the distinct track count is `plays.track_id` union top-track `spotify_id`. Below 50, the run finishes `complete` / `done` / `outcome = insufficient_data` and the count is stored on `checkpoint.track_count`. Enrich, profile, popularity, and order are not enqueued. The page says "Not enough listening data yet", shows the count, and offers Try again later, which starts a new run.

## Auth and database failures

`getUser` in the proxy and in `getSessionUser` is limited to 8 seconds. A timeout or a 5xx from Supabase Auth sends `/app` to `/?notice=unavailable` and API routes to HTTP 503 with a message. The page renders that message with a retry that reloads, instead of waiting on the auth call. A database error while loading `/app` or the watch route does the same. Neither path redirects in a loop: the landing page and the health check stay available when auth is down.
