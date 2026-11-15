# SpotDonalds

Sign in with Spotify. SpotDonalds reads your listening, describes your taste, and turns it into a McDonald's Australia order.

It is a fun, non-commercial project. It is not affiliated with McDonald's or Spotify.

Hosted app: https://spotdonalds.vercel.app

## Pages

1. **Landing.** A red page with the yellow wordmark. Sign in with Spotify.
2. **Welcome.** "Please drive through..." holds after sign-in while the analysis starts underneath.
3. **Analysing.** Tracks fill in one by one as they're ingested, while the run moves through reading, taste and the order. The first run takes a minute or two, so give it time before expecting Results.
4. **Results.** The order is the hero. Beside it: "We think you're a", the persona, how the order was decided, and a regenerate button. Under that: taste insights, trait scores, tag mix, tempo and top artists. Back returns to the track list without starting a new run.

On a return visit, the welcome page stays up while the run, tracks and results load, then goes straight to Results. The track list only opens on its own while a run is still in progress.

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

SQL lives in `supabase/migrations/`, is idempotent, and only creates objects in the `spotdonalds` schema. From a machine logged into the Supabase CLI:

```bash
supabase link --project-ref svukzdmlzjebdizvulku
supabase db push
```

Leave the Data API disabled: the project is shared, and exposing schemas would publish another app's `public` tables. The server talks to Postgres directly through `DATABASE_URL` as the least-privilege `spotdonalds_app` role, and every query for a person's data is scoped to their `user_id`. The role's password is set out of band, never in the repo. A migration that adds a table must call `select spotdonalds.apply_app_policy('spotdonalds.<table>')`.

CI applies the migrations twice to a throwaway Postgres 15 (`scripts/apply-migrations.sh`) and runs the integration tests against it. Don't point that script at the hosted database. `GET /api/health` returns `{ "ok": true }` when the database is reachable.

## Architecture

```text
Landing → Welcome → Analysing → Results
                         |
              GET /api/analysis/status
              GET /api/analysis/tracks
              GET /api/analysis/results
                    ingest → analyse → done
```

The auth callback starts a Vercel Workflow only when the person has no running or complete run. It has two steps: ingest reads Spotify, and analyse enriches the tracks, then builds the profile, the popularity tier and the order. A failed run restarts on the next sign-in, and Start fresh is the only rerun of a completed one. The page never starts work on load: it only reads the status, streams tracks while ingest runs, and long-polls for results. Calls stop at 240 seconds, inside the 300-second Hobby limit, and tell the client to call again. Details are in [docs/adr/001-analysis-job.md](docs/adr/001-analysis-job.md), [docs/adr/004-analysis-flow.md](docs/adr/004-analysis-flow.md) and the diagrams in [docs/architecture/README.md](docs/architecture/README.md).

Spotify tokens are saved at the auth callback, the only moment Supabase Auth exposes them. Enrichment uses MusicBrainz (one request a second) and Deezer in parallel, caches results in `track_enrichment`, and covers up to 30 tracks per run so the first enrichment stays around a minute.

## AI workflow

Code computes the numbers; the model only interprets them. Signals in `lib/signals` (tag mix, tempo, overlap, concentration, repeats, release years and so on) feed trait scores for energy, variety, loyalty and nostalgia. The model never returns a score.

Prompts are versioned text blocks in `prompts/`, assembled by `lib/prompts/build.ts`, and each stored result keeps its template hash. The model is called through the Vercel AI SDK with a zod schema for structured output, via the AI Gateway (`AI_MODEL`, default `google/gemini-2.5-flash`). A second check rejects citations that aren't in the data and statistics that contradict it. Failures are fed back for up to three attempts, then the run records a typed error and stores nothing.

For the order, code maps tempo to a calorie budget, energy to beef or chicken, and the popularity tier to a dollar budget. The model picks items from the candidate set and explains each one, and code adds up calories and prices.

## Assumptions and limitations

- Recently played is one page of about 50 plays, and Spotify no longer gives new apps audio features, popularity or artist genres, so tempo and genre come from Deezer and MusicBrainz, which don't cover every track.
- Enrichment covers at most 30 tracks per run.
- Prices are indicative category prices, not McDonald's prices, and about 31 menu items with no nutrition data are left out.
- The Spotify app is in development mode, so at most five allowlisted people can sign in.
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
