# SpotDonalds (aka MySubscriptions)

Sign in with Spotify, get a taste profile built from your listening, and a McDonald's order to match.

A fun, non-commercial take-home project. Not affiliated with McDonald's or Spotify.

**Status:** foundations. The product screens land in later tickets. See [docs/tickets/README.md](docs/tickets/README.md).

## Stack

- Next.js (App Router) and React, TypeScript, deployed on Vercel
- Supabase Postgres and Auth, schema `spotdonalds` (the `public` schema is not used)
- Vitest, ESLint, GitHub Actions

## Local setup

1. Use Node.js 22 or newer.
2. Install dependencies: `npm ci`
3. Copy `.env.example` to `.env.local` and fill in the values. Comments in `.env.example` say what each variable is. No real secrets belong in git.
4. Apply database migrations (see below).
5. `npm run dev` and open http://localhost:3000

### Environment variables

| Variable | Where it runs |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server |
| `SUPABASE_SECRET_KEY` | Server only |
| `SUPABASE_DB_SCHEMA` | Server. Use `spotdonalds`. |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |

## Authentication

Sign-in is Spotify only, through Supabase Auth. The landing page sends the browser to `/auth/login`, which starts OAuth with an explicit `redirectTo` of `{origin}/auth/callback`. Do not rely on the Supabase Site URL (`http://localhost:3000`).

Scopes: `user-read-email`, `user-read-recently-played`, `user-top-read`.

The Spotify dashboard redirect URI is Supabase's callback, and it has to match exactly:

`https://svukzdmlzjebdizvulku.supabase.co/auth/v1/callback`

Supabase's additional redirect allow list (where we send the user after the code exchange) needs:

- `https://spotdonalds.vercel.app/**`
- `https://spotdonalds-*-laurencepresland-5642s-projects.vercel.app/**`
- `http://localhost:3000/**`

The Spotify app is in development mode: at most five allowlisted users, and the owner needs Premium. A user who is not on that list sees `/not-allowlisted` instead of an error page. Denying consent returns to the landing page with a short message.

Spotify's access and refresh tokens are written to `spotdonalds.spotify_tokens` during the callback (the only moment Supabase exposes them) and are read with the server secret key. The table has RLS enabled and no policies for `anon` or `authenticated`, so the publishable key cannot read it. Nothing in the browser bundle receives those tokens.

Refresh uses `POST https://accounts.spotify.com/api/token`. Set `SPOTIFY_CLIENT_SECRET` on the server (the same secret Supabase Auth already has). `SPOTIFY_CLIENT_ID` defaults to the public client id if unset.

## Database migrations

SQL lives in `supabase/migrations/` and is idempotent. From a machine logged into the Supabase CLI:

```bash
supabase link --project-ref svukzdmlzjebdizvulku
supabase db push
```

Then add `spotdonalds` to the project's exposed Data API schemas (Supabase dashboard → Project Settings → API → Exposed schemas). The app queries that schema explicitly (`db: { schema: 'spotdonalds' }`). Do not apply these migrations to the `public` schema.

`GET /api/health` returns `{ "ok": true }` only when it can read `spotdonalds.healthcheck`.

## Architecture

Placeholder. The analysis pipeline (ingest, enrich, taste profile, order) and the four screens are specified in `docs/tickets/`.

## AI

Placeholder. Taste profile and order generation use the Vercel AI SDK with structured output. Numbers are computed in code. The model interprets them.

## Limitations

Placeholder. See the ticket index for known limits (Spotify development mode, shallow listening history, MusicBrainz rate limit, no national menu prices).
