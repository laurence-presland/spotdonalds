# 02: Authentication and login UI

**Size:** M · **Depends on:** 01

## Summary / goal
Let a user sign in with Spotify via Supabase Auth, keep their Spotify tokens server-side and refreshed, protect the app's routes, and let them log out. The unauthenticated front page is a branded landing only. Includes the friendly failure screen for users who aren't allowlisted.

## Context
Authentication is an explicit evaluation criterion, and Spotify is the single connected service, so sign-in and service connection are the same step. Spotify apps in development mode allow a maximum of 5 users, each added by name and Spotify email under User Management in the Developer Dashboard, and the app owner needs Premium. A user who isn't on the list gets a 403 from the API. That has to look intentional, not broken.

The landing page is the first thing a reviewer sees. Keep it spare: branding and a way in, nothing else. What happens after a successful login (welcome, analysing, results) is the screen flow in 13.

## In scope
- Supabase Auth with the Spotify provider. Request only the scopes we need: `user-read-email`, `user-read-recently-played`, `user-top-read`.
- Auth callback route that captures the provider access and refresh tokens at sign-in (Supabase only exposes them on that first session) and stores them server-side in a table protected by RLS, not in the browser.
- A token helper that returns a valid access token for a user, refreshing against Spotify's token endpoint when expired and persisting the new tokens (refresh rotation handled).
- Session handling with `@supabase/ssr`, a middleware/guard that protects app routes, and a logout action.
- Landing page for unauthenticated users only: wordmark and icon from `assets/`, the slogan "Your Spotify taste, served as a drive-thru order.", and a "Log in with Spotify" button. No extra marketing sections. A single quiet line under the button about what data is read is fine; don't clutter it.
- "Not allowlisted" / access-denied screen: explains the app is in Spotify's development mode with a limited user list, and how to request access (contact line, filled in by 12). This screen still applies after a completed consent that then fails the allowlist.
- Handling of denied consent and revoked tokens (send the user back to the landing page with a clear message).
- After a successful login, redirect into the authenticated app. 13 owns the welcome → analysing → results journey; this ticket just hands off to a protected route.

## Out of scope
- Any data fetching beyond verifying the token works (03).
- The welcome transition, analysing screen and results screen (13, 05).
- Other providers, email/password sign-in.
- Allowlisting reviewers (12, done manually in the Spotify dashboard).

## Acceptance criteria
- [ ] An unauthenticated visit to the front page shows only the branded landing (wordmark/icon, the slogan above, "Log in with Spotify") and does not reveal any user data.
- [ ] An allowlisted Spotify user can sign in from the landing page and is redirected to a protected route (the screen they see next is 13).
- [ ] Unauthenticated requests to protected pages and API routes are redirected to the landing page (pages) or get 401 (API).
- [ ] Spotify tokens are never sent to or readable by the browser, and the token table is unreadable with the anon key (RLS verified by a test or documented manual check).
- [ ] An expired access token is refreshed transparently and the new expiry is stored; a unit test covers the refresh path with the Spotify endpoint stubbed.
- [ ] A non-allowlisted account that completes Spotify consent ends on the friendly access screen, not an error page.
- [ ] Denying consent returns the user to the landing page with a message.
- [ ] Logout clears the session and redirects to the landing page.
- [ ] Auth events are logged (without tokens or emails).
- [ ] `.env.example` and the Spotify redirect URIs for local and Vercel are documented.

## Technical notes
- Redirect URI registered in the Spotify dashboard must match Supabase's callback URL exactly; document local and production values.
- Because Supabase doesn't refresh provider tokens for us, the refresh logic is ours. Treat the token table as the source of truth.
- Spotify email can be absent or differ from the allowlist email; don't use it as a key, use the Supabase user id.
- Unclear whether Supabase Auth surfaces Spotify's 403-for-non-allowlisted at login or only on the first API call. Test it with a non-allowlisted account and handle both.
- Use the committed assets in `assets/` (wordmark and the yellow-S-on-charcoal icon). Don't invent a second set of marks.

## Dependencies
01. Needs a Spotify developer app (owner is Premium) and the redirect URIs configured.

## Open questions
- Does a non-allowlisted user fail at consent time or on the first API call? Determines where the access screen is triggered.
- Does Supabase return the provider refresh token reliably for Spotify on every sign-in, or only the first? Decide whether to force re-consent when ours is missing.
