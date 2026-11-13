const NOTICES: Record<string, string> = {
  "consent-denied": "Spotify sign-in was cancelled.",
  reauth: "Spotify didn't share a token. Log in again to allow access.",
  "login-failed": "Spotify sign-in didn't start. Try again.",
};

export function Landing({ notice }: { notice?: string | null }) {
  const message = notice ? NOTICES[notice] : null;
  return (
    <main className="landing">
      <div className="landing-stack">
        {/* Outlined SVG wordmark. next/image does not optimise SVG without extra config. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wordmark" src="/brand/wordmark-yellow.svg" alt="SpotDonalds" />
        <p className="slogan">Your Spotify taste assembled as a drive-through order.</p>
        {message ? (
          <p className="notice" role="status">
            {message}
          </p>
        ) : null}
        <a className="button" href="/auth/login">
          Log in with Spotify
        </a>
      </div>
    </main>
  );
}
