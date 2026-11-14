import Link from "next/link";

export function NotAllowlisted() {
  return (
    <main className="denied">
      <section className="denied-card">
        <p className="eyebrow">Spotify development mode</p>
        <h1>This account isn&apos;t on the list.</h1>
        <p>
          SpotDonalds is in Spotify&apos;s development mode, so only a short list of accounts can
          sign in. Finishing consent still brings you here when the account isn&apos;t on that list.
        </p>
        <p className="contact">Ask Laurence Presland (laurencepresland@gmail.com) to add your Spotify email, then try again.</p>
        <Link className="button" href="/">
          Back to the start
        </Link>
      </section>
    </main>
  );
}
