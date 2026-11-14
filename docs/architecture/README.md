# Architecture

These diagrams follow the code as it runs now. `npm run diagrams` regenerates the SVG and PNG next to each `.mmd` file.

## Spotify login

The browser asks Next.js to start Spotify sign-in through Supabase Auth. The callback stores the provider tokens, checks Spotify's `/me` for the development-mode allowlist, and starts the workflow only when there is no run or the latest one errored. A running or complete run, including `insufficient_data`, is left alone.

<img alt="Spotify login" src="./spotify-login.svg" width="100%" />

```mermaid
flowchart TD
  browser["Browser: Sign in with Spotify"] --> login["Next.js GET /auth/login"]
  login --> oauth["Supabase Auth signInWithOAuth, provider Spotify, redirectTo origin/auth/callback"]
  oauth --> consent["Spotify OAuth consent"]
  consent --> supaCb["Spotify returns to Supabase /auth/v1/callback"]
  supaCb --> appCb["Browser lands on Next.js GET /auth/callback"]
  appCb --> oauthErr{"error param, or no code?"}
  oauthErr -->|allowlist wording| denied["/not-allowlisted"]
  oauthErr -->|anything else| deniedConsent["/?notice=consent-denied"]
  oauthErr -->|code present| exchange["Supabase exchangeCodeForSession"]
  exchange -->|no session, allowlist wording| denied
  exchange -->|no session| deniedConsent
  exchange -->|session| hasAccess{"provider access token?"}
  hasAccess -->|yes| save["Upsert spotdonalds.spotify_tokens: access, refresh, expiry, scopes"]
  save --> probe["Allowlist check: GET api.spotify.com/v1/me"]
  probe -->|403| signedOut["Sign out, then /not-allowlisted"]
  probe -->|200, or any other error| gate{"Latest analysis_runs row"}
  hasAccess -->|no access token, refresh token already stored| gate
  hasAccess -->|no access token and no refresh token| reauth["Sign out, then /?notice=reauth"]
  gate -->|no row, or status is error| kickoff["Close an open row if one exists, insert a run, start the Vercel Workflow"]
  gate -->|status running or complete| leave["Leave the run alone"]
  kickoff --> welcome["Redirect /app?welcome=1"]
  leave --> welcome
```

Source: [spotify-login.mmd](./spotify-login.mmd). PNG: [spotify-login.png](./spotify-login.png).

## Ingestion workflow

One Vercel Workflow has two steps. Ingest counts distinct tracks already in the database and only calls Spotify when that count is under 50. Fewer than 50 after the fetch ends the run as `insufficient_data`. Analyse then enriches the top 30 tracks, computes the signals in code, and asks the model for a taste profile, a popularity tier, and an order, each checked before it is stored.

<img alt="Ingestion workflow" src="./ingestion-workflow.svg" width="100%" />

```mermaid
flowchart TD
  start["start analysisWorkflow for this user and run"] --> ingest["Step ingest. maxRetries 2"]
  ingest --> own{"This workflow still owns the run?"}
  own -->|no| fatal["FatalError and stop. The row stays for a later read."]
  own -->|yes| enough{"Distinct tracks in plays union top tracks, 50 or more?"}
  enough -->|yes| remembered["Skip Spotify. Store the count on analysis_runs and continue."]
  enough -->|no| checkpoint{"Ingest checkpoint already done?"}
  checkpoint -->|no| fetch["Spotify: recently played, then top tracks and top artists for 4 weeks, 6 months and 1 year"]
  fetch --> written["Write artists, tracks, track_artists, plays, top_items, and the run checkpoint"]
  checkpoint -->|yes| recount{"Count still under 50?"}
  written --> recount
  recount -->|yes| short["analysis_runs: complete, done, outcome insufficient_data. Workflow stops."]
  recount -->|no| analyse
  remembered --> analyse["Step analyse. maxRetries 2"]
  analyse --> own2{"This workflow still owns the run?"}
  own2 -->|no| fatal
  own2 -->|yes| enrich["Enrich the top 30 tracks. MusicBrainz, one request a second. Deezer alongside. Cache in track_enrichment."]
  enrich --> profile["Code computes BPM and the other signals, then the taste-profile model. Validate. Up to 3 model tries. Write taste_profiles."]
  profile --> popularity["Popularity model for the top genres. Write genre_popularity."]
  popularity --> order["Order model picks menu items. Validate calories, spend and protein. Up to 3 model tries. Write orders."]
  order --> ready["analysis_runs: complete, done, outcome ready"]
  ingest -.-> trouble["A step throws"]
  analyse -.-> trouble
  trouble --> which{"Which failure?"}
  which -->|another worker owns the run| fatal
  which -->|Spotify token error, or this was the last attempt| errored["Write status error on analysis_runs, then FatalError"]
  which -->|any other error| again["RetryableError. Wait 15 seconds and run that step again. Stored pieces are skipped."]
```

