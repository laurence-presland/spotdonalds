# 12: Submission

**Size:** M · **Depends on:** all

## Summary / goal
Package the work for review: README with everything the brief asks for, screenshots, reviewers able to sign in, a working hosted link, and a public repository at the end.

## Context
The brief asks for a public repo link, a hosted version (preferred) and a README covering setup, architecture, the AI implementation, limitations and next steps, plus a 1/5/20-day enhancement plan. Notes say to make reasonable assumptions and write them down. Due Fri 20 Nov 2026. Reviewers use their own Spotify accounts, so their access has to be arranged before they try it.

## In scope
- README.md with:
  - what it is, with a screenshot or two,
  - setup steps from a clean clone, including `.env.example` explained line by line (Supabase, Spotify, LLM provider, MusicBrainz contact),
  - Spotify developer app setup: redirect URIs, scopes, and the dev-mode limits (5 allowlisted users, owner needs Premium),
  - architecture and design: data flow from sign-in to ingestion, enrichment, signals, taste profile and order; the streaming design and why HTTP streaming over WebSockets; database tables at a high level; a diagram,
  - AI implementation: the code-computes / model-interprets split, prompts and schemas, validation and retry, how metadata is grounded (and that the model never guesses it), evaluation fixtures,
  - assumptions and limitations (below),
  - future enhancements for 1, 5 and 20 more days,
  - attribution for MusicBrainz (CC BY-NC-SA), Deezer and the McDonald's Australia source data, and the not-affiliated note.
- Limitations to state plainly: shallow recently-played history, no audio features or reliable popularity from Spotify, metadata coverage gaps (shown as missing), MusicBrainz rate limit making first runs slow, menu has no prices and ~31 items without nutrition, dev-mode user cap.
- Future enhancements:
  - **1 day:** Discogs as a third enrichment source; more taste-profile metrics including popularity and how mainstream the listening is; menu refresh script; better tag normalisation.
  - **5 days:** search-grounded gap-fill for metadata no structured source has (with citations, never model recall); Spotify privacy-export backfill for longer history; menu prices via store-specific data; background job queue so enrichment isn't tied to one request; evaluation harness for profile and order quality.
  - **20 days:** drawn or generated images of the order; extended Spotify quota or another music source for multi-user scale; additional connected services; sharing and comparing profiles; scheduled re-ingestion and taste drift over time.
- Screenshots (login, live ingestion, dashboard, taste profile, order receipt) in `docs/screenshots/` and referenced from the README.
- Reviewer access: add each reviewer's name and Spotify email under User Management in the Spotify Developer Dashboard (max 5 users including Laurence), and confirm each can sign in. This is a manual step done by Laurence.
- Hosted link: production deployment verified end to end with a fresh, allowlisted account.
- Final clean-up pass: remove dead code and TODOs, run lint/typecheck/tests, check secrets history, fill the contact line on the access-denied screen from 02.
- Make the repository public (Laurence does this at submission) and send the repo and hosted links.

## Out of scope
- New features. Anything unfinished goes in the README as a limitation or future work.

## Acceptance criteria
- [ ] A reviewer can follow the README from a clean clone to a running local app using only `.env.example` and the documented steps.
- [ ] README includes all sections the brief lists: setup with `.env.example`, high-level architecture and design, AI implementation, limitations and next steps, screenshots.
- [ ] 1-, 5- and 20-day enhancement plans are present and concrete.
- [ ] The README states the Spotify dev-mode limits and the assumptions made.
- [ ] Attribution for MusicBrainz, Deezer and McDonald's Australia source data is present.
- [ ] Each reviewer's Spotify account is allowlisted and a sign-in was tested on the production URL (or the access screen reviewed for anyone not yet added).
- [ ] The hosted link works on a fresh browser session end to end: sign in, ingestion streams, profile and order render.
- [ ] CI is green on `main` and `npm run lint && npm run typecheck && npm test` pass.
- [ ] No secrets in the repository or its history.
- [ ] Repository is public and the links have been sent.

## Technical notes
- Do a dry run on the production URL a day early to leave time to fix env or redirect URI mismatches.
- First-run enrichment is slow; mention expected duration in the README so reviewers don't think it has hung.
- Check which reviewers' emails differ between their Spotify account and their work address before allowlisting.

## Dependencies
All other tickets (or a decision on what's cut, per the cut line in the index).

## Open questions
- Who are the reviewers, and what are their Spotify account emails? (Needed before allowlisting; max 5 users total.)
- Do we include a short screen recording as the optional demo video?
- Final LLM provider and cost for reviewer runs: set a spend cap before sharing the link.
