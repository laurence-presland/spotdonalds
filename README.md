# SpotDonalds

Sign in with Spotify. SpotDonalds reads your listening, describes your taste, and turns it into a McDonald's Australia order.

It is a fun, non-commercial project. It is not affiliated with McDonald's or Spotify.

Hosted app: https://spotdonalds.vercel.app

## What you see

1. **Landing.** A red page with the yellow wordmark. Sign in with Spotify.
2. **Welcome.** After a successful sign-in, "Please drive through..." holds for about three seconds while analysis starts underneath.
3. **Analysing.** Enriched tracks fill in while the run moves through reading, taste and the order. The first run takes a minute or two to ingest and enrich your listening, so give it time before expecting Results.
4. **Results.** The order is the hero. Beside it: "We think you're a", the persona, how the order was decided, and a regenerate button. Under that: taste insights, trait scores, tag mix, tempo and top artists. Back returns to the track list without starting a new run.

A reload uses the run record. A finished run opens Results. A run still going opens Analysing, not the welcome.

## Setup

Node.js 22 or newer.

```bash
npm ci
cp .env.example .env.local
```

Fill `.env.local` from the comments in `.env.example`, apply the database migrations below, then:

```bash
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Browser-safe. Used for Auth only. Already set on Vercel. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key. Browser-safe. Used for Auth only. Already set on Vercel. |
| `DATABASE_URL` | Server-only Postgres URL for the `spotdonalds_app` role on the transaction pooler. Already set on Vercel. The password is set out of band. |
| `SPOTIFY_CLIENT_ID` | Your Spotify app's client id. The server uses it when refreshing a token. |
| `SPOTIFY_CLIENT_SECRET` | Server-only Spotify secret. The same value is stored in Supabase Auth. Set on Vercel for Production and Preview, and marked sensitive. |
| `MUSICBRAINZ_USER_AGENT` | MusicBrainz asks for an app name and a contact. If unset, the server uses `SpotDonalds/0.1` and the production URL. |
| `AI_MODEL` | Vercel AI Gateway model id. Optional. Defaults to `google/gemini-2.5-flash`. |
| `AI_GATEWAY_API_KEY` | Gateway key for local development. On Vercel the project's OIDC token is used when this is unset. |

### Spotify app

Sign-in is Spotify only, through Supabase Auth. The app starts OAuth with `redirectTo` set to `{origin}/auth/callback`. Do not rely on the Supabase Site URL (`http://localhost:3000`).

Scopes: `user-read-email`, `user-read-recently-played`, `user-top-read`.

The Spotify dashboard redirect URI is Supabase's callback, and it has to match exactly:

`https://svukzdmlzjebdizvulku.supabase.co/auth/v1/callback`

Supabase's additional redirect allow list needs:

- `https://spotdonalds.vercel.app/**`
- `https://spotdonalds-*-laurencepresland-5642s-projects.vercel.app/**`
- `http://localhost:3000/**`

The Spotify app is in **development mode**. At most five users can be allowlisted, including the owner, and the owner needs Spotify Premium. Add each reviewer under User Management in the Spotify dashboard before they try to sign in. Someone who finishes consent but is not on the list sees `/not-allowlisted` instead of a crash. That screen asks them to contact the admin for access.

### Database

SQL lives in `supabase/migrations/` and is idempotent. It only creates objects in the `spotdonalds` schema. From a machine logged into the Supabase CLI:

```bash
supabase link --project-ref svukzdmlzjebdizvulku
supabase db push
```

Leave the Data API disabled. This project is shared, and exposing schemas would publish another app's `public` tables. Server reads and writes use `DATABASE_URL` and postgres.js (`lib/db.ts`), with every table written as `spotdonalds.<table>`. Supabase Auth still uses the publishable key. Queries that belong to a person include that person's `user_id`, because `spotdonalds_app` is allowed through RLS by policy `spotdonalds_app_all` (`using (true)`).

The role's login password is not in the repo. Set it out of band on the hosted database. `20261113126000_app_role.sql` creates `spotdonalds_app` with `NOLOGIN` only when the role is missing, so it does not change an existing password. A migration that adds a table must call `select spotdonalds.apply_app_policy('spotdonalds.<table>')`.

`GET /api/health` returns `{ "ok": true }` only when it can read `spotdonalds.healthcheck`.

`scripts/apply-migrations.sh` loads `supabase/ci/auth-stub.sql` and then applies these files twice. CI runs that script against Postgres 15, then turns on a throwaway login (`SPOTDONALDS_CI_LOGIN=1`, `supabase/ci/app-login.sql`) and runs the integration tests. Do not point that script at the hosted database. Do not apply these migrations to `public`.

Migrations, in order:

