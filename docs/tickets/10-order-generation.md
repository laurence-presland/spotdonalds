# 10: Order generation (LLM + rules + validation)

**Size:** L · **Depends on:** 07, 09

## Summary / goal
A backend LLM step that decides what the user should order from McDonald's Australia based on their taste profile, using a small set of deliberately vague rules and a structured candidate menu. The model must return JSON, and we validate every pick on the server before anything reaches the UI. This is the fun layer on top of the taste profile, and its output is the hero of the Results screen (13).

## Context
The interesting part is making a playful idea trustworthy: the model reasons inside hard limits. It is given structured inputs only (profile, signals, rules, candidate items) and has to justify each item by pointing at a rule and a statistic. Rules are intentionally loose so the model has room to interpret, for example "higher average BPM means more calories needed". Code decides the budget; the model chooses and explains.

This is the last stage of the analysis pipeline (ingest → enrich → profile → order). It runs automatically once the taste profile is stored. As well as per-item justifications, the model writes a short "how we decided your order" explanation, grounded in the same rules and stats, for the Results screen.

## In scope
- Versioned rules config (`config/order-rules.v1.json`), each rule with `id`, plain-language description, the signal key it reads, and its effect. Examples:
  - higher average BPM raises the calorie budget,
  - a narrow genre mix leans towards "comfort" picks, a diverse mix towards variety across categories,
  - high artist concentration (lots of repeats) favours repeating a category (for example two of the same style),
  - low enrichment coverage may widen the budget in code, and must not be mentioned in any user-facing sentence.
- A deterministic budget step in code: from signals and rules, compute `calorie_budget {min, max}` and any category constraints (for example max drinks, at most one dessert). The model is told the budget; it does not compute it.
- Input assembly: taste profile, signals snapshot, rules (with the budget results), and the candidate set from 09, as compact structured JSON (item id, name, category, kcal, kJ, protein, `tag_ids`). Items carry tags from the same single list the model uses on order lines (09), so it sees, for example, a McFlurry tagged `sweet` and `indulgent` and can use those words on the receipt. The prompt has a vocabulary block listing every tag (id, label, "use when" description), every rule (id and description), every signal the order may cite (key, meaning, unit from the 07 registry) and the menu categories.
- Output schema (zod): `items[] {item_id, quantity, justification, tag_ids[], rule_ids[], cites[]}`, `summary` (one or two playful lines), `confidence_note`, and `how_we_decided` (a short, user-facing explanation of how the system arrived at this order, citing rule ids and signal keys). `how_we_decided` is distinct from the per-item justifications and from `summary`.
- Item tags come only from `data/order-tags.json`, the app's one tag list (shared with the menu items in 09). Each `tag_ids` entry must be an id in that file. The model is given the list and does not invent labels. The why sentence can still explain the pick; the tags on the line are this closed set.
- Closed sets are enforced in the output schema, not only in the prompt: the zod schema is built at runtime from the data, so `item_id` can only be a candidate-set id, `tag_ids` only ids in `data/order-tags.json`, `rule_ids` only ids in the rules config, and `cites` only registry signal keys. An off-list value fails the schema before our own validation runs.
- No maths in the model: code computes the calorie budget, the order's total kcal and the AUD total. The model does not report totals.
- Prompt in its own versioned module, instructing the model to choose only from supplied ids, respect the budget, cite rules and signals, write `how_we_decided` in plain language grounded only in those citations, and be playful without making health claims.
- Server-side validation and retry: every `item_id` exists in the menu and in the candidate set, quantities are integers within limits, recomputed total kcal is inside the budget, category constraints hold, every `tag_ids` entry exists in `data/order-tags.json`, every `rule_ids` entry and `cites` key exists (including on `how_we_decided`), any number quoted in `how_we_decided` or a justification matches the cited signal, and no pick has missing nutrition. On failure, retry with the specific errors fed back (bounded, for example 2 retries), then return a typed error.
- `POST /api/order`: builds inputs, calls the model, validates, stores the result (table `orders`) with the inputs snapshot and versions, and returns it. Cached per profile. Emit a `stage` event and update the run record when this stage starts; on success, set `stage` to `done`.
- Fixtures and tests: signal fixtures for a high-BPM, low-BPM and low-coverage user; a stubbed model returning valid output, an invented menu id, a blown calorie budget, a `how_we_decided` that quotes a wrong number or cites a missing key, and malformed JSON, all asserting the validator's behaviour.

## Out of scope
- UI (11) and screen flow (13).
- Choosing or inventing prices. The model does not set a price. The receipt looks up each item's AUD price and sums it.
- Real ordering, deep links or any McDonald's integration.
- Drawn images of the order (future work).
- Health or dietary advice.

## Acceptance criteria
- [ ] The output schema rejects an item id, tag id, rule id or signal key that isn't in its source list (tested).
- [ ] Total kcal and price are computed by code from the menu, never taken from model output.
- [ ] The model is only ever given structured inputs and the candidate set, never the full menu description text.
- [ ] A response containing an id not in the menu is rejected and retried (tested).
- [ ] A response whose recomputed calories fall outside the budget is rejected and retried (tested).
- [ ] After bounded retries, the endpoint returns a typed error and no order is stored.
- [ ] Every stored justification, and `how_we_decided`, references at least one valid rule id and one valid signal key.
- [ ] Every item tag id exists in `data/order-tags.json`. An invented tag is rejected and retried (tested).
- [ ] A `how_we_decided` (or justification) that quotes a statistic disagreeing with its cited signal is rejected and retried (tested with a deliberately wrong stub).
- [ ] The calorie budget is computed by code with unit tests covering each rule, and the same inputs give the same budget.
- [ ] The result stores rules version, prompt version, menu `retrieved_at` and the inputs snapshot.
- [ ] A cached order is returned on repeat calls without a model call.
- [ ] The run record's `stage` reflects this stage while the endpoint is working, and is `done` when a valid order is stored.
- [ ] Token usage, latency, retry count and validation failures are logged.
- [ ] A low-coverage fixture produces an order whose summary, justifications, and `how_we_decided` do not mention missing data, coverage, unlabeled tracks, or uncertainty from incomplete enrichment (tested).

## Technical notes
- Candidate set from 09 keeps the prompt small (cap drinks, drop items without nutrition). Aim for a few dozen items rather than all 327.
- Use structured output with the zod schema, but still validate afterwards; the schema guarantees shape, not truth.
- Feed validator errors back verbatim on retry; they're usually enough for the model to self-correct.
- Keep the vague rules actually vague in the config text. The point is to show the model reasoning, not a lookup table.
- If time is short, simplify here: fewer rules, a smaller candidate set. Don't drop the feature; the order is the hero of Results.

## Dependencies
07 (profile and signals), 09 (menu loader and candidate set). Needs the same LLM provider setup as 07.

## Open questions
- How many items is a sensible order (for example a main, a side, a drink, optionally a dessert)? Leaning on category constraints in the rules rather than a hard count.
- Should the order cover one person or "a meal for the playlist"? Leaning one person.
- What is the baseline calorie budget? Pick a documented number (for example a reference adult meal) and make it a config value, not a health claim.
