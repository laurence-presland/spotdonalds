# 10: Order generation (LLM + rules + validation)

**Size:** L · **Depends on:** 07, 09

## Summary / goal
A backend LLM step that decides what the user should order from McDonald's Australia based on their taste profile, using a small set of deliberately vague rules and a structured candidate menu. The model must return JSON, and we validate every pick on the server before anything reaches the UI. This is the fun layer on top of the taste profile, and its output is the hero of the Results screen (13).

## Context
The interesting part is making a playful idea trustworthy: the model reasons inside hard limits. It is given structured inputs only (profile, signals, rules, candidate items) and has to justify each item by pointing at a rule and a statistic. Rules are intentionally loose so the model has room to interpret, for example "higher average BPM means more calories needed". Code decides the budget; the model chooses and explains.

This is the last stage of the analysis pipeline (ingest → enrich → profile → order). It runs automatically once the taste profile is stored. As well as per-item justifications, the model writes a short "how we decided your order" explanation, grounded in the same rules and stats, for the Results screen.

## In scope
- Versioned rules config (`config/order-rules.v1.json`), each rule with `id`, plain-language description, the signal key it reads, and its effect. Rules v1:
  - `bpm-calories`: higher BPM means more calories. Code maps `bpm.mean` to the calorie budget `{min, max}`; faster listening gets a bigger budget.
  - `energy-protein`: high energy means beef, low energy or mellow means chicken. Code reads the `energy` trait (07) and sets the main's protein: above an upper threshold the main must be beef, below a lower threshold it must be chicken, and in between either is allowed. The protein comes from the internal menu data (09), and the validator checks it.
  - `popularity-spend`: the more popular the genre mix, the more popular the user, so the more they can spend. Popularity comes from the model's general knowledge of the genres (see the popularity step below), and code turns it into an AUD spend budget `{min, max}`. The validator checks the code-computed AUD total against it.
  - `genre-variety`: a narrow genre mix leans towards "comfort" picks, a diverse mix towards variety across categories.
  - `repeat-category`: high artist concentration (lots of repeats) favours repeating a category (for example two of the same style).
  - `coverage-budget`: low enrichment coverage may widen the budget in code, and must not be mentioned in any user-facing sentence.
- A genre popularity step before the order call. No source we use gives genre popularity, so this step relies on the model's general knowledge, and the README says so. A small structured call gets only `tags.top` and returns `popularity_tier` (one of `niche`, `mid`, `mainstream`) plus a one-line `reason`. It doesn't return a number or a price. Code maps the tier to the spend budget, using values in the rules config. The tier and reason are stored with the order and can be cited in `how_we_decided` as `genre.popularity_tier`. For the same tags it's cached, and run at temperature 0, so it stays the same.
- **Our rules are sacred; the model is also creative.** The rules in `config/order-rules.v1.json` (and the budgets and constraints code derives from them) are hard limits: the model must follow every one, can't override or reinterpret them, and the validator rejects any order that breaks one. Inside those limits the model is actively encouraged to use its general knowledge and make internal determinations (for example "drum and bass feels like something fizzy", "folk is a slow-cooked kind of genre"), and to invent its own extra rules for fun.
  - Invented rules are returned in the output as `invented_rules[] {id, description, basis}`: 0-3 rules, each `id` prefixed `x-` so it can't collide with ours, `description` is one playful plain-language line, and `basis` is the signal keys it reads (can be empty when it's pure general knowledge).
  - An invented rule may only narrow or flavour choices within the sacred rules, never loosen them. If it conflicts, ours wins and the validator still applies.
  - Item `rule_ids` and `how_we_decided` may cite both our rule ids and the order's own `x-` ids.
  - The prompt says this explicitly: follow every given rule exactly, then be creative: bring general knowledge and invent up to three fun rules of your own that work within them.