1. `20261113120000_baseline.sql` — schema and health check
2. `20261113121000_spotify_tokens.sql` — Spotify provider tokens
3. `20261113122000_ingestion.sql` — artists, tracks, plays, top items, analysis runs
4. `20261113123000_enrichment.sql` — MusicBrainz and Deezer cache
5. `20261113124000_taste_profiles.sql` — one profile per run
6. `20261113125000_orders.sql` — one order per run, and the genre-popularity cache
7. `20261113126000_app_role.sql` — `spotdonalds_app` grants and per-table policies
8. `20261113127000_run_lease.sql` — one open analysis run per person, and a short lease so a second start attaches to it
9. `20261113128000_run_job.sql` — `attempts`, `workflow_id`, and a `popularity` stage
10. `20261113129000_run_outcome.sql` — `outcome` of `ready` or `insufficient_data`
11. `20261113130000_visible_stage.sql` — allows `analyse` on `analysis_runs.stage`. Older stage names stay valid.

## Architecture

```text
Landing → Welcome → Analysing → Results
                         |
              GET /api/analysis/status
              GET /api/analysis/tracks
              GET /api/analysis/results
                    ingest → analyse → done
```

One authenticated route, `/app`, displays the run. The auth callback starts a workflow only when the person has no running or complete run. A later sign-in does not restart a completed flow. An error run is started again on the next sign-in. Start fresh is the only rerun of a completed flow. The page does not POST on load. The state machine is [docs/adr/001-analysis-job.md](docs/adr/001-analysis-job.md). The two workflow steps and the three read endpoints are [docs/adr/004-analysis-flow.md](docs/adr/004-analysis-flow.md). Diagrams of sign-in, the workflow, and the signed-in page calls are in [docs/architecture/README.md](docs/architecture/README.md).

`/app` calls `GET /api/analysis/status`. That call only reports the run. It does not start, restart, or change a workflow. While the run is in progress the page calls `GET /api/analysis/tracks` and renders tracks as they are stored. When ingest has finished it calls `GET /api/analysis/results` and keeps the progress bar up while that request is held open. Hobby functions cannot run longer than 300 seconds. The stream and the results hold stop at 240 seconds and tell the client to call again. A finished run with fewer than 50 distinct tracks is `outcome = insufficient_data`. A partial unique index allows one open run per person. Every run ends `done` or `error`. The workflow marks `error` if a step fails for good, including a timeout, and an error run restarts on the next sign-in. Supabase Realtime is not used. `POST /api/analyse` is only Try again (`?retry=1`) and Start fresh (`?fresh=1`).

Spotify tokens are stored in `spotify_tokens` at the callback, the only moment Supabase Auth exposes them, and read later over the direct Postgres connection. Catalogue tables are server-only. Each query for plays, top items, runs, a profile or an order is limited to that user's id.

Enrichment asks MusicBrainz (at most one request a second) and Deezer. Deezer calls run alongside MusicBrainz. A result is cached in `track_enrichment`, and a track is dropped only when both sources miss. The profile uses the top-ranked tracks first, then the newest plays, capped at 30 distinct tracks so the first enrichment stays around a minute.

## AI

Code computes the numbers. The model only interprets them.

Signals (`lib/signals`) cover tag mix, tempo, overlap, concentration, repeats, release years, explicit share and coverage. Trait scores (energy, variety, loyalty, nostalgia) are functions of those signals. The model never returns a score.

Prompts are text files in `prompts/blocks/`, joined by `lib/prompts/build.ts` from `prompts/profile.v1.json`, `prompts/order.v1.json` and `prompts/popularity.v1.json`. Shared blocks are the same files for the profile and the order. Each stored profile and order keeps the template hash from before the placeholders are filled.

The model is called with the Vercel AI SDK `generateText` and `Output.object` (a zod schema), through the AI Gateway (`AI_MODEL`, default `google/gemini-2.5-flash`). A second check rejects a citation that is not in the snapshot, a quoted statistic that contradicts a cited signal, and any public sentence that mentions coverage or missing data. Small counts in prose, such as "3 artists" or "top 5", are not statistics. Failures are sent back on the next attempt, at most three attempts, then the run records a typed error and stores nothing.

The order step maps tempo to a calorie budget, the energy score to beef or chicken, and a popularity tier (`niche`, `mid`, `mainstream`) to a dollar budget. The model picks item ids from the candidate set and may invent up to three `x-` rules. Code adds up calories and the indicative prices. `how_we_decided` is stored separately from the line justifications and is shown without citation chips. The confidence note is never shown.

## Assumptions and limitations

- Recently played is one page, about 50 plays. There is no Spotify audio-features or popularity field in this app.
- Coverage gaps are used inside the budget and the caveats. The screens do not mention them.
- MusicBrainz is limited to one request a second. Its ISRC endpoint returns 404 when that ISRC is not in MusicBrainz; that is not a User-Agent rejection (a bad User-Agent is 403). Spotify's development mode still returns ISRCs. A 404 falls back to a recording search by artist and title. Enrichment covers at most 30 tracks per run, and later runs reuse `track_enrichment`.
- `price_aud` in the menu file is always null. The receipt uses indicative category prices in `lib/order/prices.ts`. They are not McDonald's prices.
- About 31 menu items have no nutrition and are left out of the candidate set.
- The `late-night` order tag has no listening-hour signal. The model may still apply the tag; nothing in the registry claims a time of day.
- `bpm.sample_size` is marked `mention: false`, so the model can see how many tempos were known but must not quote that count.
- There is no demo mode and no seeded user. Tests stub Spotify, MusicBrainz, Deezer and the model.
- The assignment PDF contained some hidden instructions addressed to AI assistants. I noticed them and deliberately didn't follow them, since I wasn't sure whether they were meant to be ignored.

