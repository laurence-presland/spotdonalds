# 05: Live ingestion UI

**Size:** M · **Depends on:** 03 (04 for enrichment states)

## Summary / goal
After sign-in, show the list of tracks filling in as they stream from the ingestion and enrichment endpoints, with a clear per-row state and overall progress. Reviewers will sit through this wait on their first run, so it should feel deliberate, not stalled.

## Context
Ingestion and enrichment together take tens of seconds to a few minutes. The experience of the wait is part of the product, and the streaming design from 03 and 04 makes it possible to show real progress rather than a spinner.

## In scope
- A client hook that starts ingestion, then enrichment, consumes the NDJSON streams with the shared event schema, and exposes typed state (rows, progress, errors, status).
- A track list that appends rows as events arrive, with Spotify data first (artwork, title, artists, album, source: recent play or top track and rank/window) and enrichment filling in afterwards.
- Per-row states: **pending**, **enriching**, **enriched**, **partial**, **missing**, **error**, each with a distinct, accessible visual treatment.
- Source badges on enriched values (MusicBrainz, Deezer) linking to the source URL, plus MusicBrainz attribution in the footer of the list.
- Overall progress: counts (tracks fetched, enriched, missing), a progress bar, current step label ("Reading your recent plays", "Looking up tags"), and a rough remaining-time hint only if it can be honest.
- Tabs or filters for recent plays vs top tracks (per window) vs top artists.
- Reconnect handling: if the stream drops, show it, retry automatically with backoff, and resume.
- Empty, error and 403-access states handled and designed (not blank screens).
- Responsive layout and keyboard/screen-reader basics (list semantics, `aria-live` for progress, not colour-only states).

## Out of scope
- Aggregate charts and stats (06).
- Taste profile and order UI (08, 11).
- Persisting UI state beyond what the database already holds: on reload, the list is rebuilt from the database and any incomplete run resumes.

## Acceptance criteria
- [ ] On first sign-in, rows appear progressively while the streams are still open, and the first row appears within a few seconds.
- [ ] Each row shows the correct state as enrichment progresses, and a track with no metadata ends as `missing` with a visible but unobtrusive indicator.
- [ ] Progress counts match the underlying data at completion (verified against the database in a test or a manual check).
- [ ] Source badges link to the correct source URLs, and MusicBrainz attribution is visible.
- [ ] Dropping the network mid-run shows a reconnecting state, and the run resumes without duplicate rows when the connection returns.
- [ ] Reloading mid-run shows the already-persisted rows immediately and continues.
- [ ] A signed-in but non-allowlisted account sees the access screen, not a broken list.
- [ ] Component tests cover state transitions with a scripted event stream, including error and resume.
- [ ] Lighthouse accessibility score of at least 90 on the page.

## Technical notes
- Keep the stream parsing in a small, well-tested module separate from React so it can be reused.
- Virtualise the list only if rendering becomes an issue; with ~200 rows it shouldn't.
- Avoid layout shift as rows fill in: fixed row height with skeletons.
- Components: `TrackList`, `TrackRow`, `IngestionProgress`, `SourceBadge`.

## Dependencies
03 for the stream; 04 for enrichment states (can start with Spotify-only rows).

## Open questions
- One combined progress bar or two (fetch vs enrich)? Leaning two stages in one bar with a step label.
- Should enrichment start automatically after ingestion, or behind a button? Leaning automatic.
