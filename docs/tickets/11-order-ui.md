# 11: Order UI

**Size:** S · **Depends on:** 10, 08

## Summary / goal
Show the generated McDonald's order as a receipt-style card that is the hero of the Results screen, with each item's "why you got this" next to it, and a "how we decided your order" explanation from the model, all linking back to the stats and rules behind them.

## Context
This is the playful payoff of the analysis. It should be fun and polished, but it must stay clearly derived from the user's data: every line points at the rule and signal that produced it. Menu nutrition is attributed. The receipt shows an AUD price on every line and a dollar total, and keeps calories alongside.

First generation is automatic, as the last stage of the analysis pipeline (13). This ticket owns the receipt, the explanation block and regenerate, not the Results page layout itself.

## In scope
- `OrderReceipt`: receipt-styled layout (header, order number or date, item lines with quantity, name, AUD price, kcal, a dollar total, a calorie total, footer). Built as the hero component for Results (13), so it should read clearly as the main result, not a footer card. The dollar total is the sum of the line prices.
- Per-item "why" text from the stored justification, plus tags whose ids come from `data/order-tags.json`. Render the label from that file, not from model text. These tags are not freeform rule or signal chips.
- House rules: a small list of the order's `invented_rules` under `HowWeDecided`, labelled as rules the AI made up (for example "House rules, invented by the AI"), visually lighter than our own rules.
- `HowWeDecided`: a block rendering the stored `how_we_decided` explanation, with no rule or signal chips on this block. Distinct from the per-item "why" lines and from the item tags. 13 places it in the hero card, under the persona.
- Calorie total against the budget, with the budget's rule explanation ("higher average BPM, so a bigger budget").
- Footer showing menu `retrieved_at` and a source note (McDonald's Australia public product pages), and the one-line "not affiliated" notice.
- Regenerate is a primary button, full width of the hero card: charcoal fill, yellow label, "Regenerate order". Include loading, error and retry states (including the case where the pipeline reached Results but order generation failed).
- Do not show the model's confidence note or a coverage caveat on this screen.
- Responsive and accessible (semantic list or table for items, readable contrast, no information in colour alone).

## Out of scope
- Generating the order (10).
- The Results page layout and screen routing (13).
- Prices, real ordering or deep links.
- Images of the order (future work).

## Acceptance criteria
- [x] The receipt renders items, quantities, prices and calories from the stored order. The dollar total matches the sum of the line prices, and the calorie total matches the sum of the items.
- [x] Each item shows its justification and tags whose labels match `data/order-tags.json` for the stored ids. An id missing from that file is not rendered as a made-up label.
- [x] The `how_we_decided` explanation is visible and has no citation chips.
- [x] The calorie budget and the rule that produced it are visible.
- [x] Menu retrieval date and source attribution are shown.
- [x] Loading, error and retry states work, and regenerate doesn't stack duplicate receipts.
- [ ] Layout holds at 360px and desktop widths, including in a hero position on Results, and passes an automated accessibility check.
- [x] A component test covers rendering from a fixture order, including the explanation block and an item with missing optional fields.

## Technical notes
- Look up item names and nutrition from the menu loader (09) by id, not from model text, so the display can't drift from the data.
- Components: `OrderReceipt`, `OrderLine`, `HowWeDecided`, `RuleChip`, `BudgetBar`.
- A print-style or screenshot-friendly layout is a nice touch for the README screenshots.

## Dependencies
10 for the endpoint and types; 08 for shared chips and anchors. 13 places the receipt as the Results hero.

## Open questions
- Receipt-style monospace or a cleaner card with a receipt edge? Decide when building and keep it readable.
