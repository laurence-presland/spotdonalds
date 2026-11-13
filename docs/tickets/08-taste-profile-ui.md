# 08: Taste profile UI

**Size:** M · **Depends on:** 07, 06

## Summary / goal
Present the generated taste profile on the Results screen: insight lines with the stats they come from, and trait scores, with a clear path from each claim back to the underlying data. The persona name is not a heading on this section. 13 places it in the hero, beside the order: small text "We think you're a", then the persona name. The drive-thru order stays the hero.

## Context
The AI output is what evaluators care about most, so the profile still deserves a polished, evidence-backed treatment. The "visualise the AI output" option in the brief is satisfied here and in the order receipt (11). Insight lines keep their signal chips. Caveats and the "how this was made" note are not shown on the results screen.

First generation is automatic, as part of the analysis pipeline (13). This ticket owns the card and regenerate, not when the user first arrives on Results.

## In scope
- `TasteProfileCard`: the insights and traits, built as a section under the hero on the Results screen (13). The persona name and tagline are not repeated here.
- Insight list where each line is paired with chips for the cited signals (label, value, sample size) that link or scroll to the matching aggregate panel on Results.
- Trait visualisation (radar chart or bar chart) with score and the signal each is based on.
- Do not render `caveats` or a "how this was made" disclosure. The stored profile can still carry them (07); this screen leaves them out.
- Responsive layout, accessible chart alternatives, and a shareable-looking card (no sharing feature required).

## Out of scope
- Computing signals or calling the model on first run (07, orchestrated by 13).
- The Results page layout and screen routing (13).
- The McDonald's order UI (11).
- Image generation of the profile (future work).

## Acceptance criteria
- [x] The profile section renders 2-3 insights and traits from the stored profile. The persona name is not repeated in this section.
- [x] Each insight shows its cited signals with correct values from the stored signals snapshot.
- [x] Clicking or focusing a cited signal chip navigates to the related aggregate section.
- [x] A profile that includes caveats does not render them, and there is no "how this was made" panel.
- [ ] Charts have text alternatives and the card passes an automated accessibility check.
- [ ] Renders correctly at 360px width and at desktop width, both on its own and in the Results layout.

## Technical notes
- Render the stored profile; don't re-derive anything client-side.
- Keep the card self-contained (props in, markup out) so it's easy to snapshot-test and screenshot for the README.
- Components: `TasteProfileCard`, `InsightLine`, `SignalChip`, `TraitChart`. Persona placement is owned by 13.

## Dependencies
07 for the endpoint and types; 06 for the dashboard anchors. 13 places the card on Results.

## Open questions
- Radar vs bar chart for traits? Radar looks better but is less readable. Leaning bar chart with a small radar as a secondary view only if time allows.