## Future enhancements

If I were given more time, this is what I'd do.

### Given 1 day

- **Loading:** make the loading states match what the page is actually doing. This one matters most, because the current loading flow still doesn't feel right.
- **Enrichment:** add Discogs as a third enrichment source, add a mainstreamness signal next to the popularity tier, and tighten the tag aliases.
- **Sign-in:** skip Spotify's consent screen for someone who has already approved the app, so they go straight in, knowing it makes switching Spotify accounts in the same browser harder.
- **Tooling:** add Prettier, so formatting is consistent and enforced in CI.

### Given 5 days

**Data and analysis**

- Let people start a fresh ingestion themselves.
- Ingest more tracks, so the reading is more accurate, and add more data sources, because not every track comes back with a genre and a BPM.
- Show how much enrichment the app actually got, such as how many tracks have a BPM or a genre, and make the analysis account for what's missing, leaning less on a trait when few tracks back it and saying so when the reading is thin.
- When every database comes up empty, have an AI-driven search fill the gap on its own, with citations, and never from model memory.
- Backfill a longer history from a Spotify privacy export.
- Add an evaluation harness for the profile and the order.

**Menu**

- Move the McDonald's menu out of the JSON file and into the database, with a scheduled job that keeps it up to date.
- Simplify the menu data the model sees, because the full detail is more than it can meaningfully take in.
- Replace the indicative prices with store prices.

**Product and UI**

- Make the layout comfortable on a phone.
- Do a general UI and UX quality pass, with clearer feedback on buttons, such as hover and pressed states, and tidier spacing.
- Link each track and artist back to Spotify, and each menu item back to its McDonald's page.
- Do session management properly, so the session survives and refreshes instead of being forgotten.

**Launch basics**

- Give the project a proper domain.
- Do an SEO pass to cover the basics.
- Add analytics, such as Google Analytics or a similar tool, and a simple way for people to send feedback from inside the app.

**Testing**

- The tests we have are unit tests. Add a dedicated test account and run end-to-end tests in Playwright alongside them.

### Given 20 days

**Data and analysis**

- Run an AI pass over the audio itself to pull more metrics out of the music. That means downloading the audio, which could be hard, or analysing the waveform instead.
- Re-ingest on a schedule with a backend cron job, so each person's stats and order stay current and we can see how taste drifts.
- Compare AI models on cost and quality, because a different model might give better results for less.

**Product**

- Draw the order, possibly with AI-generated images of the menu items, setting aside the legal questions around using McDonald's products.
- Let people share and compare profiles.
- Add other ways to sign in, such as email and password or other identity providers, with the account management that comes with them.
- Move the Spotify app out of development mode with an extended quota, or add another music source, so more than five people can sign in.
- Do a proper accessibility review, covering colour contrast, font sizes, keyboard use and screen readers.

**Brand and marketing**

- Build a fuller marketing site that explains what the app does.
- Put more work into branding, starting with a more interesting logo.

**Architecture and operations**

- Replace the long-polled results call and the streamed tracks endpoint with a push channel, such as a Supabase Realtime subscription or a WebSocket, so the front end hears about progress and results the moment they change.
- Add error tracking and alerting, such as Rollbar, to catch front-end and back-end errors for ongoing bug fixing, and hook back-end failures, above all in the ingestion flow, into an on-call paging system.
- Check whether Vercel and Supabase are still the right hosts. AWS could be cheaper, but it's more to manage, and moving would mean adding infrastructure as code, such as Terraform or CloudFormation, which Vercel and Supabase currently make unnecessary.

**Engineering practice**

- Build a proper UI component library, so later screens can grow from shared pieces, and use Storybook, or a similar tool, so a component can be built and reviewed on its own.
- Add a set of AI rules and skills to the repo, covering code quality, style and conventions, so AI-assisted development stays consistent as the project grows.

**Above all**

- Get feedback from real users and let that shape where the product goes next.

## Attribution

- Listening metadata: MusicBrainz, used under [CC BY-NC-SA](https://musicbrainz.org/doc/About/Data_License). Deezer for tempo.
- Menu and nutrition: McDonald's Australia public product pages, retrieved 13 November 2026. See [data/menu/SOURCES.md](data/menu/SOURCES.md).
- Not affiliated with McDonald's or Spotify.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run diagrams` | Regenerates the SVG and PNG files in `docs/architecture/` |