- A deterministic budget step in code: from signals, traits, the popularity tier and rules, compute `calorie_budget {min, max}`, `spend_budget_aud {min, max}`, the required main protein (if any) and any category constraints (for example max drinks, at most one dessert). The model is told the budgets and constraints; it does not compute them.
- Input assembly: taste profile, signals snapshot, rules (with the budget results), and the candidate set from 09, as compact structured JSON (item id, name, category, kcal, kJ, protein, `tag_ids`). Items carry tags from the same single list the model uses on order lines (09), so it sees, for example, a McFlurry tagged `sweet` and `indulgent` and can use those words on the receipt. The prompt has a vocabulary block listing every tag (id, label, "use when" description), every rule (id and description), every signal the order may cite (key, meaning, unit from the 07 registry) and the menu categories.
- Output schema (zod): `items[] {item_id, quantity, justification, tag_ids[], rule_ids[], cites[]}`, `invented_rules[]`, `summary` (one or two playful lines), `confidence_note`, and `how_we_decided` (a short, user-facing explanation of how the system arrived at this order, citing rule ids and signal keys). `how_we_decided` is distinct from the per-item justifications and from `summary`.
- Item tags come only from `data/order-tags.json`, the app's one tag list (shared with the menu items in 09). Each `tag_ids` entry must be an id in that file. The model is given the list and does not invent labels. The why sentence can still explain the pick; the tags on the line are this closed set.
- Closed sets are enforced in the output schema, not only in the prompt: the zod schema is built at runtime from the data, so `item_id` can only be a candidate-set id, `tag_ids` only ids in `data/order-tags.json`, `rule_ids` only ids in the rules config or the order's own `x-` ids, and `cites` only registry signal keys. An off-list value fails the schema before our own validation runs.
- No maths in the model: code computes the calorie budget, the order's total kcal and the AUD total. The model does not report totals.
- Prompt in its own versioned module, instructing the model to choose only from supplied ids, respect the budget, cite rules and signals, write `how_we_decided` in plain language grounded only in those citations, and be playful without making health claims.
- Server-side validation and retry: every `item_id` exists in the menu and in the candidate set, quantities are integers within limits, recomputed total kcal is inside the calorie budget, the code-computed AUD total is inside the spend budget, the main's protein matches the `energy-protein` rule, category constraints hold, every `tag_ids` entry exists in `data/order-tags.json`, every `rule_ids` entry is one of our rule ids or an `x-` id defined in this order's `invented_rules`, every `cites` key exists (including on `how_we_decided` and `invented_rules`), any number quoted in `how_we_decided` or a justification matches the cited signal, and no pick has missing nutrition. On failure, retry with the specific errors fed back (bounded, for example 2 retries), then return a typed error.
- `POST /api/order`: builds inputs, calls the model, validates, stores the result (table `orders`) with the inputs snapshot and versions, and returns it. Cached per profile. Emit a `stage` event and update the run record when this stage starts; on success, set `stage` to `done`.
- Fixtures and tests: signal fixtures for a high-BPM, low-BPM and low-coverage user; a stubbed model returning valid output, an invented menu id, a blown calorie budget, a `how_we_decided` that quotes a wrong number or cites a missing key, and malformed JSON, all asserting the validator's behaviour.

## Out of scope
- UI (11) and screen flow (13).
- Choosing or inventing prices. The model does not set a price. The receipt looks up each item's AUD price and sums it.
- Real ordering, deep links or any McDonald's integration.
- Drawn images of the order (future work).
- Health or dietary advice.

## Acceptance criteria
- [ ] An order with invented rules still passes every sacred-rule check, invented ids all start with `x-`, there are at most three, and a `rule_ids` entry pointing at an undefined `x-` id is rejected (tested).
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
- [ ] A high-energy fixture whose main isn't beef, or a low-energy fixture whose main isn't chicken, is rejected and retried (tested).
- [ ] The popularity step returns only a tier from the fixed set and a reason, never a price. Code maps the tier to the spend budget (unit tested per tier), and an order whose AUD total falls outside the spend budget is rejected and retried (tested).
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
- A slightly higher temperature than the profile step is fine here, so the invented rules vary; the sacred-rule validator keeps it safe.
- If time is short, simplify here: fewer rules, a smaller candidate set. Don't drop the feature; the order is the hero of Results.

## Dependencies
07 (profile and signals), 09 (menu loader and candidate set). Needs the same LLM provider setup as 07.

## Open questions
- How many items is a sensible order (for example a main, a side, a drink, optionally a dessert)? Leaning on category constraints in the rules rather than a hard count.
- Should the order cover one person or "a meal for the playlist"? Leaning one person.
- Threshold values for `energy-protein`, and the AUD range for each popularity tier. Make them config values.
- What if the candidate set has no beef or chicken main that fits the budgets? Leaning on relaxing the spend budget first, then allowing either protein, and logging it.
- What is the baseline calorie budget? Pick a documented number (for example a reference adult meal) and make it a config value, not a health claim.
