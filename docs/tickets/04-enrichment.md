# 04: Enrichment (MusicBrainz + Deezer)

**Size:** L · **Depends on:** 03

## Summary / goal
For each ingested track, look up the metadata Spotify no longer gives us (genre/tags, BPM, and a little more) from real databases, record exactly where every value came from, cache it, and stream progress to the client. The LLM plays no part here.

## Context
This is the slowest stage, which is why it streams and persists as it goes. It is the second stage of the analysis pipeline (ingest → enrich → profile → order), and the analysing screen (05) stays up through it. Sources, in order:
1. **MusicBrainz** by ISRC: `GET https://musicbrainz.org/ws/2/isrc/{ISRC}?inc=tags+artist-credits&fmt=json`. Rate limit is 1 request per second and a meaningful `User-Agent` (app name, version, contact) is required. Tags are community data under CC BY-NC-SA, so attribution is needed in the UI and README.
2. **Deezer** by ISRC: `GET https://api.deezer.com/track/isrc:{ISRC}` for `bpm` (0 means unknown, treat as missing) and `gain`, plus a preview URL and other useful fields if present.

Discogs and web-search gap-fill are explicitly out of scope and listed as future work. If neither source matches the track, or the lookup errors, drop the track. It is not stored as a row, not shown on the analysing list, and not passed to taste or order. Never fill a gap with model recall. A track that did match can still have a blank field (Deezer `bpm` of 0 stays blank) and is kept.

## In scope
- Provider interface (`lookup(track) -> EnrichmentResult`) with MusicBrainz and Deezer implementations, so Discogs can be added later without touching callers.
- A field-level provenance model: for each enriched field, store `value`, `source`, `source_url`, `confidence`, `fetched_at`. A field may have multiple candidate values from different sources; define how the "chosen" value is picked (for example: tags from MusicBrainz, BPM from Deezer) and keep that rule in one place.
- Confidence scoring that is simple and explainable (for example: ISRC exact match = high; artist+title fallback match = lower), documented in code.
- ISRC-first matching, with a fallback to artist + title search when the ISRC is missing or unmatched, flagged as lower confidence.
- Global rate limiter honouring MusicBrainz's 1 req/s across concurrent invocations for the same user and run (a simple per-run queue is acceptable; note cross-user limits as a known limitation).
- Cache by ISRC (table `track_enrichment`) so a track seen before is never looked up again, across users and runs. Negative results are cached too, with a shorter TTL.
- `POST /api/enrich` (Node runtime): streams NDJSON events using the shared schema from 03 (`enrich_start`, `enrich_result`, `progress`, `done`, `error`, `stage`), processes unenriched tracks for the user's latest run, and is resumable. Emit a `stage` event and update the run record when this stage starts and when it finishes. Endpoint-level `done` means enrichment finished, not that the whole pipeline is finished.
- Retry/backoff for 429/503 from either source; failure of one source does not fail the other.

## Out of scope
- Discogs, web search or any LLM-based lookup (future work).
- Artist-level genre data from Spotify (deprecated, unreliable).
- UI (05, 06, 13).
- Popularity / mainstreamness metrics (future work).
- Starting the taste profile or order stages (07, 10, 13).

## Acceptance criteria
- [x] For a track with a valid ISRC known to MusicBrainz, tags are stored with source `musicbrainz`, a `source_url` to the recording, and a confidence value.
- [x] Deezer BPM is stored when non-zero, and `bpm = 0` is stored as missing, not as a value.
- [x] A track with no match from either source, or a failed lookup, is dropped. It is absent from stored rows and from the stream of visible tracks, with no invented values.
- [x] MusicBrainz requests never exceed 1/s and always send the configured `User-Agent` (test with a fake clock).
- [x] A second run over the same tracks makes zero external requests (cache hit), verified in a test.
- [x] Stream events arrive progressively and the endpoint can be interrupted and resumed without redoing completed tracks.
- [x] The run record's `stage` reflects enrichment while this endpoint is working, and is updated when it finishes.
- [x] One source being down (simulated 503) still yields results from the other, and the failure is recorded in the event stream and logs.
- [x] Matching and chosen-value logic have unit tests with recorded MusicBrainz and Deezer fixtures, including the ISRC-missing fallback.
- [x] The list footer can render "Data provided by Spotify, MusicBrainz, and Deezer."

## Technical notes
- At 1 req/s, 100 unique tracks take at least ~100s for MusicBrainz alone. That fits within Hobby's 300s but only just; batch work so the client can re-invoke and continue if the function hits its limit. Dedupe by ISRC first (top tracks overlap heavily with recent plays).
- MusicBrainz tags are user-submitted and noisy; keep the vote counts and let 07 decide how to weight them. Normalise tag strings (lowercase, trim) but keep the original.
- Deezer's rate limit should be checked before relying on it; treat it as unverified and keep a conservative concurrency cap.
- Keep source response snippets (jsonb) for debugging, but don't ship them to the client.

## Dependencies
03. Needs ISRCs (see open question in 03).

## Open questions
- If dev mode doesn't return ISRCs, how good is artist + title matching in practice? Decide whether it is acceptable at lower confidence or should be dropped.
- Should tags be mapped to a small genre vocabulary here or left raw until the taste profile (07)? Leaning raw here, mapping in 07.
- Deezer's actual rate limit and terms for non-commercial use (verify).
