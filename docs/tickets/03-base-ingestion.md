# 03: Base Spotify ingestion and streaming

**Size:** M · **Depends on:** 01, 02

## Summary / goal
Fetch everything useful Spotify will give us for the signed-in user (recent plays plus top tracks and artists for all three windows), normalise it, persist it, and stream each item to the browser as it arrives. A dropped connection must be resumable without refetching what's already saved.

## Context
The data available is limited and we should be honest about it. Recently played returns at most 50 items per call (before/after cursors) and in practice history is shallow, so treat roughly 50 plays as the ceiling. Podcasts are excluded, and `duration_ms` is the track's length, not how long the user listened. Top items come in `short_term` (about 4 weeks), `medium_term` (about 6 months) and `long_term` (about 1 year), max 50 each. Artist genres and popularity are deprecated, and audio-features / audio-analysis are unavailable to new apps (since 27 Nov 2024), which is why enrichment (04) exists.

## In scope
- Spotify client module: typed wrappers for `me/player/recently-played`, `me/top/tracks`, `me/top/artists`, with 429 handling (honour `Retry-After`), retries with backoff, and typed errors (including the 403 allowlist case).
- Normalisation into our own types: track (Spotify id, ISRC if present, name, artists, album, release date, duration, explicit, URLs), artist (id, name, URLs, whatever genres/popularity come back, stored but treated as unreliable), play (track, `played_at`), and top-item rank per window.
- Database tables and migration: `tracks`, `artists`, `track_artists`, `plays`, `top_items` (user, kind, window, rank), keyed so re-runs upsert rather than duplicate. RLS so users only see their own rows.
- `POST /api/ingest` (Node runtime): streams NDJSON events, one per item or batch (for example `{type:"track", ...}`, `{type:"progress", done, total}`, `{type:"done"}`, `{type:"error", ...}`), flushing as each Spotify call completes.
- Ingestion run record (status, started, finished, counts) so the UI and resume logic know where things stand.
- Resumability: a re-request skips what is already persisted for the run and continues; an interrupted run can be resumed by the client reconnecting.
- A shared stream event schema (zod) used by server and client, since 04 and 05 reuse it.

## Out of scope
- Metadata enrichment (04).
- Any UI beyond a minimal debug view (05).
- Spotify privacy-export backfill (future work).

## Acceptance criteria
- [ ] Hitting `/api/ingest` as a signed-in user streams events progressively (first event arrives before the last Spotify call completes) on the deployed Vercel app, not just locally.
- [ ] Recent plays, and top tracks and artists for all three windows, are persisted and match what Spotify returned (spot check against a real account).
- [ ] Running ingestion twice does not duplicate rows.
- [ ] Killing the connection mid-stream and calling again completes the run without refetching persisted items (covered by a test with a stubbed Spotify client).
- [ ] Spotify 429 and 5xx responses are retried with backoff and the stream reports an error event if retries are exhausted.
- [ ] A 403 from Spotify produces a typed error mapped to the access screen from 02.
- [ ] The route requires auth and only ever reads/writes the caller's data.
- [ ] Normalisation has unit tests using recorded Spotify response fixtures.
- [ ] Each run logs duration and per-endpoint counts.

## Technical notes
- Vercel response bodies are capped at 4.5 MB unless streamed; use a streamed `Response` from a Node route handler, with `export const maxDuration` set explicitly. Ingestion itself should be quick (a handful of calls); the long part is enrichment (04).
- Prefer plain HTTP streaming (NDJSON or SSE) over WebSockets: it works on every plan, needs no extra infra and is enough for one-way progress.
- Store raw Spotify payloads (jsonb) alongside normalised columns so we can show "original Spotify data" in the UI without a second fetch.
- ISRC: `external_ids.isrc` is expected on track objects but not confirmed for dev-mode apps; store it nullable.

## Dependencies
01, 02 (needs a valid user access token).

## Open questions
- Is `external_ids.isrc` returned in dev mode? Verify on the first real call and record the answer here and in the README.
- How many recent plays does a typical account actually return before paging stops?
- Hobby's 300s limit is ample for this ticket, but confirm there is no need for a background worker.
