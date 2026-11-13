# 08: Taste profile UI

**Size:** M · **Depends on:** 07, 06

## Summary / goal
Present the generated taste profile on the Results screen: persona, insight lines with the stats they come from, and trait scores, with a clear path from each claim back to the underlying data. The drive-thru order is the hero of Results (11, 13); this card sits with it, not above it as a separate destination.

## Context
The AI output is what evaluators care about most, so the profile still deserves a polished, evidence-backed treatment. The "visualise the AI output" option in the brief is satisfied here and in the order receipt (11). Trust matters: every sentence should show its evidence, and caveats about weak data should be visible rather than buried.

First generation is automatic, as part of the analysis pipeline (13). This ticket owns the card and regenerate, not when the user first arrives on Results.

## In scope
- `TasteProfileCard`: persona name and tagline, with a distinct but tasteful visual identity, built as a composable section for the Results screen (13).
- Insight list where each line is paired with chips for the cited signals (label, value, sample size) that link or scroll to the matching aggregate panel on Results.
- Trait visualisation (radar chart or bar chart) with score and the signal each is based on.
- Caveats section when the profile reports weak coverage.
- Regenerate action (rate-limited) and loading, error and retry states for regenerate (and for the rare case the stored profile is missing).
- A "how this was made" disclosure: signals in, model output out, prompt version, and the statement that the model sees only computed signals.
- Responsive layout, accessible chart alternatives, and a shareable-looking card (no sharing feature required).

## Out of scope
- Computing signals or calling the model on first run (07, orchestrated by 13).
- The Results page layout and screen routing (13).
- The McDonald's order UI (11).
- Image generation of the profile (future work).

## Acceptance criteria
- [ ] The profile card renders with persona, tagline, 2-3 insights and traits from the stored profile.
- [ ] Each insight shows its cited signals with correct values from the stored signals snapshot.
- [ ] Clicking or focusing a cited signal chip navigates to the related aggregate section.
- [ ] A profile with caveats renders them visibly.
- [ ] Loading, error, and retry states work (tested with a stubbed API failing then succeeding).
- [ ] Regenerate is disabled while a request is in flight and doesn't produce duplicate cards.
- [ ] The "how this was made" panel displays the real prompt version and signals used.
- [ ] Charts have text alternatives and the card passes an automated accessibility check.
- [ ] Renders correctly at 360px width and at desktop width, both on its own and in the Results layout.

## Technical notes
- Render the stored profile; don't re-derive anything client-side.
- Keep the card self-contained (props in, markup out) so it's easy to snapshot-test and screenshot for the README.
- Components: `TasteProfileCard`, `InsightLine`, `SignalChip`, `TraitChart`, `ProfileProvenance`.

## Dependencies
07 for the endpoint and types; 06 for the dashboard anchors. 13 places the card on Results.

## Open questions
- Radar vs bar chart for traits? Radar looks better but is less readable. Leaning bar chart with a small radar as a secondary view only if time allows.
