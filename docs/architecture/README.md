# Architecture

These diagrams follow the code as it runs now. `npm run diagrams` regenerates the SVG and PNG next to each `.mmd` file.

## Spotify login

The browser signs in through the app and Supabase Auth. Spotify grants consent, the callback stores the tokens, and `/me` checks the allowlist. The workflow starts only when there is no run or the latest one errored.

<img alt="Spotify login" src="./spotify-login.svg" width="100%" />

```mermaid
sequenceDiagram
  actor Browser
  participant App
  participant Auth as Supabase Auth
  participant Spotify
  participant DB

  Browser->>App: Sign in
  App->>Auth: Start Spotify sign-in
  Auth->>Spotify: Ask for consent
  Spotify-->>Auth: Approved
  Auth-->>Browser: Back to the app
  Browser->>App: Callback
  App->>Auth: Exchange the code
  Auth-->>App: Session and tokens
  App->>DB: Store the tokens
  App->>Spotify: GET /me
  Spotify-->>App: Allowlisted
  App->>DB: Latest run
  alt no run, or the last one errored
    App->>App: Start the workflow
  else running or complete
    App->>App: Leave it
  end
  App-->>Browser: Open /app
  Note over Browser,Spotify: Consent refused, a missing token, or a 403 from /me sends the person away.
```

Source: [spotify-login.mmd](./spotify-login.mmd). PNG: [spotify-login.png](./spotify-login.png).

## Ingestion workflow

Ingest uses tracks already stored, and calls Spotify only when there are fewer than 50. Still short of 50 ends the run. Analyse enriches, computes the numbers, then asks the model for the profile and the order. A failed step waits 15 seconds and tries again. The last try writes status error.

<img alt="Ingestion workflow" src="./ingestion-workflow.svg" width="100%" />

```mermaid
flowchart TD
  count{"50 tracks stored?"} -->|yes| analyse
  count -->|no| fetch["Fetch from Spotify"]
  fetch --> still{"Still under 50?"}
  still -->|yes| short["insufficient_data"]
  still -->|no| analyse["Analyse"]
  analyse --> enrich["MusicBrainz and Deezer"]
  enrich --> stats["BPM and stats"]
  stats --> profile["LLM taste profile"]
  profile --> order["LLM order"]
  order --> done["Complete"]
  analyse -.-> fail{"Step fails?"}
  fail -->|retry| again["Wait 15s"]
  fail -->|last try| stop["status error"]
```

Source: [ingestion-workflow.mmd](./ingestion-workflow.mmd). PNG: [ingestion-workflow.png](./ingestion-workflow.png).

## Signed-in page calls

The page reads status, then tracks, then results. Tracks is a stream while ingest is still running, and one JSON body after that. Results holds for up to 240 seconds, then answers 202 so the page can ask again.

<img alt="Signed-in page calls" src="./frontend-calls.svg" width="100%" />

```mermaid
sequenceDiagram
  actor Browser
  participant Status as status
  participant Tracks as tracks
  participant Results as results

  Browser->>Status: GET /api/analysis/status
  Status-->>Browser: stage
  alt still ingesting
    Browser->>Tracks: GET /api/analysis/tracks
    Tracks-->>Browser: NDJSON stream
  else ingest done
    Browser->>Tracks: GET /api/analysis/tracks
    Tracks-->>Browser: one JSON body
  end
  Browser->>Results: GET /api/analysis/results
  alt still running after 240s
    Results-->>Browser: 202, retry
    Browser->>Results: Ask again
  else ready
    Results-->>Browser: profile and order
  end
  Note over Browser,Results: A spinner stays on the current step until results. A finished run can skip tracks.
```

Source: [frontend-calls.mmd](./frontend-calls.mmd). PNG: [frontend-calls.png](./frontend-calls.png).

