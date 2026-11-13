# 05: Live ingestion UI (Analysing screen)

**Size:** M · **Depends on:** 03 (04 for enrichment states)

## Summary / goal
The Analysing screen: a loading view headed "Analysing your listening history". The track list fills with tracks that have already been enriched. A track that can't be enriched is dropped and never appears, so the list has no pending, enriching, partial, missing, or error rows. This screen is not a destination; when the full analysis pipeline completes, 13 moves the user on to Results.

## Context
Ingestion and enrichment together take tens of seconds to a few minutes, and the taste profile and order steps add a short wait after the list is already full. Reviewers will sit through this on their first run. The streaming design from 03 and 04 makes it possible to show real progress rather than a spinner. The user arrives here after the welcome transition (13), and comes back here on reload if a run is still in progress.

## In scope
- The Analysing screen itself: the heading is exactly "Analysing your listening history", with no eyebrow above it and no subtitle under it. The filling list is the main content. Treat it as a loading screen, not a dashboard.
- The bar is the yellow wordmark only. No S icon, no log out, no order number.
- A client hook that consumes the NDJSON streams with the shared event schema (including `stage` events) and exposes typed state (rows, progress, errors, status, current pipeline stage). Until 13 lands, this hook can start ingestion then enrichment itself; 13 will wrap or replace that with the full ingest → enrich → profile → order orchestrator.
- A track list that appends a row only once that track has been enriched. Each row shows album art when Spotify provided an image URL, otherwise a letter tile, plus title, artists, album, and source (recent play, or top track with rank/window). No per-row enrichment state and no source badges.
- Tracks that fail enrichment are not rendered. 04 drops them; this screen never shows a placeholder for them.
- Three stages, in this order: "Reading your history", "Analysing your taste", "Assembling your order". Reading covers ingest and enrich (rows appear during it). Taste is the profile step. Order is assembly. One progress bar, a simple track count, and the current stage marked. No remaining-time guess. After the list is complete, keep the user on this screen and move the stage through taste and order; don't look finished early.
- Footer line, exactly: "Data provided by Spotify, MusicBrainz, and Deezer."
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
- [x] The screen shows the heading "Analysing your listening history" and nothing smaller directly above or below it.
- [x] The three stages are "Reading your history", "Analysing your taste", and "Assembling your order", and the current one is visible.
- [x] The bar is the yellow wordmark only.
- [x] A row appears only after that track has been enriched, and the first such row appears within a few seconds of this screen being visible (the welcome in 13 may already have covered start-up).
- [x] A track that could not be enriched never appears, including after reload.
- [x] Album art uses the Spotify image when there is one, and a letter tile when there isn't.
- [x] Progress counts match the kept tracks at completion (verified against the database in a test or a manual check).
- [x] When reading is done, the screen moves to "Analysing your taste" and then "Assembling your order" instead of looking finished.
- [x] The footer reads "Data provided by Spotify, MusicBrainz, and Deezer."
- [x] Dropping the network mid-run shows a reconnecting state, and the run resumes without duplicate rows when the connection returns.
- [x] Reloading mid-run shows the already-persisted rows immediately and continues.
- [x] A signed-in but non-allowlisted account sees the access screen, not a broken list.
- [x] Component tests cover state transitions with a scripted event stream, including error and resume.
- [ ] Lighthouse accessibility score of at least 90 on the page.

## Technical notes
- Keep the stream parsing in a small, well-tested module separate from React so it can be reused by the orchestrator in 13.
- Virtualise the list only if rendering becomes an issue; with ~200 rows it shouldn't.
- Avoid layout shift as rows fill in: fixed row height. Rows are inserted whole, so there is no skeleton state to design.
- Use the album image URL from Spotify when the track has one. Don't bundle copyrighted cover art in the repo; the letter tile is the fallback.
- Components: `AnalysingScreen`, `TrackList`, `TrackRow`, `IngestionProgress`. The track list stays on Analysing. Results does not include it (13).

## Dependencies
03 for the stream; 04 for enrichment states (can start with Spotify-only rows). 13 depends on this screen, not the other way around.

## Open questions
- One progress bar, driven by the three visible stages. Decided.
- Enrichment is part of "Reading your history", not its own stage. A track is shown only after it succeeds. Decided.
