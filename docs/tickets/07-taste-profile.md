# 07: Taste profile (signals + LLM)

**Size:** L · **Depends on:** 06

## Summary / goal
This is the main AI feature. Deterministic code computes a set of taste signals from the user's real data, and an LLM interprets those signals into a taste profile: a persona name, two or three insight lines that each cite the statistic they rely on, and trait scores. The LLM does no arithmetic and sees no metadata it wasn't given.

## Context
The brief calls the AI insight "the heart of the exercise" and asks us to show our thinking. The design choice here is the split: numbers come from code, so they are correct and testable, and the model's job is narrative interpretation constrained by those numbers. Output is schema-validated JSON, so we can verify that every claim points at a real signal.

Signals available at this stage are limited by what Spotify and our enrichment sources provide (no audio features, no reliable popularity), so the profile is built on what we can ground.

## In scope
- `lib/signals`: builds on `lib/aggregates` (06) to produce a typed `TasteSignals` object:
  - genre/tag mix (top tags with shares) and genre diversity (for example normalised Shannon entropy),
  - BPM mean, median and spread, with sample size,
  - enrichment coverage (so the model and UI know how much to trust each signal),
  - consistency between short/medium/long-term windows (overlap of top artists and tracks, drift in tag mix),
  - artist concentration and repeat rate (share of plays/top items from the top few artists),
  - recency mix: share of tracks released in recent years vs older (from Spotify release dates),
  - explicit-content share.
  Each signal has a stable key (for example `bpm.mean`) and a value, so the model can cite it.
- A `TasteProfile` output schema (zod): `persona_name`, `tagline`, `insights[]` (2-3 items, each `{text, cites: signalKey[]}`), `traits[]` (name, score 0-100, `cites`), and `caveats[]` where signals are weak.
- Prompt design: system prompt that states the rules (use only the supplied signals, cite keys, don't invent artists/genres/numbers, acknowledge low coverage), plus the signals as structured JSON input.
- Use the AI SDK's structured output (`generateObject` or equivalent) with the schema, via an AI Gateway or provider key configured by env.
- Post-validation: every cited key exists in the signals; any number quoted in an insight must match the cited signal (simple check on formatted values); traits within range; otherwise retry (bounded), then fail with a clear error.
- `POST /api/taste-profile`: computes signals, calls the model, validates, stores the result with the signals snapshot and prompt version (table `taste_profiles`), returns it. Cached per run so reloads don't re-bill.
- Fixtures and an evaluation test: a few signal fixtures (high BPM / narrow genres, low coverage, very diverse) with assertions on schema validity, citation validity and that low-coverage input produces a caveat. Model calls stubbed in unit tests; one optional live eval script run manually.

## Out of scope
- UI (08).
- McDonald's anything (09-11).
- Web search, Discogs and popularity metrics (future work).
- Fine-tuning or embeddings.

## Acceptance criteria
- [ ] `lib/signals` is pure and unit tested, including empty and low-coverage cases, and produces the same output for the same input.
- [ ] The model receives only structured signals, never raw Spotify payloads, and the prompt version is stored with each profile.
- [ ] Output always parses against the schema or the endpoint returns a typed error after bounded retries.
- [ ] Every `cites` key in a stored profile exists in the signals snapshot (enforced in code and tested).
- [ ] A quoted statistic that disagrees with its cited signal causes a validation failure and retry (tested with a deliberately wrong stub).
- [ ] With low enrichment coverage, the profile includes a caveat and does not make claims about the missing signal (checked in the eval fixtures).
- [ ] The profile is cached per run and a repeat call doesn't hit the model.
- [ ] Token usage, latency and retry count are logged per call.
- [ ] API keys are env-only and listed in `.env.example`.

## Technical notes
- Keep prompt text in its own versioned module so changes are diffable and the README can describe it.
- Set a low temperature; a profile for the same signals should be recognisably the same.
- Round numbers before sending to the model and format them the same way the validator expects.
- Consider returning insights as a discriminated structure (`claim`, `evidence`) rather than free prose, so the UI can show the stat next to the sentence.

## Dependencies
06 (aggregates). Needs an LLM provider key or gateway access.

## Open questions
- Which model and provider? Pick on cost and structured-output reliability, and make it one env var.
- How many traits, and are they fixed (for example "energy", "variety", "loyalty", "nostalgia") or model-chosen? Leaning fixed names with model-chosen scores, so the UI can chart them consistently.
- Are scores 0-100 derived by code from signals, with the model only explaining? Leaning yes where a clean mapping exists, to keep the model off the maths.
