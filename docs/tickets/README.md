# SpotDonalds: ticket plan

Take-home: "MySubscriptions: A Connected Services Dashboard with AI Insights". Due Fri 20 Nov 2026. The brief expects roughly 4-8 hours of work, so the plan below has an explicit cut line.

## What we're building

Spotify is the only connected service. The user signs in with Spotify, we pull their recent plays and top tracks/artists, enrich them with grounded metadata (MusicBrainz, Deezer), and compute taste signals in plain code. An LLM turns those signals into a **taste profile** (the main AI feature). As a fun extra layer, a second LLM step picks a McDonald's Australia order to match the profile, constrained by a rules config and the real menu, and justifies every item.

Principles:
- The LLM never guesses metadata and never does arithmetic. Missing data stays blank and is shown as missing.
- Every enriched field carries its value, source, source URL and confidence.
- LLM output is JSON, schema-validated, and checked server-side before anything is shown.
- Each ticket owns its own error handling, logging and tests. There are no separate "tests" or "hardening" tickets.
- Reviewers use their own allowlisted Spotify accounts. Everyone signs in with their own data.

## Tickets

| ID | Title | Depends on | Size |
| --- | --- | --- | --- |
| [01](01-foundations.md) | Foundations | none | M |
| [02](02-authentication.md) | Authentication and login UI | 01 | M |
| [03](03-base-ingestion.md) | Base Spotify ingestion and streaming | 01, 02 | M |
| [04](04-enrichment.md) | Enrichment (MusicBrainz + Deezer) | 03 | L |
| [05](05-live-ingestion-ui.md) | Live ingestion UI | 03 (04 for enrichment states) | M |
| [06](06-aggregate-dashboard.md) | Aggregate dashboard | 04 (05 for page shell) | M |
| [07](07-taste-profile.md) | Taste profile (signals + LLM) | 06 | L |
| [08](08-taste-profile-ui.md) | Taste profile UI | 07, 06 | M |
| [09](09-menu-data.md) | McDonald's menu data | 01 | S |
| [10](10-order-generation.md) | Order generation (LLM + rules + validation) | 07, 09 | L |
| [11](11-order-ui.md) | Order UI | 10, 08 | S |
| [12](12-submission.md) | Submission | all | M |

Sizes are rough: S under 1 hour, M 1-2 hours, L 2-3 hours. They add up to more than the brief's 4-8 hours, which is deliberate: see the cut line.

## Suggested build order

1. **01 Foundations**, then **02 Authentication**. Get a deployed app with working Spotify sign-in as early as possible, because the Spotify dev-mode quirks (allowlist, token handling) are the biggest unknowns.
2. **03 Base ingestion** and, in parallel whenever convenient, **09 Menu data** (it only needs the app skeleton).
3. **04 Enrichment**, then **05 Live ingestion UI**.
4. **06 Aggregate dashboard** (its pure aggregation module is the base for 07's signals).
5. **07 Taste profile**, then **08 Taste profile UI**. This is the heart of the submission, so it gets protected time.
6. **10 Order generation**, then **11 Order UI**.
7. **12 Submission**, reserving time at the end for the README and a clean-up pass.

## Cut line

If time runs short, in this order of priority:
- **Must have:** 01, 02, 03, 04 (MusicBrainz only is acceptable), 05, 06 (a reduced version is fine, but the aggregation module is needed by 07), 07, 08, 12.
- **Should have:** 04 Deezer BPM, the full 06 charts.
- **Fun extra, drop first:** 09, 10, 11. If dropped, the order feature moves to the README's future work.

## Future work (collected here, goes into the README in 12)

- Discogs as a third enrichment source.
- Search-grounded gap-fill for metadata no structured source has (with citations, never LLM recall).
- More taste-profile metrics, starting with popularity and how mainstream the listening is.
- Drawn or generated images of the order.
- Backfill longer listening history from Spotify's privacy data export (extended streaming history).
- Menu prices (not published nationally, they vary by store).

## Known unknowns to resolve early

- Whether `external_ids.isrc` is still returned for dev-mode Spotify apps. Tickets 03 and 04 assume yes, with a fallback to artist + title matching.
- The real depth of `recently-played` for an account (documented as up to 50 per call; in practice history is shallow).
- Which Spotify endpoints a new dev-mode app can still call.
