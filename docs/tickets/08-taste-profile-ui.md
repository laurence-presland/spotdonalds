# 08: Taste profile UI

**Size:** M · **Depends on:** 07 (06 for the page shell)

## Summary / goal
Present the generated taste profile as the centrepiece of the app: persona, insight lines with the stats they come from, and trait scores, with a clear path from each claim back to the underlying data.

## Context
The AI output is what evaluators care about most, so it deserves the best UI. The "visualise the AI output" option in the brief is satisfied here. Trust matters: every sentence should show its evidence, and caveats about weak data should be visible rather than buried.

## In scope
- `TasteProfileCard`: persona name and tagline as the hero, with a distinct but tasteful visual identity.
- Insight list where each line is paired with chips for the cited signals (label, value, sample size) that link or scroll to the matching element on the aggregate dashboard.
- Trait visualisation (radar chart or bar chart) with score and the signal each is based on.
- Caveats section when the profile reports weak coverage.
- Generate flow: the profile is requested when enrichment completes (or by a "Generate my profile" button), with a streaming-style loading state, and error and retry states.
- Regenerate action (rate-limited) and a "how this was made" disclosure: signals in, model output out, prompt version, and the statement that the model sees only computed signals.
- Responsive layout, accessible chart alternatives, and a shareable-looking card (no sharing feature required).

## Out of scope
- Computing signals or calling the model (07).
- The McDonald's order UI (11).
- Image generation of the profile (future work).

## Acceptance criteria
- [ ] After a completed run, the profile card renders with persona, tagline, 2-3 insights and traits from the stored profile.
- [ ] Each insight shows its cited signals with correct values from the stored signals snapshot.
- [ ] Clicking or focusing a cited signal chip navigates to the related dashboard section.
- [ ] A profile with caveats renders them visibly.
- [ ] Loading, error, and retry states work (tested with a stubbed API failing then succeeding).
- [ ] Regenerate is disabled while a request is in flight and doesn't produce duplicate cards.
- [ ] The "how this was made" panel displays the real prompt version and signals used.
- [ ] Charts have text alternatives and the card passes an automated accessibility check.
- [ ] Renders correctly at 360px width and at desktop width.

## Technical notes
- Render the stored profile; don't re-derive anything client-side.
- Keep the card self-contained (props in, markup out) so it's easy to snapshot-test and screenshot for the README.
- Components: `TasteProfileCard`, `InsightLine`, `SignalChip`, `TraitChart`, `ProfileProvenance`.

## Dependencies
07 for the endpoint and types; 06 for the dashboard anchors.

## Open questions
- Radar vs bar chart for traits? Radar looks better but is less readable. Leaning bar chart with a small radar as a secondary view only if time allows.
