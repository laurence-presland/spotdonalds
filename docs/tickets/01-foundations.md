# 01: Foundations

**Size:** M · **Depends on:** none

## Summary / goal
Get to a bare-bones app that is deployed and talks to the database. Everything else builds on this, so the point is a boring, working pipeline: push to `main`, CI passes, Vercel deploys, the page can reach Supabase.

## Context
The brief prefers a hosted link, and deploying late is how hosted links break. Stack is Next.js (App Router) + React + TypeScript on Vercel, with a non-prod Supabase project (Postgres + Auth). Deploying an empty app on day one means every later ticket is verified against the real environment.

## In scope
- Next.js + TypeScript app (strict mode), App Router, a single "hello" page.
- Vercel project linked to this repo, preview deploys on PRs, production from `main`.
- Supabase (non-prod) linked: migrations folder with a baseline migration, and a server-side client helper.
- A health route (`/api/health`) that does a trivial DB round trip and returns `{ ok: true }`.
- `.env.example` listing every variable used so far, with comments. No secrets committed.
- Lint (ESLint), typecheck (`tsc --noEmit`), unit tests (Vitest) and a GitHub Actions workflow running all three on push and PR.
- Structured logging helper (one small module, JSON lines) so later tickets log consistently.
- README skeleton: what it is, stack, local setup, scripts, placeholder sections for architecture / AI / limitations.
- Base layout, global styles and a small design-token set so the later UI tickets look consistent.

## Out of scope
- Authentication (02) and any real tables beyond what the baseline migration needs.
- Any Spotify code.
- Real README content (12).

## Acceptance criteria
- [x] `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck` and `npm test` all pass locally from a clean clone following the README.
- [x] CI runs lint, typecheck and tests on every push and PR, and fails the build when any of them fail.
- [ ] The hello page is live at a Vercel URL from `main`.
- [ ] `GET /api/health` on the deployed URL returns 200 with `{ ok: true }` only when the DB query succeeds, and a non-200 otherwise.
- [ ] Migrations apply cleanly to the Supabase project from the repo (documented command).
- [x] `.env.example` exists, is complete for this ticket, and contains no real values.
- [x] No secrets in git history (check before pushing the first deploy).

## Technical notes
- Keep service-role keys server-only. Only `NEXT_PUBLIC_` variables may reach the browser.
- Prefer the Supabase CLI for migrations so the schema is reproducible by a reviewer.
- Node route handlers (not Edge) will be needed from 03 onwards for streaming, so set the default runtime to Node.
- Vercel function limits to remember for later: Hobby max duration 300s, Pro 800s.

## Dependencies
None. Needs access to the Vercel account and the non-prod Supabase project.

## Open questions
- Hobby or Pro on Vercel? Affects how long ingestion can run in one request (see 03).
- Package manager (npm vs pnpm)? Default to whatever the Vercel project is already using.
