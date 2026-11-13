# 07: Taste profile (signals + LLM)

**Size:** L · **Depends on:** 06

## Summary / goal
This is the main AI feature. Deterministic code computes a set of taste signals from the user's real data, and an LLM interprets those signals into a taste profile: a persona name, two or three insight lines that each cite the statistic they rely on, and trait scores. The LLM does no arithmetic and sees no metadata it wasn't given.

## Context
The brief calls the AI insight "the heart of the exercise" and asks us to show our thinking. The design choice here is the split: numbers come from code, so they are correct and testable, and the model's job is narrative interpretation constrained by those numbers. Output is schema-validated JSON, so we can verify that every claim points at a real signal.

Signals available at this stage are limited by what Spotify and our enrichment sources provide (no audio features, no reliable popularity), so the profile is built on what we can ground.

This is the third stage of the analysis pipeline (ingest → enrich → profile → order). It runs automatically once enrichment is complete; the user stays on the Analysing screen until the later stages finish (13). The McDonald's order (10) reads this profile. The profile UI lives on the Results screen, not as a page of its own (08, 13).

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
- A signal registry (`lib/signals/registry.ts`), the single documented list of every signal. Each entry has `key`, `label` (for UI chips), `meaning` (one plain sentence), `unit`, `decimals` (rounding used for the prompt and the validator), and `mention` (`true`, or `false` for internal signals such as coverage that the model may use but must never mention). Starting set:
  | Key | Meaning | Unit |
  |---|---|---|
  | `tags.top` | Top tags with their share of tagged tracks | list of `{tag, share}` |
  | `tags.diversity` | How spread the tag mix is (normalised Shannon entropy) | 0-1 |
  | `bpm.mean` / `bpm.median` / `bpm.spread` | Average, middle and standard deviation of tempo | BPM |
  | `bpm.sample_size` | Tracks with a known tempo | count |
  | `consistency.artist_overlap` | Share of top artists shared between the 4-week and 1-year windows | 0-1 |
  | `consistency.track_overlap` | Same, for top tracks | 0-1 |
  | `consistency.tag_drift` | How far the tag mix moves between the 4-week and 1-year windows | 0-1 |
  | `concentration.top_artists_share` | Share of plays and top items from the top 3 artists | 0-1 |
  | `repeat.rate` | Share of recent plays that are repeats | 0-1 |
  | `recency.recent_share` | Share of tracks released in the last 5 years | 0-1 |
  | `recency.median_release_year` | Middle release year | year |
  | `explicit.share` | Share of tracks marked explicit | 0-1 |
  | `coverage.tags` / `coverage.bpm` | Share of tracks enriched with tags / tempo (`mention: false`) | 0-1 |
  Adding or renaming a signal means editing the registry; nothing else holds signal keys.
- Fixed traits, scored by code: `energy`, `variety`, `loyalty`, `nostalgia`. Each is a documented, unit-tested function of registry signals that returns 0-100 (for example `energy` from `bpm.mean`, `variety` from `tags.diversity`, `loyalty` from `concentration.top_artists_share` and `repeat.rate`, `nostalgia` from `recency.recent_share`). The traits list, with each trait's formula and source keys, lives next to the registry. The model never produces a number.
- Closed sets are enforced in the output schema, not only in the prompt: the zod schema is built from the registry and the trait list, so `cites` entries can only be registry keys and trait names can only be the four above. An off-list value fails the schema before our own validation runs.
- A `TasteProfile` output schema (zod): `persona_name`, `tagline`, `insights[]` (2-3 items, each `{text, cites: signalKey[]}`), `traits[]` (exactly the four fixed names, each `{name, explanation, cites}`, with no score), and `caveats[]` where signals are weak. The stored profile merges in the code-computed trait scores.
- Prompt design: system prompt that states the rules (use only the supplied signals, cite keys, don't invent artists/genres/numbers, don't do arithmetic or produce scores, and never mention missing data, coverage, unlabeled tracks, or a smaller sample in persona, tagline, or insights), plus a vocabulary block and the input as structured JSON. The vocabulary block lists every signal as key, meaning and unit from the registry, and every trait with its meaning and code-computed score, so the model knows exactly what each option means.
- Use the AI SDK's structured output (`generateObject` or equivalent) with the schema, via an AI Gateway or provider key configured by env.
- Post-validation (a backstop to the schema): every cited key exists in this run's signals snapshot; any number quoted in an insight or trait explanation must match the cited signal (simple check on values formatted with the registry's `decimals`); no `mention: false` signal is quoted; otherwise retry (bounded), then fail with a clear error.
- `POST /api/taste-profile`: computes signals, calls the model, validates, stores the result with the signals snapshot and prompt version (table `taste_profiles`), returns it. Cached per run so reloads don't re-bill. Emit a `stage` event and update the run record when this stage starts and when it finishes.
- Fixtures and an evaluation test: a few signal fixtures (high BPM / narrow genres, low coverage, very diverse) with assertions on schema validity, citation validity and that low-coverage input produces a caveat. Model calls stubbed in unit tests; one optional live eval script run manually.

## Out of scope
- UI (08) and screen flow (13).
- McDonald's anything (09-11).
- Web search, Discogs and popularity metrics (future work).
- Fine-tuning or embeddings.

## Acceptance criteria
- [ ] `lib/signals` is pure and unit tested, including empty and low-coverage cases, and produces the same output for the same input.
- [ ] Every signal key used anywhere (computation, prompt, schema, UI chips) comes from the registry, and each entry has a meaning, unit and rounding (tested).
- [ ] Trait scores are computed by code from registry signals, unit tested per trait, and the model's output contains no scores or other numbers it calculated.
- [ ] The output schema rejects a `cites` key not in the registry and a trait name not in the fixed four (tested).
- [ ] The model receives only structured signals, never raw Spotify payloads, and the prompt version is stored with each profile.
- [ ] Output always parses against the schema or the endpoint returns a typed error after bounded retries.
- [ ] Every `cites` key in a stored profile exists in the signals snapshot (enforced in code and tested).
- [ ] A quoted statistic that disagrees with its cited signal causes a validation failure and retry (tested with a deliberately wrong stub).
- [ ] With low enrichment coverage, persona, tagline, and insights do not mention the gap, and they do not make claims about a signal that was not supplied (checked in the eval fixtures).
- [ ] The profile is cached per run and a repeat call doesn't hit the model.
- [ ] The run record's `stage` reflects this stage while the endpoint is working, and is updated when it finishes.
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
- Exact trait formulas and thresholds (the traits themselves are decided: four fixed, scored by code).
- The `late-night` line tag has no signal behind it yet. Add a listening-hour signal from recently-played timestamps (only the last 50 plays), or drop the tag?
