# 06: Aggregate dashboard

**Size:** M · **Depends on:** 04 (05 for the page shell)

## Summary / goal
Once ingestion and enrichment are complete, show the user an overview of their data: genre/tag mix, BPM spread, top artists per time window, and how much of the data we actually managed to enrich. It also owns the pure aggregation module that the taste profile (07) builds on.

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
- Dashboard UI: genre mix chart, BPM histogram with mean marker, top artists per window (tabbed or side by side), a coverage panel with plain-language explanation of what's missing and why.
- Shown automatically when a run completes, and available on reload from persisted data.
- Empty and low-data states (for example, fewer than 10 tracks with BPM: show the numbers but flag that the sample is small).
- Components: `GenreMixChart`, `BpmHistogram`, `TopArtistsByWindow`, `CoverageSummary`.

## Out of scope
- LLM-derived anything (07).
- Popularity / mainstreamness metrics (future work).
- Cross-user comparison.

## Acceptance criteria
- [ ] Every aggregate is computed by a pure function with unit tests covering empty input, missing values, ties and a typical fixture.
- [ ] Tracks with missing BPM are excluded from BPM stats (not treated as 0), and the sample size is displayed next to the stat.
- [ ] Genre/tag mix uses only stored enrichment data and each tag can be traced to its source.
- [ ] Top artists are shown for all three windows and match the persisted `top_items`.
- [ ] The coverage panel's percentages match the database for a real account (manual check recorded in the PR).
- [ ] The dashboard renders from persisted data on reload without re-running ingestion.
- [ ] Charts are readable at mobile widths and have text alternatives (a table or `aria-label` summary).
- [ ] Loading, empty and error states exist for the dashboard.

## Technical notes
- Use a lightweight chart approach (inline SVG or a small library). Don't pull in a heavy dependency for two charts.
- Tag noise: MusicBrainz tags can include junk like "seen live". Keep a small, documented ignore-list and apply vote-count thresholds in one place.
- Compute server-side so the client gets small payloads, and so 07 can call the same code.

## Dependencies
04 for enrichment data; 05 for the shared page shell and data hooks.

## Open questions
- How many genre buckets before "other"? Start at 8.
- Do we normalise tags into a small vocabulary (for example, merge "hip hop" / "hip-hop" / "rap")? Start with simple normalisation and a short alias map, and log unmapped tags.
