/** Backoff delay, in ms, before the next stream reconnect attempt. */
export function reconnectDelay(attempt: number): number {
  return Math.min(8_000, 400 * 2 ** attempt);
}
