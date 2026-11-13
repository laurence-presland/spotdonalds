# 05: Live ingestion UI (Analysing screen)

**Size:** M · **Depends on:** 03 (04 for enrichment states)

## Summary / goal
The Analysing screen: a full-screen loading view, headed something like "Analysing your listening history", where the track list fills in row by row as base ingestion and enrichment stream in. Per-row states, source badges and overall progress make the wait feel deliberate. This screen is not a destination; when the full analysis pipeline completes, 13 moves the user on to Results.

## Context
Ingestion and enrichment together take tens of seconds to a few minutes, and the taste profile and order steps add a short wait after the list is already full. Reviewers will sit through this on their first run. The streaming design from 03 and 04 makes it possible to show real progress rather than a spinner. The user arrives here after the welcome transition (13), and comes back here on reload if a run is still in progress.

## In scope
- The Analysing screen itself: a clear heading (for example "Analysing your listening history") and the filling list as the main content. Treat it as a loading screen, not a dashboard.
- A client hook that consumes the NDJSON streams with the shared event schema (including `stage` events) and exposes typed state (rows, progress, errors, status, current pipeline stage). Until 13 lands, this hook can start ingestion then enrichment itself; 13 will wrap or replace that with the full ingest → enrich → profile → order orchestrator.
- A track list that appends rows as events arrive, with Spotify data first (artwork, title, artists, album, source: recent play or top track and rank/window) and enrichment filling in afterwards.
- Per-row states: **pending**, **enriching**, **enriched**, **partial**, **missing**, **error**, each with a distinct, accessible visual treatment.
- Source badges on enriched values (MusicBrainz, Deezer) linking to the source URL, plus MusicBrainz attribution in the footer of the list.
- Overall progress: counts (tracks fetched, enriched, missing), a progress bar, current step label ("Reading your recent plays", "Looking up tags", and once those tickets exist, "Building your taste profile", "Assembling your order"), and a rough remaining-time hint only if it can be honest. After the list is complete, keep the user on this screen and update the step label through the later stages; don't look finished early.
- Tabs or filters for recent plays vs top tracks (per window) vs top artists.
- Reconnect handling: if the stream drops, show it, retry automatically with backoff, and resume.
- Empty, error and 403-access states handled and designed (not blank screens).
- Responsive layout and keyboard/screen-reader basics (list semantics, `aria-live` for progress, not colour-only states).
- On reload mid-run, rebuild the list from the database immediately and continue. 13 is responsible for routing that reload back to this screen.

## Out of scope
- The landing page (02), the welcome transition, auto-progress to Results, and the Results layout (13).
- Aggregate charts and stats (06).
- Taste profile and order UI (08, 11).
- Persisting UI state beyond what the database already holds.

## Acceptance criteria
- [ ] The screen shows a heading along the lines of "Analysing your listening history" while the list is filling in.
- [ ] Rows appear progressively while the streams are still open, and the first row appears within a few seconds of this screen being visible (the welcome in 13 may already have covered start-up).
- [ ] Each row shows the correct state as enrichment progresses, and a track with no metadata ends as `missing` with a visible but unobtrusive indicator.
- [ ] Progress counts match the underlying data at completion (verified against the database in a test or a manual check).
- [ ] When ingest and enrich are done, the screen has a clear in-progress state for later pipeline stages rather than looking like a finished page.
- [ ] Source badges link to the correct source URLs, and MusicBrainz attribution is visible.
- [ ] Dropping the network mid-run shows a reconnecting state, and the run resumes without duplicate rows when the connection returns.
- [ ] Reloading mid-run shows the already-persisted rows immediately and continues.
- [ ] A signed-in but non-allowlisted account sees the access screen, not a broken list.
- [ ] Component tests cover state transitions with a scripted event stream, including error and resume.
- [ ] Lighthouse accessibility score of at least 90 on the page.

## Technical notes
- Keep the stream parsing in a small, well-tested module separate from React so it can be reused by the orchestrator in 13.
- Virtualise the list only if rendering becomes an issue; with ~200 rows it shouldn't.
- Avoid layout shift as rows fill in: fixed row height with skeletons.
- Components: `AnalysingScreen`, `TrackList`, `TrackRow`, `IngestionProgress`, `SourceBadge`. Keep `TrackList` usable in a collapsed form on the Results screen (13).

## Dependencies
03 for the stream; 04 for enrichment states (can start with Spotify-only rows). 13 depends on this screen, not the other way around.

## Open questions
- One combined progress bar or two (fetch vs enrich)? Leaning one bar driven by pipeline `stage`, with a step label.
- Enrichment starts automatically after ingestion (decided: automatic, as part of the pipeline).
