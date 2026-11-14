# SpotDonalds — McDonald's Australia menu sources

Retrieved **13 November 2026, 18:05 AEDT** (Australia/Sydney, UTC+11).

This dataset is a structured, attributed extract of **publicly published** McDonald's Australia menu and nutrition information, built for the non-commercial SpotDonalds take-home. It is **not affiliated with McDonald's or Spotify**. Figures were not invented. Where an official source did not publish a number, the field is `null`.

## Best structured official source

McDonald's Australia does **not** publish a public first-party JSON or GraphQL menu/nutrition API that can be used for this work.

- Individual product pages under `https://www.mcdonalds.com/au/en-au/menu/...` are the best official structured source. Each live item page exposes a nutrition table (average quantity per serve and per 100 g or 100 mL) for Energy (kJ and kcal), protein, total fat, saturated fat, carbohydrate, sugars and sodium, plus a marketing description. Category pages list current items by name.
- The official sitemap `https://www.mcdonalds.com/au/en-au/sitemap.xml` enumerates those product URLs (last modified dates in the sitemap ran through **12 November 2026**).
- Official Quality Assurance PDFs, linked from the nutrition index and in some cases from the product page itself, remain the official source for some McCafé / limited-time drinks that have no inline table.

A hidden `https://www.mcdonalds.com/dnaapp/itemDetails` nutrition endpoint exists in the McDonald's platform globally, but **`/dnaapp/` is disallowed in `robots.txt`** and was **not used**.

Third-party menu or nutrition APIs (and unofficial price sites) were not used.

## Official sources used

