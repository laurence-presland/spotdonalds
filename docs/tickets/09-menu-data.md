# 09: McDonald's menu data

**Size:** S · **Depends on:** 01

## Summary / goal
Make the structured McDonald's Australia menu a first-class, typed, validated part of the app, and document its gaps and how to refresh it. The data has already been collected and lives in `data/menu/`.

## Context
The order feature (10) must choose from real items with real nutrition. The dataset in `data/menu/menu.json` was gathered on 13 Nov 2026 from McDonald's Australia's public product pages and official nutrition PDFs, because there is no public menu feed. It has 327 current items, each with category, description and (for about 90%) kJ, kcal, protein, fat, saturated fat, carbs, sugars and sodium. See `data/menu/SOURCES.md` for provenance, the robots.txt/terms review, and gaps.

The menu is drink-heavy (112 McCafé drinks plus 52 cold/frozen drinks and 20 shakes/frappes), so selection needs care downstream.

## In scope
- Generate TypeScript types from `data/menu/menu.schema.json` (or hand-write matching types with a test that fails on drift).
- A loader module (`lib/menu`) that reads, validates (Ajv or zod) and exposes the menu with helpers: get by id, filter by category/tags, items with complete nutrition, and a stable "candidate set" function used by 10.
- A candidate-set policy: exclude items without nutrition, cap drinks (for example at most N drinks, preferring a spread of categories and sizes), and exclude condiments from being main picks. The policy is data in one file, with a test.
- A validation test run in CI: the committed `menu.json` conforms to the schema, ids are unique, and energy values are plausible (kcal roughly consistent with kJ, within tolerance).
- A refresh script (`scripts/refresh-menu`) plan: either commit a reproducible script that rebuilds the menu from the product pages, or document clearly that the file is a point-in-time snapshot and how it was produced. Pick one and document in `data/menu/SOURCES.md`. A snapshot with honest docs is acceptable for the take-home.
- Surface `retrieved_at` and the source attribution wherever menu items are shown (data for 11).

## Out of scope
- Prices (not published nationally; future work).
- Exploding milk alternatives into separate items (documented gap).
- Any LLM use (10).
- Re-scraping the site as part of this ticket unless the refresh script is chosen.

## Acceptance criteria
- [ ] `data/menu/menu.json` validates against `data/menu/menu.schema.json` in CI.
- [ ] Types for menu items exist and the loader returns typed, validated data; invalid data fails loudly at startup/test, not silently.
- [ ] Item ids are unique, and a test asserts the item count and the share of items with nutrition against the committed file's metadata.
- [ ] The candidate-set function never returns items without nutrition, caps drinks, and is deterministic for the same input (tested).
- [ ] `data/menu/SOURCES.md` documents the known gaps (no prices, ~31 items without nutrition tables, milk alternatives, withdrawn limited-time items) and the retrieval date.
- [ ] The refresh approach (script or documented snapshot) is written down and linked from the main README.

## Technical notes
- `energy_kcal` is the published figure, never derived from kJ in this dataset; keep that invariant if the refresh script is built.
- Tags in the file are inferred from name, slug and category only. No item is asserted to be vegetarian or halal, following McDonald's own disclaimer. Don't present tags as dietary guarantees in the UI.
- The product pages and the nutrition PDFs are the official sources; the `/dnaapp/` endpoint is disallowed by robots.txt and must not be used.
- Data is for a personal, non-commercial take-home, attributed to McDonald's Australia's published information.

## Dependencies
01 (app skeleton and CI). The data files already exist.

## Open questions
- Snapshot vs reproducible refresh script? Leaning snapshot, with the refresh script listed as future work unless time allows.
- Should size variants (for example medium vs large fries) be separate candidates? They are separate items in the data today; the candidate policy should probably keep one size per product by default.
