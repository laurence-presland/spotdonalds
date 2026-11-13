# 06: Aggregate dashboard

**Size:** M · **Depends on:** 04 (05 for shared list hooks)

## Summary / goal
Once ingestion and enrichment are complete, provide an overview of the user's data: genre/tag mix, BPM spread, top artists per time window, and how much of the data we actually managed to enrich. These panels are a section of the Results screen (13), not a destination of their own. This ticket also owns the pure aggregation module that the taste profile (07) builds on.

## Context
The raw track list (05) answers "what did Spotify give us". This answers "what does it add up to". It must be honest about coverage: if only 60% of tracks have a BPM, the BPM chart says so. The aggregation logic is deterministic code with tests, and the same functions feed the taste-profile signals in 07, so there is one definition of "average BPM" in the codebase.

## In scope
- `lib/aggregates` (pure, no I/O): functions over normalised tracks, artists and enrichment fields that compute:
  - tag/genre mix (counts and share, top N, "other" bucket), using enriched tags only,
  - BPM stats (mean, median, standard deviation, min/max, histogram bins) over tracks with a non-missing BPM,
  - top artists per window (short/medium/long) with rank,
  - overlap between windows (shared top artists and tracks),
  - enrichment coverage (share of tracks with tags, with BPM, with both, with neither), broken down by source.
- A server function or route (`/api/aggregates`) that loads the user's data and returns these results.
- Dashboard panels: genre mix chart, BPM histogram with mean marker, top artists per window (tabbed or side by side), a coverage panel with plain-language explanation of what's missing and why. Build them as composable sections, not a standalone page: 13 places them on Results.
- Empty and low-data states (for example, fewer than 10 tracks with BPM: show the numbers but flag that the sample is small).
- Panels render from persisted data on reload, with no need to re-run ingestion.
- Components: `GenreMixChart`, `BpmHistogram`, `TopArtistsByWindow`, `CoverageSummary`.

## Out of scope
- The Results page layout, screen routing, and when these panels appear (13).
- LLM-derived anything (07).
- Popularity / mainstreamness metrics (future work).
- Cross-user comparison.

## Acceptance criteria
- [ ] Every aggregate is computed by a pure function with unit tests covering empty input, missing values, ties and a typical fixture.
- [ ] Tracks with missing BPM are excluded from BPM stats (not treated as 0), and the sample size is displayed next to the stat.
- [ ] Genre/tag mix uses only stored enrichment data and each tag can be traced to its source.
- [ ] Top artists are shown for all three windows and match the persisted `top_items`.
- [ ] The coverage panel's percentages match the database for a real account (manual check recorded in the PR).
- [ ] The panels render from persisted data on reload without re-running ingestion.
- [ ] Charts are readable at mobile widths and have text alternatives (a table or `aria-label` summary).
- [ ] Loading, empty and error states exist for the panels.

## Technical notes
- Use a lightweight chart approach (inline SVG or a small library). Don't pull in a heavy dependency for two charts.
- Tag noise: MusicBrainz tags can include junk like "seen live". Keep a small, documented ignore-list and apply vote-count thresholds in one place.
- Compute server-side so the client gets small payloads, and so 07 can call the same code.
- Give sections stable anchors so insight and rule chips in 08 and 11 can scroll to them on the Results screen.

## Dependencies
04 for enrichment data; 05 for shared data hooks. 13 composes the panels onto Results.

## Open questions
- How many genre buckets before "other"? Start at 8.
- Do we normalise tags into a small vocabulary (for example, merge "hip hop" / "hip-hop" / "rap")? Start with simple normalisation and a short alias map, and log unmapped tags.