| Source | URL | Role |
| --- | --- | --- |
| Nutrition and Allergens index | [mcdonalds.com/au/.../nutrition.html](https://www.mcdonalds.com/au/en-au/about-us/our-impact/food-sourcing/nutrition.html) | Current official PDF list, as of 13 Nov 2026 |
| AU sitemap | [sitemap.xml](https://www.mcdonalds.com/au/en-au/sitemap.xml) | Inventory of official product URLs |
| Product pages | `/au/en-au/menu/{category}/{item}.html` | Primary names, descriptions, availability notes, per-serve nutrition |
| New McCafé Beverages PDF (July 2026) | [Aus LTO Menu_Flash LAUNCH 2026.pdf](https://www.mcdonalds.com/content/dam/sites/au/nfl/nutrition/PDFs/Aus%20LTO%20Menu_Flash%20LAUNCH%202026.pdf) | Nutrition for 33 McCafé drinks whose product pages link to this PDF and have no inline table. The nutrition index labels this file “New McCafé Beverages Menu — July-26”. Information correct as at July 2026. |
| New McCafé Beverages and Desserts PDF (October 2026) | [October 2026 Launch PDF](https://www.mcdonalds.com/content/dam/sites/au/nfl/nutrition/PDFs/AUS%20New%20McCafe%20Beverages%20and%20Dessert%20-%20October%202026%20Launch.pdf) | Reviewed. Text extraction did not reliably keep labels aligned with numbers, so values were **not** copied except where a product page already had an official table. |
| McCafé milk-alternatives PDF (15 April 2026) | [April 2026 milk alternatives PDF](https://www.mcdonalds.com/content/dam/sites/au/nfl/nutrition/PDFs/Aus%20McCafe%20Beverages%20_April%202026%20(Milk%20alternatives%20only).pdf) | Reviewed. Not exploded into separate items. |
| Desserts and Condiments PDF (June 2026) | [June 2026 PDF](https://www.mcdonalds.com/content/dam/sites/au/nfl/our-impact/food-quality-sourcing/Aus%20Dessert%20and%20Condiments_Jun%202026%20(1).pdf) | Reviewed. Covers Ice Cream Birthday Cake and Honey PC; product pages were preferred where both existed. |
| Loaded Cookie trial PDF (October 2026) | [Loaded Cookie trial PDF](https://www.mcdonalds.com/content/dam/sites/au/nfl/nutrition/PDFs/AUS%20McCafe%20Dessert%20-%20Loaded%20Cookie%20-%20October%202026%20Trial-42-.pdf) | NSW & ACT trial only; not in the national sitemap as a product page. |
| Terms and Conditions | [terms-and-conditions.html](https://www.mcdonalds.com/au/en-au/terms-and-conditions.html) | Reviewed 13 Nov 2026 |
| robots.txt | [www.mcdonalds.com/robots.txt](https://www.mcdonalds.com/robots.txt) | Reviewed 13 Nov 2026 |

## Method

1. Confirmed there is no official public JSON menu feed. Direct `curl` from this environment to `mcdonalds.com` was blocked by Akamai (HTTP 403). Public pages were therefore read with WebFetch and the `r.jina.ai` reader.
2. Collected every `/au/en-au/menu/{category}/{item}.html` URL in the official sitemap (376 item URLs, plus category index pages).
3. Fetched each product page. A page was treated as a **live product** only if it rendered a product heading (not a category listing or an error). 49 sitemap URLs now fall through to a category page or a truncated/error response (typically withdrawn limited-time items). Those URLs are listed in `metadata.coverage_gaps` and were **omitted** from `items`.
4. Parsed the official per-serve / per 100 g (or 100 mL) nutrition table when present.
5. For 33 live McCafé / refresher / Red Bull product pages that have no inline table but link to the official July 2026 McCafé PDF, copied the clearly labelled serve for that name and size. Default milk is full-cream unless the product URL names another milk (for example “with oat milk”). Those items have `nutrition_source: official_nutrition_pdf` and a `nutrition_note`.
6. `energy_kcal` is the official “Energy (kcal)” or “Energy (Cal)” figure. None of the published kcal values in this file were derived from kJ. `energy_kcal_derived` is therefore `false` on every item that has energy data.
7. Official pages do not print a serving weight. `serving_size_g` is derived only when both kJ per serve and kJ per 100 g/mL are published: `(kJ_serve / kJ_per_100) × 100`, and is marked `serving_size_derived: true`. For drinks this may be a millilitre-equivalent mass proxy, not a weighed serve.
8. Tags are inferred from the official name, URL slug and category only (not from “pair it with fries” marketing copy). McDonald's states that no food items are certified as vegetarian, so this file never applies a certified-vegetarian tag.
9. `price_aud` is always `null`. McDonald's does not publish a national price list. The terms state that prices are in AUD, may vary between restaurants, are not real-time, and that McDelivery prices may be higher than pickup.

## robots.txt and terms

**robots.txt** (`User-agent: *`) allows `/` generally, including menu and nutrition pages and PDFs under `/content/dam/`. It **disallows** `/dnaapp/`, `/api/corp`, `/config/`, `/utility/`, and several other internal paths. This work stayed on allowed public menu, sitemap, nutrition-index and PDF URLs.

**Terms and Conditions** (reviewed 13 Nov 2026, AEDT):

- All material and logos on the service remain McDonald's property (clause 97).
- The service must not be used for commercial purposes (clause 98).
- Prices may change and may differ by restaurant and by ordering channel (clauses 91–93).
- Nutritional information is published to help customers make informed choices and is available on the website, in restaurants, and where practical on packaging (clause 95).
- McDonald's Quality Assurance disclaimer, repeated on nutrition PDFs and product pages: values are based on standard formulations and serving sizes and may vary; no item is certified vegetarian; only restaurant-specific certificates cover Halal.

This extract is for a personal, non-commercial take-home exercise, with attribution, and is not a substitute for the live McDonald's pages.

## Coverage

`menu.json` contains **327** live items.

| Category | Items |
| --- | ---: |
| McCafé drinks | 112 |
| Cold and frozen drinks | 52 |
| Chicken and fish | 34 |
| Breakfast | 23 |
| Desserts | 22 |
| Shakes and frappes | 20 |
| Condiments | 18 |
| Burgers (from the Beef product section) | 15 |
| Bundle meals | 10 |
| McCafé food | 9 |
| Sides | 8 |
| Happy Meal components | 4 |

Nutrition field coverage (per serve):

- Energy (kJ and kcal), protein, fat, carbohydrate, sugars, sodium: **296 / 327** items (90.5%).
- The **31** items without a parsable official table are mostly bundle/combo meals (nutrition is published on the components, not the combo) plus a small set of live product pages whose official table was empty or whose PDF figures could not be matched with enough confidence (Iced Chai Latte, some matcha builds without a clearly labelled PDF row, Red Bull Strawberries & Cream, Ham & Cheese Toastie, Coca-Cola Vanilla Large, a few sauces, and a couple of dessert/shake size pages).

The “Wraps” and “Burgers” site sections are category pages only; individual wraps and burgers are filed under `chicken_and_fish`, `breakfast` or `burgers` (Beef).

## Gaps and future work

- **Prices.** No official national AUD price list. Any price would have to come from a store-specific order flow and would still vary by restaurant and channel.
- **Main Food / Main Drinks / Happy Meal PDFs.** Older promo pages referred to a Main Food Menu PDF dated 14 January 2026. That file is **no longer linked** on the current official nutrition index, and guessed DAM paths returned 404. Core food nutrition here comes from live product pages, not from a single current QA PDF.
- **Milk alternatives.** Official PDFs list skim, lactose-free, soy, almond and oat variants of many McCafé drinks. Those are not fully exploded as separate items unless the product URL itself names the milk.
- **Regional trials.** Loaded Cookie (NSW & ACT) and WA protein-boosted milk are in official trial PDFs only.
- **Withdrawn LTOs** still in the sitemap (El Maco, Bistro Béarnaise Angus, Honey Sriracha breakfast items, Korean Sticky BBQ, Garlic Black Pepper McNuggets, chocolate soft-serve / twin-twist dessert builds, and others) no longer have live product pages and were omitted.
- **Serving weight** is not printed on product pages.
- **Vegetarian / Halal certification** is not asserted here, following McDonald's own disclaimer.

## Refresh

This is a **point-in-time snapshot**, retrieved 13 November 2026 (AEDT). The repo does not include a refresh script or the raw page captures. Rebuilding the file means repeating the method above: read the official sitemap, fetch each live product page, and copy nutrition only from that page or from an official PDF the page itself links to. Do not call `/dnaapp/`. `energy_kcal` stays the published figure and is never derived from kJ. A reproducible refresh script is future work.

## Files

- `data/menu/menu.json`: the dataset
- `data/menu/menu.schema.json`: JSON Schema (2020-12)
- `data/menu/tag-rules.json`: deterministic assignment of `data/order-tags.json` ids
- `data/menu/candidate-policy.json`: which items the order step may see
- `data/menu/SOURCES.md`: this file
