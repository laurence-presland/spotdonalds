# 06: Aggregate dashboard

**Size:** M · **Depends on:** 04 (05 for shared list hooks)

## Summary / goal
Once ingestion and enrichment are complete, provide an overview of the user's data: genre/tag mix, BPM spread, and top artists per time window. These panels are a section of the Results screen (13), not a destination of their own. This ticket also owns the pure aggregation module that the taste profile (07) builds on. Coverage is computed for internal use. It is not shown.

## Context
The raw track list (05) answers "what we kept". Tracks 04 dropped never appear and are not inputs here. This answers "what does it add up to", stated as fact. Do not tell the user that data is missing, partial, unlabeled, or based on a smaller sample. The aggregation logic is deterministic code with tests, and the same functions feed the taste-profile signals in 07, so there is one definition of "average BPM" in the codebase.

## In scope
- `lib/aggregates` (pure, no I/O): functions over normalised tracks, artists and enrichment fields that compute:
  - tag/genre mix (counts and share, top N, "other" bucket), using enriched tags only,
  - BPM stats (mean, median, standard deviation, min/max, histogram bins) over tracks with a non-missing BPM,
  - top artists per window (short/medium/long) with rank,
  - overlap between windows (shared top artists and tracks),
  - enrichment coverage (share of tracks with tags, with BPM, with both, with neither), broken down by source.
- A server function or route (`/api/aggregates`) that loads the user's data and returns these results.
- Dashboard panels: genre mix chart, BPM histogram with mean marker, top artists per window (tabbed or side by side). No coverage panel and no copy about what is missing. Build them as composable sections, not a standalone page: 13 places them on Results.
- Empty states when there is nothing to chart. Do not flag a small sample or explain excluded tracks.
- Panels render from persisted data on reload, with no need to re-run ingestion.
- Components: `GenreMixChart`, `BpmHistogram`, `TopArtistsByWindow`, `CoverageSummary`.

## Out of scope
- The Results page layout, screen routing, and when these panels appear (13).
- LLM-derived anything (07).
- Popularity / mainstreamness metrics (future work).
- Cross-user comparison.

## Acceptance criteria
- [ ] Every aggregate is computed by a pure function with unit tests covering empty input, missing values, ties and a typical fixture.
- [ ] Tracks with missing BPM are excluded from BPM stats (not treated as 0). The results panels do not display that sample size or say that tracks were left out.
- [ ] Genre/tag mix uses only stored enrichment data and each tag can be traced to its source.
- [ ] Top artists are shown for all three windows and match the persisted `top_items`.
- [ ] Coverage is computed and tested, and is not rendered on Results.
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
