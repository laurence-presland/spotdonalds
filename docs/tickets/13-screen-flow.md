# 13: Screen flow and Results layout

**Size:** M · **Depends on:** 02, 05, 06, 08, 11

## Summary / goal
Own the product journey as four screens, and the analysis pipeline that drives them. After login, start ingestion immediately, cover the start-up wait with a 3-second "Please drive through..." welcome that fades away to reveal the Analysing screen already running underneath, then auto-progress to Results once everything is in. Results has the drive-thru order as the hero, then the taste profile, the aggregate data, and the "how we decided your order" explanation. There is no track list on Results. A Back control returns to Analysing. On reload, skip to the right screen.

## Context
The individual screens and components are built in earlier tickets: landing and auth in 02, the analysing list in 05, aggregate panels in 06, the taste profile card in 08, the order receipt and explanation in 11. This ticket is the glue: routing, transitions, the pipeline orchestrator, resume behaviour, and the Results layout that composes those pieces.

The welcome exists to cover ingestion start-up latency, not to delay the user. Results is the only destination after a completed run.

## In scope
- Four-screen state machine for the app:
  1. **Landing** (unauthenticated) — already built in 02. This ticket just routes unauthenticated users there.
  2. **Welcome** — a full-screen overlay with one line, "Please drive through", whose three dots appear one by one. It holds for about 3 seconds, then fades out to reveal Analysing, which has been mounted and filling in underneath the whole time. No skip control. Shown after a successful login while the pipeline is starting.
  3. **Analysing** — the loading screen from 05, shown for the rest of the run.
  4. **Results** — the post-analysis destination, layout owned here.
- Kick off the analysis pipeline as soon as the session exists after login (server-side, so work starts during the welcome, not after it). The pipeline runs ingest → enrich → profile → order, writes `stage` on the run record, and emits `{type:"stage", stage}` events on the stream. Each stage's work stays in its own ticket; this ticket sequences them and is the status surface the UI reads. Lean toward a single idempotent, resumable `POST /api/analyse` (or equivalent) that drives the existing stage endpoints and streams their events, rather than leaving the browser to chain four calls.
- Welcome behaviour: one line, "Please drive through", with the three dots appearing one at a time (about 0.75s apart, so the full "..." is showing by roughly 2.25s). Hold for a fixed ~3 seconds in total, then fade the overlay out (about 400ms) to reveal Analysing. The duration is fixed: it does not wait for, or cut short on, the first enriched rows. Analysing renders beneath the overlay from the start and its stream is already connected, so whatever rows have arrived are visible the moment the fade begins. No skip control. With `prefers-reduced-motion`, show the full line at once, keep the hold, and swap without a fade. Do not replay the welcome on a reload if a run is already in progress or complete.
- Analysing and Results share a bar that is the yellow wordmark only. No S icon, log out, or order number in that bar. On Results, a Back control sits in its own row under that bar and above the order, aligned left, and returns to Analysing.
- Auto-progress from Analysing to Results when the pipeline reaches `done` (ingestion, enrichment, taste profile and order generation have all completed).
- Results layout, composing existing components:
  - the order receipt as the hero (11),
  - a card beside the receipt: small text "We think you're a", then the persona name and tagline (08), then "How we decided your order" with no citation chips (11), then a primary full-width "Regenerate order" button,
  - the taste profile insights and traits under the hero, without repeating the persona and without caveats or a "how this was made" note (08),
  - the aggregate panels (06).
- No track list on Results. The tracks stay on Analysing; Back is how the user gets to them.
- Reload and resume:
  - unauthenticated → Landing,
  - run in progress (any stage short of `done`) → Analysing, reconnect to the stream, show already-persisted rows immediately,
  - run complete (`stage: "done"`) → Results, with no welcome and no re-run,
  - signed-in but no run yet → start the pipeline and show Welcome then Analysing.
- Logout from an authenticated screen returns to the landing page (02).

## Out of scope
- Building the landing page (02), the analysing list (05), or the individual Results sections (06, 08, 11) beyond laying them out.
- Changing how any stage computes its result.
- A separate URL tree for every screen unless it falls out naturally; a single authenticated route that picks the screen from run status is enough.

## Acceptance criteria
- [ ] An unauthenticated user only ever sees the landing page.
- [ ] After a successful allowlisted login, the pipeline starts without a further click, the welcome appears, then fades out to Analysing, which is already running underneath (rows that arrived during the welcome are visible as it fades).
- [ ] The welcome copy is exactly "Please drive through...", the three dots appear one at a time, and there is no skip control.
- [ ] The welcome lasts about 3 seconds regardless of how fast rows arrive, then fades out. With `prefers-reduced-motion` forced, the dots and fade don't animate and the screen swaps after the hold.
- [ ] The bar on Analysing and Results is the yellow wordmark only. On Results, Back sits under that bar, above the order, on the left, and returns to Analysing without starting a new run.
- [ ] Reloading mid-run returns to Analysing, not Welcome, and the list resumes from persisted data.
- [ ] Reloading after a completed run goes straight to Results, with no welcome and without starting a new run.
- [ ] Results shows the order as the hero. Beside it, a card reads "We think you're a", the persona name, how we decided, and a primary "Regenerate order" button. Below that: taste insights and traits, and aggregates. There is no track list on Results.
- [ ] The client can tell the current pipeline stage from the run record and from `stage` events (tested with a scripted stream: ingest → enrich → profile → order → done).
- [ ] If order generation fails after the profile has been stored, the user is not trapped on Analysing: they reach Results with the order hero in an error/retry state.
- [ ] The flow works at 360px and desktop widths and the transitions pass an automated accessibility check (including reduced motion and focus after a screen change).

## Technical notes
- Start the run on the server as soon as the session is established (auth callback or the first authenticated analyse request). The welcome should be covering work already in flight.
- Keep endpoint-level `done` events from 03/04/07/10 distinct from pipeline `stage: "done"`. The orchestrator is what advances `stage`.
- A thin routing shell can be stubbed as soon as 02 and 05 exist; the ticket is done when Results is wired and resume behaves as above.
- Don't store the current screen only in client memory: run `stage` is the source of truth for resume.

## Dependencies
02 (landing, session, logout), 05 (Analysing screen and stream parsing), 06, 08 and 11 (Results sections). The pipeline sequences 03, 04, 07 and 10.

## Open questions
- Welcome timing. Decided: fixed ~3 seconds, dots one by one, then a fade into an Analysing screen that is already running. Not tied to row arrival. No skip control.
- If profile generation fails, same as a failed order (go to Results with an error state) or stay on Analysing with retry? Leaning go to Results, with both the profile and the order in error/retry, because the aggregates are already available, and Back returns to the track list on Analysing.
- Deep-linkable URLs per screen? Leaning no: one authenticated route, screen chosen from run status, so refresh can't land someone back on the welcome.