Source: [ingestion-workflow.mmd](./ingestion-workflow.mmd). PNG: [ingestion-workflow.png](./ingestion-workflow.png).

## Signed-in page calls

Once `/app` is open, the page reads status, then tracks, then results. Tracks is an NDJSON stream only while the run is still on ingest, and one JSON body after that. Results holds the request for up to 240 seconds and answers 202 with `retry: true` when the run is still going, and the page asks again.

<img alt="Signed-in page calls" src="./frontend-calls.svg" width="100%" />

```mermaid
sequenceDiagram
  actor Person
  participant Page as /app
  participant Status as GET /api/analysis/status
  participant Tracks as GET /api/analysis/tracks
  participant Results as GET /api/analysis/results

  Person->>Page: Open the app, already signed in
  Note over Page: First paint is full-screen Loading. The status request itself shows the step list, spinner on Reading your history. A fresh sign-in also covers the page with Please drive through for about 3 seconds.
  Page->>Status: GET
  Note over Status: A running row with no workflow id, or a heartbeat older than 3 minutes, starts the workflow again.
  Status-->>Page: status, stage, outcome, trackCount
  Note over Page: The three steps show, with a spinner on the current one. A finished status drops the welcome line.
  alt running, stage ingest
    Page->>Tracks: GET, accept NDJSON
    loop Poll stored tracks each second, for up to 240 seconds
      Tracks-->>Page: NDJSON line, type tracks
    end
    alt 240 seconds elapsed
      Tracks-->>Page: type resume, plus a cursor
      Note over Page: Reconnecting, then the same GET with that cursor
    else ingest has finished, or the stage has moved on
      Tracks-->>Page: type done
    end
  else running, stage analyse
    Page->>Tracks: GET
    Tracks-->>Page: one JSON body of tracks and artists
  else complete, and the person opened the track list
    Page->>Tracks: GET
    Tracks-->>Page: one JSON body, and the steps read as finished
  else status error, or outcome insufficient_data
    Note over Page: Error screen, or the insufficient-data screen. Results is not called.
  else status none
    Note over Page: Nothing is running yet. Start fresh is offered.
  else complete, on the way to the order
    Note over Page: The track endpoint is skipped
  end
  opt track read finished, or the order path skipped tracks. Not the finished track list, and not an error or empty run.
    Note over Page: The taste step keeps its spinner for the whole results call
    Page->>Results: GET
    loop Read the run each second, for up to 240 seconds
      Results-->>Results: still running, so keep holding
    end
    alt still running when the hold ends
      Results-->>Page: 202 with retry true
      Page->>Results: GET again
    else outcome ready
      Results-->>Page: 200 with profile, order, menu and aggregates
      Note over Page: Results screen
    else outcome insufficient_data
      Results-->>Page: the track count
      Note over Page: Insufficient-data screen
    else status error
      Results-->>Page: the error message
      Note over Page: Try again, or Start fresh
    end
  end
```

Source: [frontend-calls.mmd](./frontend-calls.mmd). PNG: [frontend-calls.png](./frontend-calls.png).
