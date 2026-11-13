# 11: Order UI

**Size:** S · **Depends on:** 10, 08

## Summary / goal
Show the generated McDonald's order as a receipt-style card, with each item's "why you got this" next to it and links back to the stats and rules behind it.

## Context
This is the playful payoff after the taste profile. It should be fun and polished, but it must stay clearly derived from the user's data: every line points at the rule and signal that produced it. Menu data is attributed and has no prices, so the receipt shows calories rather than dollars.

## In scope
- `OrderReceipt`: receipt-styled layout (header, order number or date, item lines with quantity, name, kcal, a total line, footer with the summary line).
- Per-item "why" text from the stored justification, with rule and signal chips (rule description, signal value) that link to the dashboard or profile sections.
- Calorie total against the budget, with the budget's rule explanation ("higher average BPM, so a bigger budget").
- Footer showing menu `retrieved_at` and a source note (McDonald's Australia public product pages), and the one-line "not affiliated" notice.
- Generate flow: request when the profile exists (button or automatic after the profile), loading, error and retry states, and regenerate.
- Clear presentation of any caveat or confidence note from the model.
- Responsive and accessible (semantic list or table for items, readable contrast, no information in colour alone).

## Out of scope
- Generating the order (10).
- Prices, real ordering or deep links.
- Images of the order (future work).

## Acceptance criteria
- [ ] The receipt renders items, quantities and calories from the stored order and the total matches the sum of items.
- [ ] Each item shows its justification and valid rule/signal chips that navigate to the right section.
- [ ] The calorie budget and the rule that produced it are visible.
- [ ] Menu retrieval date and source attribution are shown.
- [ ] Loading, error and retry states work, and regenerate doesn't stack duplicate receipts.
- [ ] Layout holds at 360px and desktop widths and passes an automated accessibility check.
- [ ] A component test covers rendering from a fixture order, including an item with missing optional fields.

## Technical notes
- Look up item names and nutrition from the menu loader (09) by id, not from model text, so the display can't drift from the data.
- Components: `OrderReceipt`, `OrderLine`, `RuleChip`, `BudgetBar`.
- A print-style or screenshot-friendly layout is a nice touch for the README screenshots.

## Dependencies
10 for the endpoint and types; 08 for shared chips and anchors.

## Open questions
- Receipt-style monospace or a cleaner card with a receipt edge? Decide when building and keep it readable.
