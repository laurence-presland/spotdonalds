export function createRateLimiter(
  intervalMs: number,
  deps: { now: () => number; sleep: (ms: number) => Promise<void> },
) {
  let nextAt = 0;
  return async function wait() {
    const time = deps.now();
    const delay = Math.max(0, nextAt - time);
    nextAt = Math.max(nextAt, time) + intervalMs;
    if (delay > 0) await deps.sleep(delay);
  };
}

export function musicbrainzUserAgent(): string {
  return process.env.MUSICBRAINZ_USER_AGENT || "SpotDonalds/0.1 (https://spotdonalds.vercel.app)";
}
